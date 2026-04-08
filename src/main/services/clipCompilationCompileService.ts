// src/main/services/clipCompilationCompileService.ts
// Compile clip compilation videos using FFmpeg concat demuxer (stream copy)
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { sanitizeFilename } from '../../common/setUtils';

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const ffmpegPath: string = (require('ffmpeg-static') as string).replace(
  'app.asar',
  'app.asar.unpacked',
);

function repoRootDir(): string {
  return path.join(os.homedir(), 'project-flippi');
}

export interface ClipCompilationCompileProgress {
  compilationId: string;
  percent: number;
  status: 'compiling' | 'done' | 'error';
  filePath?: string;
  error?: string;
}

/**
 * Compile clip compilation videos into a single file using FFmpeg concat
 * demuxer with stream copy (no re-encoding).
 */
export async function compileClipCompilationVideo(
  eventName: string,
  compilationId: string,
  compilationTitle: string,
  clipOutputPaths: string[],
  onProgress: (progress: ClipCompilationCompileProgress) => void,
): Promise<string> {
  if (clipOutputPaths.length === 0) {
    throw new Error('No clip video files in this compilation');
  }

  onProgress({ compilationId, percent: 0, status: 'compiling' });

  // Verify all files exist
  await Promise.all(
    clipOutputPaths.map(async (fp) => {
      try {
        await fs.access(fp);
      } catch {
        throw new Error(`Clip video file not found: ${fp}`);
      }
    }),
  );

  // Prepare output directory
  const eventDir = path.join(repoRootDir(), 'Event', eventName);
  const compilationsDir = path.join(eventDir, 'videos', 'compilations');
  await fs.mkdir(compilationsDir, { recursive: true });

  // Build output filename from compilation title
  const sanitized = sanitizeFilename(
    compilationTitle || `compilation-${compilationId.slice(0, 8)}`,
  );
  const outputPath = path.join(compilationsDir, `${sanitized}.mp4`);

  // Write concat list to temp file
  const concatListPath = path.join(
    compilationsDir,
    `.concat-${compilationId}.txt`,
  );
  const concatContent = clipOutputPaths
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

    onProgress({
      compilationId,
      percent: 100,
      status: 'done',
      filePath: outputPath,
    });
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
 * Rename a compiled compilation video to match the current title.
 * Returns the new file path, or the current path if no rename is needed.
 */
export async function renameClipCompilationVideo(
  currentPath: string,
  newTitle: string,
): Promise<string> {
  const newFilename = `${sanitizeFilename(newTitle)}.mp4`;
  const newPath = path.join(path.dirname(currentPath), newFilename);

  if (newPath === currentPath) {
    return currentPath;
  }

  try {
    await fs.access(currentPath);
  } catch {
    throw new Error(`Video file not found: ${currentPath}`);
  }

  try {
    await fs.access(newPath);
    throw new Error(
      `A video file with this name already exists: ${newFilename}`,
    );
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }

  await fs.rename(currentPath, newPath);
  return newPath;
}
