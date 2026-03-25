// src/main/services/replayClipService.ts
// Replay clip management — import from Clippi replay processor JSON,
// preview, edit metadata, and create clip videos via FFmpeg.
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import log from 'electron-log';
import type {
  ReplayClip,
  ReplayClipEntry,
  ReplayProcessorJson,
  SlpGameData,
} from '../../common/meleeTypes';
import { getEventDb } from '../database/db';
import { rowToReplayClip } from '../database/eventDbHelpers';
import { parseSlpFileAsync } from './slpParserService';
import { getCached, upsertEntry } from '../database/metadataCache';

// ffmpeg-static exports the path to the bundled ffmpeg binary
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegPath: string = require('ffmpeg-static');

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function repoRootDir(): string {
  return path.join(os.homedir(), 'project-flippi');
}

function getClipsDir(eventName: string): string {
  return path.join(repoRootDir(), 'Event', eventName, 'videos', 'clips');
}

// ---------------------------------------------------------------------------
// SLP → Video resolution via game_pairings
// ---------------------------------------------------------------------------

function resolveVideoPath(eventName: string, slpPath: string): string | null {
  const db = getEventDb(eventName);

  // Try exact path match first
  const exact = db
    .prepare<
      [string],
      { video_path: string }
    >('SELECT video_path FROM game_pairings WHERE slp_path = ?')
    .get(slpPath);
  if (exact) return exact.video_path;

  // Fallback: match by SLP filename (handles path differences between
  // the JSON's absolute paths and the configured SLP data folder)
  const basename = path.basename(slpPath);
  const rows = db
    .prepare<
      [],
      { video_path: string; slp_path: string | null }
    >('SELECT video_path, slp_path FROM game_pairings WHERE slp_path IS NOT NULL')
    .all();

  const match = rows.find(
    (row) => row.slp_path && path.basename(row.slp_path) === basename,
  );
  return match ? match.video_path : null;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportResult {
  ok: boolean;
  imported: number;
  unresolved: number;
  duplicateSkipped: number;
  message: string;
}

export async function importReplayClips(
  eventName: string,
  jsonFilePath: string,
): Promise<ImportResult> {
  const raw = await fs.readFile(jsonFilePath, 'utf-8');
  const json: ReplayProcessorJson = JSON.parse(raw);

  if (!json.queue || !Array.isArray(json.queue) || json.queue.length === 0) {
    return {
      ok: true,
      imported: 0,
      unresolved: 0,
      duplicateSkipped: 0,
      message: 'No clips found in JSON.',
    };
  }

  const db = getEventDb(eventName);
  const importFile = path.basename(jsonFilePath);
  const now = new Date().toISOString();

  let imported = 0;
  let unresolved = 0;
  let duplicateSkipped = 0;

  // Check for existing duplicates
  const checkDup = db.prepare<[string, number, number], { id: string }>(
    'SELECT id FROM replay_clips WHERE slp_path = ? AND start_frame = ? AND end_frame = ?',
  );

  const insert = db.prepare(
    `INSERT INTO replay_clips (
      id, import_file, slp_path, video_path,
      start_frame, end_frame, start_seconds, end_seconds,
      title, description, output_path, removed, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', NULL, 0, ?)`,
  );

  const batchInsert = db.transaction(() => {
    json.queue.forEach((item) => {
      // Check duplicate
      const existing = checkDup.get(item.path, item.startFrame, item.endFrame);
      if (existing) {
        duplicateSkipped += 1;
        return;
      }

      const videoPath = resolveVideoPath(eventName, item.path);
      if (!videoPath) {
        unresolved += 1;
      }

      const startSeconds = Math.max(0, item.startFrame) / 60;
      const endSeconds = item.endFrame / 60;

      insert.run(
        randomUUID(),
        importFile,
        item.path,
        videoPath,
        item.startFrame,
        item.endFrame,
        startSeconds,
        endSeconds,
        now,
      );

      imported += 1;
    });
  });

  batchInsert();

  log.info(
    `[replayClips] Imported ${imported} clips for ${eventName} (${unresolved} unresolved, ${duplicateSkipped} skipped)`,
  );

  return {
    ok: true,
    imported,
    unresolved,
    duplicateSkipped,
    message:
      `Imported ${imported} clips. ${unresolved > 0 ? `${unresolved} clips have no paired video.` : ''} ${duplicateSkipped > 0 ? `${duplicateSkipped} duplicates skipped.` : ''}`.trim(),
  };
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function getReplayClips(eventName: string): ReplayClip[] {
  const db = getEventDb(eventName);
  const rows = db
    .prepare<
      [],
      any
    >('SELECT * FROM replay_clips ORDER BY created_at, slp_path, start_frame')
    .all();
  return rows.map(rowToReplayClip);
}

export async function getReplayClipEntries(
  eventName: string,
): Promise<ReplayClipEntry[]> {
  const clips = getReplayClips(eventName);

  // Parse unique SLP files (with cache)
  const slpDataMap = new Map<string, SlpGameData | null>();
  const uniqueSlpPaths = [...new Set(clips.map((c) => c.slpPath))];

  const parseResults = await Promise.all(
    uniqueSlpPaths.map(async (slpPath) => {
      try {
        const stat = await fs.stat(slpPath);
        const cached = getCached(slpPath, stat.mtimeMs, stat.size);
        if (cached) {
          return { slpPath, data: cached };
        }
        const data = await parseSlpFileAsync(slpPath);
        if (data) {
          upsertEntry(slpPath, stat.mtimeMs, stat.size, data);
        }
        return { slpPath, data };
      } catch {
        return { slpPath, data: null };
      }
    }),
  );
  parseResults.forEach(({ slpPath, data }) => {
    slpDataMap.set(slpPath, data);
  });

  return clips.map((clip) => ({
    clip,
    slpGameData: slpDataMap.get(clip.slpPath) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export function updateReplayClip(
  eventName: string,
  clipId: string,
  updates: { title?: string; description?: string },
): { ok: boolean } {
  const db = getEventDb(eventName);
  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.title !== undefined) {
    setClauses.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    values.push(updates.description);
  }

  if (setClauses.length === 0) return { ok: true };

  values.push(clipId);
  const result = db
    .prepare(`UPDATE replay_clips SET ${setClauses.join(', ')} WHERE id = ?`)
    .run(...values);

  return { ok: result.changes > 0 };
}

// ---------------------------------------------------------------------------
// Remove / Restore / Delete
// ---------------------------------------------------------------------------

export function removeReplayClip(eventName: string, clipId: string): void {
  const db = getEventDb(eventName);
  db.prepare('UPDATE replay_clips SET removed = 1 WHERE id = ?').run(clipId);
}

export function restoreReplayClip(eventName: string, clipId: string): void {
  const db = getEventDb(eventName);
  db.prepare('UPDATE replay_clips SET removed = 0 WHERE id = ?').run(clipId);
}

export async function deleteReplayClip(
  eventName: string,
  clipId: string,
): Promise<void> {
  const db = getEventDb(eventName);
  const row = db
    .prepare<
      [string],
      { output_path: string | null }
    >('SELECT output_path FROM replay_clips WHERE id = ?')
    .get(clipId);

  if (row?.output_path) {
    try {
      await fs.unlink(row.output_path);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        log.warn(`[replayClips] Could not delete clip file: ${err.message}`);
      }
    }
  }

  db.prepare('DELETE FROM replay_clips WHERE id = ?').run(clipId);
}

// ---------------------------------------------------------------------------
// FFmpeg clip video creation
// ---------------------------------------------------------------------------

export interface ClipCreateProgress {
  clipId: string;
  current: number;
  total: number;
  status: 'creating' | 'done' | 'error';
  outputPath?: string;
  error?: string;
}

async function createClipVideoFile(
  clip: ReplayClip,
  clipsDir: string,
): Promise<string> {
  if (!clip.videoPath) {
    throw new Error('No paired video for this clip');
  }

  await fs.access(clip.videoPath);
  await fs.mkdir(clipsDir, { recursive: true });

  const outputPath = path.join(clipsDir, `clip-${clip.id.slice(0, 8)}.mp4`);

  const duration = clip.endSeconds - clip.startSeconds;

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-y',
      '-ss',
      String(clip.startSeconds),
      '-i',
      clip.videoPath!,
      '-t',
      String(duration),
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-preset',
      'fast',
      '-c:a',
      'aac',
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

  return outputPath;
}

export async function createClipVideos(
  eventName: string,
  onProgress: (progress: ClipCreateProgress) => void,
): Promise<{ created: number; skipped: number; failed: number }> {
  const db = getEventDb(eventName);
  const clipsDir = getClipsDir(eventName);

  const rows = db
    .prepare<
      [],
      any
    >('SELECT * FROM replay_clips WHERE removed = 0 AND output_path IS NULL AND video_path IS NOT NULL ORDER BY created_at')
    .all();
  const clips = rows.map(rowToReplayClip);

  let created = 0;
  let failed = 0;
  const total = clips.length;

  // Sequential FFmpeg processing — each clip must complete before the next starts
  // eslint-disable-next-line no-restricted-syntax
  for (let i = 0; i < clips.length; i += 1) {
    const clip = clips[i];
    onProgress({
      clipId: clip.id,
      current: i + 1,
      total,
      status: 'creating',
    });

    try {
      // eslint-disable-next-line no-await-in-loop
      const outputPath = await createClipVideoFile(clip, clipsDir);
      db.prepare('UPDATE replay_clips SET output_path = ? WHERE id = ?').run(
        outputPath,
        clip.id,
      );
      created += 1;
      onProgress({
        clipId: clip.id,
        current: i + 1,
        total,
        status: 'done',
        outputPath,
      });
    } catch (err: any) {
      failed += 1;
      log.error(
        `[replayClips] Failed to create clip ${clip.id}: ${err.message}`,
      );
      onProgress({
        clipId: clip.id,
        current: i + 1,
        total,
        status: 'error',
        error: err.message,
      });
    }
  }

  // Clips already created are implicitly skipped (not in query)
  const allCount = db
    .prepare<
      [],
      { cnt: number }
    >('SELECT COUNT(*) as cnt FROM replay_clips WHERE removed = 0')
    .get();
  const skipped = (allCount?.cnt ?? 0) - created - failed;

  return { created, skipped, failed };
}

export async function createSingleClipVideo(
  eventName: string,
  clipId: string,
): Promise<string> {
  const db = getEventDb(eventName);
  const clipsDir = getClipsDir(eventName);

  const row = db
    .prepare<[string], any>('SELECT * FROM replay_clips WHERE id = ?')
    .get(clipId);
  if (!row) throw new Error('Clip not found');

  const clip = rowToReplayClip(row);
  if (clip.outputPath) return clip.outputPath;

  const outputPath = await createClipVideoFile(clip, clipsDir);
  db.prepare('UPDATE replay_clips SET output_path = ? WHERE id = ?').run(
    outputPath,
    clipId,
  );

  return outputPath;
}
