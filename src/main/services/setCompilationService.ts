import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import log from 'electron-log';
import { sanitizeFilename } from '../../common/setUtils';

// ffmpeg-static exports the path to the bundled ffmpeg binary
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegPath: string = require('ffmpeg-static');

function repoRootDir(): string {
  return path.join(os.homedir(), 'project-flippi');
}

export interface CompileProgress {
  setId: string;
  percent: number;
  status: 'compiling' | 'done' | 'error';
  filePath?: string;
  error?: string;
}

/**
 * Compile set videos into a single file using FFmpeg concat demuxer
 * with stream copy (no re-encoding).
 */
export async function compileSetVideo(
  eventName: string,
  setId: string,
  setTitle: string,
  videoFilePaths: string[],
  onProgress: (progress: CompileProgress) => void,
): Promise<string> {
  if (videoFilePaths.length === 0) {
    throw new Error('No video files in this set');
  }

  // Emit immediate progress so the UI is responsive
  onProgress({ setId, percent: 0, status: 'compiling' });

  // Verify all files exist
  await Promise.all(
    videoFilePaths.map(async (fp) => {
      try {
        await fs.access(fp);
      } catch {
        throw new Error(`Video file not found: ${fp}`);
      }
    }),
  );

  // Prepare output directory
  const eventDir = path.join(repoRootDir(), 'Event', eventName);
  const setsDir = path.join(eventDir, 'videos', 'sets');
  await fs.mkdir(setsDir, { recursive: true });

  // Build output filename from set title
  const sanitized = sanitizeFilename(setTitle);
  const outputPath = path.join(setsDir, `${sanitized}.mp4`);

  // Write concat list to temp file
  const concatListPath = path.join(setsDir, `.concat-${setId}.txt`);
  const concatContent = videoFilePaths
    .map((fp) => `file '${fp.replace(/'/g, "'\\''")}'`)
    .join('\n');
  await fs.writeFile(concatListPath, concatContent, 'utf-8');

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatListPath,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        outputPath,
      ]);

      let stderr = '';
      proc.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(
            new Error(`FFmpeg failed (code ${code}): ${stderr.slice(-500)}`),
          );
        } else {
          resolve();
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start FFmpeg: ${err.message}`));
      });
    });

    onProgress({ setId, percent: 100, status: 'done', filePath: outputPath });
    return outputPath;
  } finally {
    // Clean up temp concat list
    try {
      await fs.unlink(concatListPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Rename a compiled set video to match the current set title.
 * Returns the new file path, or the current path if no rename is needed.
 */
export async function renameSetVideo(
  currentPath: string,
  newTitle: string,
): Promise<string> {
  const newFilename = `${sanitizeFilename(newTitle)}.mp4`;
  const newPath = path.join(path.dirname(currentPath), newFilename);

  if (newPath === currentPath) {
    return currentPath;
  }

  // Check source exists
  try {
    await fs.access(currentPath);
  } catch {
    throw new Error(`Video file not found: ${currentPath}`);
  }

  // Check destination doesn't already exist
  try {
    await fs.access(newPath);
    throw new Error(
      `A video file with this name already exists: ${newFilename}`,
    );
  } catch (err: any) {
    // ENOENT means destination doesn't exist — that's what we want
    if (err.code !== 'ENOENT') throw err;
  }

  // Retry on EBUSY/EPERM — Chromium may take a moment to release
  // the file handle after the video element is cleared.
  // eslint-disable-next-line no-await-in-loop -- sequential retries are intentional
  return (async () => {
    const maxRetries = 5;
    const retryDelayMs = 300;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await fs.rename(currentPath, newPath);
        return newPath;
      } catch (err: any) {
        if (
          (err.code === 'EBUSY' || err.code === 'EPERM') &&
          attempt < maxRetries - 1
        ) {
          log.info(
            `[sets] File busy, retrying rename (${attempt + 1}/${maxRetries})...`,
          );
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => {
            setTimeout(resolve, retryDelayMs);
          });
        } else {
          throw err;
        }
      }
    }
    // Should never reach here, but satisfy TypeScript
    return newPath;
  })();
}
