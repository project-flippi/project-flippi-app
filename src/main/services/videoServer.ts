/**
 * Local HTTP server for streaming video files to the renderer.
 *
 * Replaces the custom `local-file://` Electron protocol handler which caused
 * Chromium to hold file handles indefinitely (EBUSY on Windows). With HTTP,
 * Node.js controls the file descriptors via `fs.createReadStream()` and
 * releases them when the response ends or the client disconnects.
 *
 * Security measures:
 * - Binds to 127.0.0.1 only (loopback, no network exposure)
 * - Per-session secret token required on every request
 * - Symlink-resolving path validation (realpathSync) to prevent traversal
 * - Only serves files under ~/project-flippi/Event/
 */
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import os from 'os';
import log from 'electron-log';

let server: http.Server | null = null;
let boundPort = 0;
let sessionToken = '';

/** The root directory that the server is allowed to serve files from. */
function allowedRoot(): string {
  return path.join(os.homedir(), 'project-flippi', 'Event');
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mkv':
      return 'video/x-matroska';
    case '.avi':
      return 'video/x-msvideo';
    case '.mov':
      return 'video/quicktime';
    default:
      return 'application/octet-stream';
  }
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  // Parse the requested file path from the query string
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${boundPort}`);
  if (url.pathname !== '/video') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // Validate per-session secret token
  if (url.searchParams.get('token') !== sessionToken) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const requestedPath = url.searchParams.get('path');
  if (!requestedPath) {
    res.writeHead(400);
    res.end('Missing path parameter');
    return;
  }

  // Security: resolve symlinks to get the real path, then verify it's
  // under the allowed root. realpathSync throws on non-existent paths.
  let realPath: string;
  try {
    realPath = fs.realpathSync(path.resolve(requestedPath));
  } catch {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  let root: string;
  try {
    root = fs.realpathSync(allowedRoot());
  } catch {
    // Event directory doesn't exist yet
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  if (!realPath.startsWith(root + path.sep)) {
    log.warn(
      `[videoServer] Blocked request for path outside allowed root: ${realPath}`,
    );
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Stat the file
  let stat: fs.Stats;
  try {
    stat = await fsPromises.stat(realPath);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    log.error(`[videoServer] stat error: ${err.message}`);
    res.writeHead(500);
    res.end('Internal Server Error');
    return;
  }

  if (!stat.isFile()) {
    res.writeHead(400);
    res.end('Not a file');
    return;
  }

  const totalSize = stat.size;
  const contentType = getMimeType(realPath);
  const rangeHeader = req.headers.range;

  if (rangeHeader) {
    // Parse Range header: "bytes=start-end"
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      res.writeHead(416, {
        'Content-Range': `bytes */${totalSize}`,
      });
      res.end();
      return;
    }

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

    if (start >= totalSize || end >= totalSize || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${totalSize}`,
      });
      res.end();
      return;
    }

    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Type': contentType,
      'Content-Length': chunkSize,
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(realPath, { start, end });
    stream.pipe(res);

    // Ensure the file handle is released if the client disconnects
    res.on('close', () => {
      stream.destroy();
    });
  } else {
    // No Range header — serve the full file
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': totalSize,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(realPath);
    stream.pipe(res);

    res.on('close', () => {
      stream.destroy();
    });
  }
}

/**
 * Start the video server, binding to a random available port on localhost.
 * Returns the port number.
 */
export async function startVideoServer(): Promise<number> {
  sessionToken = crypto.randomBytes(32).toString('hex');

  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        log.error(`[videoServer] Unhandled error: ${err.message}`);
        if (!res.headersSent) {
          res.writeHead(500);
        }
        res.end('Internal Server Error');
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address();
      if (addr && typeof addr === 'object') {
        boundPort = addr.port;
        log.info(`[videoServer] Listening on http://127.0.0.1:${boundPort}`);
        resolve(boundPort);
      } else {
        reject(new Error('Failed to get server address'));
      }
    });

    server.on('error', (err) => {
      log.error(`[videoServer] Server error: ${err.message}`);
      reject(err);
    });
  });
}

/** Stop the video server. */
export function stopVideoServer(): void {
  if (server) {
    server.close();
    server = null;
    boundPort = 0;
    sessionToken = '';
    log.info('[videoServer] Stopped');
  }
}

/** Get the port the video server is bound to. */
export function getVideoServerPort(): number {
  return boundPort;
}

/** Get the per-session secret token. */
export function getVideoServerToken(): string {
  return sessionToken;
}
