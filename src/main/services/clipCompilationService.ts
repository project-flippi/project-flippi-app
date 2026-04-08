// src/main/services/clipCompilationService.ts
// CRUD operations for clip compilations — backed by per-event SQLite
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import log from 'electron-log';
import type {
  ClipCompilation,
  ClipCompilationEntry,
  ReplayClipEntry,
} from '../../common/meleeTypes';
import { getEventDb } from '../database/db';
import { rowToClipCompilation } from '../database/eventDbHelpers';
import { getReplayClipEntries } from './replayClipService';

// ---------------------------------------------------------------------------
// Read compilations from DB
// ---------------------------------------------------------------------------

export function readClipCompilations(eventName: string): ClipCompilation[] {
  const db = getEventDb(eventName);
  const rows = db
    .prepare<[], any>('SELECT * FROM clip_compilations ORDER BY created_at')
    .all();

  return rows.map((row: any) => {
    const clipRows = db
      .prepare<
        [string],
        { clip_id: string }
      >('SELECT clip_id FROM clip_compilation_clips WHERE compilation_id = ? ORDER BY sort_order')
      .all(row.id);
    const clipIds = clipRows.map((c) => c.clip_id);
    return rowToClipCompilation(row, clipIds);
  });
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export function createClipCompilation(
  eventName: string,
  title: string,
  clipIds: string[],
): ClipCompilation {
  const db = getEventDb(eventName);
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO clip_compilations (id, title, description, created_at)
       VALUES (?, ?, '', ?)`,
    ).run(id, title, createdAt);

    const stmt = db.prepare(
      'INSERT INTO clip_compilation_clips (compilation_id, clip_id, sort_order) VALUES (?, ?, ?)',
    );
    clipIds.forEach((clipId, idx) => stmt.run(id, clipId, idx));
  });

  insert();
  log.info(
    `[clip-compilations] Created compilation ${id} for event ${eventName}`,
  );

  return {
    id,
    title,
    description: '',
    clipIds,
    compiledVideoPath: null,
    createdAt,
  };
}

export function addClipToCompilation(
  eventName: string,
  compilationId: string,
  clipId: string,
): ClipCompilation {
  const db = getEventDb(eventName);

  const row = db
    .prepare<[string], any>('SELECT * FROM clip_compilations WHERE id = ?')
    .get(compilationId);
  if (!row) throw new Error(`Compilation ${compilationId} not found`);
  if (row.compiled_video_path) {
    throw new Error(
      'Cannot add clips to a compiled compilation. Delete the compilation video first.',
    );
  }

  // Get next sort_order
  const maxRow = db
    .prepare<
      [string],
      { max_order: number | null }
    >('SELECT MAX(sort_order) as max_order FROM clip_compilation_clips WHERE compilation_id = ?')
    .get(compilationId);
  const nextOrder = (maxRow?.max_order ?? -1) + 1;

  db.prepare(
    'INSERT OR IGNORE INTO clip_compilation_clips (compilation_id, clip_id, sort_order) VALUES (?, ?, ?)',
  ).run(compilationId, clipId, nextOrder);

  const clipRows = db
    .prepare<
      [string],
      { clip_id: string }
    >('SELECT clip_id FROM clip_compilation_clips WHERE compilation_id = ? ORDER BY sort_order')
    .all(compilationId);

  log.info(`[clip-compilations] Added clip to compilation ${compilationId}`);
  return rowToClipCompilation(
    row,
    clipRows.map((c) => c.clip_id),
  );
}

export function removeClipFromCompilation(
  eventName: string,
  compilationId: string,
  clipId: string,
): ClipCompilation | null {
  const db = getEventDb(eventName);

  const row = db
    .prepare<[string], any>('SELECT * FROM clip_compilations WHERE id = ?')
    .get(compilationId);
  if (!row) throw new Error(`Compilation ${compilationId} not found`);
  if (row.compiled_video_path) {
    throw new Error(
      'Cannot remove clips from a compiled compilation. Delete the compilation video first.',
    );
  }

  const result = db.transaction(() => {
    db.prepare(
      'DELETE FROM clip_compilation_clips WHERE compilation_id = ? AND clip_id = ?',
    ).run(compilationId, clipId);

    const remaining = db
      .prepare<[string], { clip_id: string }>(
        'SELECT clip_id FROM clip_compilation_clips WHERE compilation_id = ? ORDER BY sort_order',
      )
      .all(compilationId)
      .map((c) => c.clip_id);

    if (remaining.length === 0) {
      db.prepare('DELETE FROM clip_compilations WHERE id = ?').run(
        compilationId,
      );
      return null;
    }
    return remaining;
  })();

  if (result === null) {
    log.info(`[clip-compilations] Deleted empty compilation ${compilationId}`);
    return null;
  }

  log.info(
    `[clip-compilations] Removed clip from compilation ${compilationId}`,
  );
  return rowToClipCompilation(row, result);
}

export function updateClipCompilation(
  eventName: string,
  compilationId: string,
  updates: Partial<
    Pick<ClipCompilation, 'title' | 'description' | 'compiledVideoPath'>
  >,
): ClipCompilation {
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
  if (updates.compiledVideoPath !== undefined) {
    setClauses.push('compiled_video_path = ?');
    values.push(updates.compiledVideoPath);
  }

  if (setClauses.length > 0) {
    values.push(compilationId);
    db.prepare(
      `UPDATE clip_compilations SET ${setClauses.join(', ')} WHERE id = ?`,
    ).run(...values);
  }

  const row = db
    .prepare<[string], any>('SELECT * FROM clip_compilations WHERE id = ?')
    .get(compilationId);
  if (!row) throw new Error(`Compilation ${compilationId} not found`);

  const clipRows = db
    .prepare<[string], { clip_id: string }>(
      'SELECT clip_id FROM clip_compilation_clips WHERE compilation_id = ? ORDER BY sort_order',
    )
    .all(compilationId)
    .map((c) => c.clip_id);

  log.info(`[clip-compilations] Updated compilation ${compilationId}`);
  return rowToClipCompilation(row, clipRows);
}

export async function deleteClipCompilationVideo(
  eventName: string,
  compilationId: string,
): Promise<ClipCompilation> {
  const db = getEventDb(eventName);
  const row = db
    .prepare<[string], any>('SELECT * FROM clip_compilations WHERE id = ?')
    .get(compilationId);
  if (!row) throw new Error(`Compilation ${compilationId} not found`);

  if (row.compiled_video_path) {
    try {
      await fs.unlink(row.compiled_video_path);
      log.info(
        `[clip-compilations] Deleted video file: ${row.compiled_video_path}`,
      );
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  return updateClipCompilation(eventName, compilationId, {
    compiledVideoPath: null,
  });
}

export async function deleteClipCompilation(
  eventName: string,
  compilationId: string,
): Promise<void> {
  const db = getEventDb(eventName);

  const row = db
    .prepare<[string], any>('SELECT * FROM clip_compilations WHERE id = ?')
    .get(compilationId);
  if (row?.compiled_video_path) {
    try {
      await fs.unlink(row.compiled_video_path);
      log.info(
        `[clip-compilations] Deleted video file: ${row.compiled_video_path}`,
      );
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        log.warn(
          `[clip-compilations] Failed to delete video file: ${err.message}`,
        );
      }
    }
  }

  // CASCADE deletes clip_compilation_clips automatically
  db.prepare('DELETE FROM clip_compilations WHERE id = ?').run(compilationId);
  log.info(`[clip-compilations] Deleted compilation ${compilationId}`);
}

export function findCompilationsForClip(
  eventName: string,
  clipId: string,
): { id: string; title: string }[] {
  const db = getEventDb(eventName);
  const rows = db
    .prepare<[string], { id: string; title: string }>(
      `SELECT cc.id, cc.title
       FROM clip_compilations cc
       JOIN clip_compilation_clips ccc ON cc.id = ccc.compilation_id
       WHERE ccc.clip_id = ?
       ORDER BY cc.created_at`,
    )
    .all(clipId);
  return rows;
}

// ---------------------------------------------------------------------------
// Get enriched compilation entries for renderer
// ---------------------------------------------------------------------------

export async function getClipCompilationEntries(
  eventName: string,
): Promise<ClipCompilationEntry[]> {
  const compilations = readClipCompilations(eventName);
  if (compilations.length === 0) return [];

  // Load all clip entries once to avoid repeated parsing
  const allClipEntries = await getReplayClipEntries(eventName);
  const clipEntryMap = new Map<string, ReplayClipEntry>(
    allClipEntries.map((e) => [e.clip.id, e]),
  );

  return compilations.map((compilation) => {
    const clips = compilation.clipIds
      .map((id) => clipEntryMap.get(id))
      .filter((e): e is ReplayClipEntry => e != null);

    return { compilation, clips };
  });
}
