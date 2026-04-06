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
import type {
  RecordingTransforms,
  SourceTransform,
} from '../../common/obsTransformTypes';
import { getEventDb } from '../database/db';
import { rowToReplayClip } from '../database/eventDbHelpers';
import { parseSlpFileAsync } from './slpParserService';
import { getCached, upsertEntry } from '../database/metadataCache';

// ffmpeg-static exports the path to the bundled ffmpeg binary.
// In packaged Electron builds the binary lives in app.asar.unpacked but the
// resolved path still references app.asar, so we fix it up at runtime.
// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const ffmpegPath: string = (require('ffmpeg-static') as string).replace(
  'app.asar',
  'app.asar.unpacked',
);

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
// Recording transform helpers
// ---------------------------------------------------------------------------

function getRecordingTransforms(
  eventName: string,
  videoPath: string,
): RecordingTransforms | null {
  const db = getEventDb(eventName);
  let row = db
    .prepare<
      [string],
      {
        scene_name: string;
        game_capture_source: string;
        game_capture_transform: string;
        player_camera_source: string;
        player_camera_transform: string;
        captured_at: string;
      }
    >('SELECT * FROM recording_transforms WHERE video_path = ?')
    .get(videoPath);

  // Fallback: match by filename when exact path differs (e.g. different user
  // profiles, forward vs back slashes, or the DB was copied between machines).
  if (!row) {
    const basename = path.basename(videoPath);
    const allRows = db
      .prepare<
        [],
        {
          video_path: string;
          scene_name: string;
          game_capture_source: string;
          game_capture_transform: string;
          player_camera_source: string;
          player_camera_transform: string;
          captured_at: string;
        }
      >('SELECT * FROM recording_transforms')
      .all();
    row = allRows.find(
      (r) => path.basename(r.video_path.replace(/\//g, path.sep)) === basename,
    );
  }

  if (!row) return null;

  const parseTransform = (json: string): SourceTransform | null => {
    try {
      const obj = JSON.parse(json);
      if (!obj || Object.keys(obj).length === 0) return null;
      return obj as SourceTransform;
    } catch {
      return null;
    }
  };

  return {
    sceneName: row.scene_name,
    gameCaptureSource: row.game_capture_source,
    gameCaptureTransform: parseTransform(row.game_capture_transform),
    playerCameraSource: row.player_camera_source,
    playerCameraTransform: parseTransform(row.player_camera_transform),
    capturedAt: row.captured_at,
  };
}

/** Round down to the nearest even number (FFmpeg requires even dimensions). */
function roundEven(n: number): number {
  const v = Math.floor(n);
  return v % 2 === 0 ? v : v - 1;
}

/**
 * Resolve the top-left position on the OBS canvas given a position point and
 * OBS alignment flags. OBS alignment is a bitfield:
 *   0 = center, 1 = left, 2 = right, 4 = top, 8 = bottom
 * The position point is the anchor described by the alignment — e.g.
 * alignment 5 (top-left) means position IS the top-left corner, while
 * alignment 0 (center) means position is the center of the bounding box.
 */
function resolveTopLeft(
  posX: number,
  posY: number,
  w: number,
  h: number,
  alignment: number,
): { x: number; y: number } {
  // Horizontal: 1 = left (position is left edge), 2 = right, 0 = center
  // eslint-disable-next-line no-bitwise
  const hFlag = alignment & 3; // bits 0-1
  // eslint-disable-next-line no-bitwise
  const vFlag = alignment & 12; // bits 2-3

  let x = posX;
  if (hFlag === 2) {
    x = posX - w; // right-aligned
  } else if (hFlag === 0) {
    x = posX - w / 2; // center
  }

  // Vertical: 4 = top (position is top edge), 8 = bottom, 0 = center
  let y = posY;
  if (vFlag === 8) {
    y = posY - h; // bottom-aligned
  } else if (vFlag === 0) {
    y = posY - h / 2; // center
  }

  return { x, y };
}

/**
 * Convert an OBS SourceTransform into FFmpeg crop parameters.
 *
 * OBS bounds types control how a source is constrained on the canvas:
 * - OBS_BOUNDS_NONE: raw width/height, no constraining
 * - OBS_BOUNDS_STRETCH / SCALE_INNER / SCALE_OUTER / SCALE_TO_WIDTH /
 *   SCALE_TO_HEIGHT / MAX_ONLY: the visible area is the bounds rectangle
 *   (boundsWidth × boundsHeight) at (positionX, positionY).
 *
 * When bounds are active, the raw width/height may exceed the bounds (e.g.
 * 2568×1440 for a source scaled to fill a 1920×1080 bounding box). The
 * recorded video only contains canvas pixels, so we use the bounds as the
 * visible rect when applicable, then clamp to canvas dimensions.
 *
 * The alignment field controls which point of the bounding box the position
 * refers to (top-left, center, etc.).
 */
function computeCropRect(
  t: SourceTransform,
  canvasW = 1920,
  canvasH = 1080,
): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  let visibleW: number;
  let visibleH: number;

  if (t.boundsType && t.boundsType !== 'OBS_BOUNDS_NONE') {
    // Bounds are active — the visible area on canvas is the bounds rectangle
    visibleW = t.boundsWidth;
    visibleH = t.boundsHeight;
  } else {
    // No bounds — use raw rendered size, accounting for source-level crops
    const scaleX = t.sourceWidth > 0 ? t.width / t.sourceWidth : 1;
    const scaleY = t.sourceHeight > 0 ? t.height / t.sourceHeight : 1;
    visibleW = t.width - (t.cropLeft + t.cropRight) * scaleX;
    visibleH = t.height - (t.cropTop + t.cropBottom) * scaleY;
  }

  // Resolve position to top-left corner based on alignment
  const topLeft = resolveTopLeft(
    t.positionX,
    t.positionY,
    visibleW,
    visibleH,
    t.alignment,
  );

  // Clamp to canvas — the recorded video only contains canvas pixels
  const x = Math.max(0, topLeft.x);
  const y = Math.max(0, topLeft.y);
  const right = Math.min(canvasW, topLeft.x + visibleW);
  const bottom = Math.min(canvasH, topLeft.y + visibleH);
  const w = right - x;
  const h = bottom - y;

  log.info(
    `[replayClips] computeCropRect: boundsType=${t.boundsType} align=${t.alignment} visible=${visibleW}x${visibleH} pos=(${t.positionX},${t.positionY}) topLeft=(${topLeft.x},${topLeft.y}) -> crop (${x},${y} ${w}x${h})`,
  );

  return {
    x: roundEven(Math.max(0, x)),
    y: roundEven(Math.max(0, y)),
    w: roundEven(Math.max(2, w)),
    h: roundEven(Math.max(2, h)),
  };
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
  updates: {
    title?: string;
    description?: string;
    startSeconds?: number;
    endSeconds?: number;
  },
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
  if (updates.startSeconds !== undefined) {
    setClauses.push('start_seconds = ?', 'start_frame = ?');
    values.push(updates.startSeconds, Math.round(updates.startSeconds * 60));
  }
  if (updates.endSeconds !== undefined) {
    setClauses.push('end_seconds = ?', 'end_frame = ?');
    values.push(updates.endSeconds, Math.round(updates.endSeconds * 60));
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

export async function deleteReplayClipVideo(
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
        log.warn(`[replayClips] Could not delete clip video: ${err.message}`);
      }
    }
  }

  db.prepare(
    'UPDATE replay_clips SET output_path = NULL, output_format = NULL WHERE id = ?',
  ).run(clipId);
}

export async function bulkDeleteReplayClips(
  eventName: string,
  clipIds: string[],
): Promise<{ deleted: number }> {
  let deleted = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const id of clipIds) {
    // eslint-disable-next-line no-await-in-loop
    await deleteReplayClip(eventName, id);
    deleted += 1;
  }
  return { deleted };
}

export async function bulkDeleteReplayClipVideos(
  eventName: string,
  clipIds: string[],
): Promise<{ deleted: number }> {
  let deleted = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const id of clipIds) {
    // eslint-disable-next-line no-await-in-loop
    await deleteReplayClipVideo(eventName, id);
    deleted += 1;
  }
  return { deleted };
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

  return outputPath;
}

export async function createClipVideos(
  eventName: string,
  onProgress: (progress: ClipCreateProgress) => void,
  clipIds?: string[],
): Promise<{ created: number; skipped: number; failed: number }> {
  const db = getEventDb(eventName);
  const clipsDir = getClipsDir(eventName);

  let rows: any[];
  if (clipIds && clipIds.length > 0) {
    const placeholders = clipIds.map(() => '?').join(', ');
    rows = db
      .prepare(
        `SELECT * FROM replay_clips WHERE removed = 0 AND output_path IS NULL AND video_path IS NOT NULL AND id IN (${placeholders}) ORDER BY created_at`,
      )
      .all(...clipIds);
  } else {
    rows = db
      .prepare(
        'SELECT * FROM replay_clips WHERE removed = 0 AND output_path IS NULL AND video_path IS NOT NULL ORDER BY created_at',
      )
      .all();
  }
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
      db.prepare(
        'UPDATE replay_clips SET output_path = ?, output_format = ? WHERE id = ?',
      ).run(outputPath, 'standard', clip.id);
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
  db.prepare(
    'UPDATE replay_clips SET output_path = ?, output_format = ? WHERE id = ?',
  ).run(outputPath, 'standard', clipId);

  return outputPath;
}

// ---------------------------------------------------------------------------
// Portrait clip video creation (1080×1920)
// ---------------------------------------------------------------------------

const PORTRAIT_WIDTH = 1080;
const PORTRAIT_HALF_HEIGHT = 960;

async function createPortraitClipVideoFile(
  clip: ReplayClip,
  clipsDir: string,
  transforms: RecordingTransforms,
): Promise<string> {
  if (!clip.videoPath) {
    throw new Error('No paired video for this clip');
  }
  if (!transforms.gameCaptureTransform) {
    throw new Error('No game capture transform data');
  }
  if (!transforms.playerCameraTransform) {
    throw new Error('No player camera transform data');
  }

  await fs.access(clip.videoPath);
  await fs.mkdir(clipsDir, { recursive: true });

  const outputPath = path.join(
    clipsDir,
    `clip-${clip.id.slice(0, 8)}-portrait.mp4`,
  );
  const duration = clip.endSeconds - clip.startSeconds;

  const gc = computeCropRect(transforms.gameCaptureTransform);
  const pc = computeCropRect(transforms.playerCameraTransform);

  const W = PORTRAIT_WIDTH;
  const H = PORTRAIT_HALF_HEIGHT;

  // Build filter graph: crop each source, scale to fit half, pad to center, stack
  const filterComplex = [
    `[0:v]split=2[src1][src2]`,
    `[src1]crop=${gc.w}:${gc.h}:${gc.x}:${gc.y},scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(${W}-iw)/2:(${H}-ih)/2:black[game]`,
    `[src2]crop=${pc.w}:${pc.h}:${pc.x}:${pc.y},scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(${W}-iw)/2:(${H}-ih)/2:black[cam]`,
    `[game][cam]vstack=inputs=2[out]`,
  ].join(';');

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-y',
      '-ss',
      String(clip.startSeconds),
      '-i',
      clip.videoPath!,
      '-t',
      String(duration),
      '-filter_complex',
      filterComplex,
      '-map',
      '[out]',
      '-map',
      '0:a',
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-preset',
      'medium',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
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

export async function createPortraitClipVideos(
  eventName: string,
  onProgress: (progress: ClipCreateProgress) => void,
  clipIds?: string[],
): Promise<{ created: number; skipped: number; failed: number }> {
  const db = getEventDb(eventName);
  const clipsDir = getClipsDir(eventName);

  let rows: any[];
  if (clipIds && clipIds.length > 0) {
    const placeholders = clipIds.map(() => '?').join(', ');
    rows = db
      .prepare(
        `SELECT * FROM replay_clips WHERE removed = 0 AND output_path IS NULL AND video_path IS NOT NULL AND id IN (${placeholders}) ORDER BY created_at`,
      )
      .all(...clipIds);
  } else {
    rows = db
      .prepare(
        'SELECT * FROM replay_clips WHERE removed = 0 AND output_path IS NULL AND video_path IS NOT NULL ORDER BY created_at',
      )
      .all();
  }
  const clips = rows.map(rowToReplayClip);

  let created = 0;
  let failed = 0;
  const total = clips.length;

  // Sequential FFmpeg processing
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
      if (!clip.videoPath) throw new Error('No paired video');

      // eslint-disable-next-line no-await-in-loop
      const transforms = getRecordingTransforms(eventName, clip.videoPath);
      if (!transforms) {
        throw new Error(
          'No OBS transform data found for this recording — record with OBS connected to capture source positions',
        );
      }
      if (!transforms.gameCaptureTransform) {
        throw new Error('No game capture transform data for this recording');
      }
      if (!transforms.playerCameraTransform) {
        throw new Error('No player camera transform data for this recording');
      }

      // eslint-disable-next-line no-await-in-loop
      const outputPath = await createPortraitClipVideoFile(
        clip,
        clipsDir,
        transforms,
      );
      db.prepare(
        'UPDATE replay_clips SET output_path = ?, output_format = ? WHERE id = ?',
      ).run(outputPath, 'portrait', clip.id);
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
        `[replayClips] Failed to create portrait clip ${clip.id}: ${err.message}`,
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

  const allCount = db
    .prepare<
      [],
      { cnt: number }
    >('SELECT COUNT(*) as cnt FROM replay_clips WHERE removed = 0')
    .get();
  const skipped = (allCount?.cnt ?? 0) - created - failed;

  return { created, skipped, failed };
}
