// src/main/services/setService.ts
// CRUD operations for tournament sets — backed by per-event SQLite
import path from 'path';
import { randomUUID } from 'crypto';
import log from 'electron-log';
import type {
  GameSet,
  SetEntry,
  SetMatchType,
  SetType,
  SetPhase,
  SetRoundType,
  SetPlayerOverride,
  GameEntry,
} from '../../common/meleeTypes';
import { computeSetTitle } from '../../common/setUtils';
import { getGameEntries } from './gameVideoService';
import { getEventDb } from '../database/db';
import { rowToGameSet } from '../database/eventDbHelpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sort video paths by filename (alphabetical = chronological for OBS naming) */
function sortVideoPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b)),
  );
}

// ---------------------------------------------------------------------------
// Read sets from DB
// ---------------------------------------------------------------------------

export async function readSets(eventName: string): Promise<GameSet[]> {
  const db = getEventDb(eventName);
  const setRows = db
    .prepare<[], any>('SELECT * FROM sets ORDER BY created_at')
    .all();

  return setRows.map((row: any) => {
    const gameRows = db
      .prepare<
        [string],
        { video_file_path: string }
      >('SELECT video_file_path FROM set_games WHERE set_id = ? ORDER BY sort_order')
      .all(row.id);
    const gamePaths = gameRows.map((g) => g.video_file_path);
    return rowToGameSet(row, gamePaths);
  });
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export async function createSet(
  eventName: string,
  matchType: SetMatchType,
  setType: SetType,
  phase: SetPhase,
  roundType: SetRoundType,
  roundNumber: string,
  playerOverrides: SetPlayerOverride[],
  videoFilePath: string,
): Promise<GameSet> {
  const db = getEventDb(eventName);
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO sets (id, match_type, set_type, phase, round_type, round_number, player_overrides, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      matchType,
      setType,
      phase,
      roundType,
      roundNumber,
      JSON.stringify(playerOverrides),
      createdAt,
    );
    db.prepare(
      'INSERT INTO set_games (set_id, video_file_path, sort_order) VALUES (?, ?, ?)',
    ).run(id, videoFilePath, 0);
  });

  insert();
  log.info(`[sets] Created set ${id} for event ${eventName}`);

  return {
    id,
    matchType,
    setType,
    phase,
    roundType,
    roundNumber,
    playerOverrides,
    gameVideoFilePaths: [videoFilePath],
    createdAt,
  };
}

export async function addGameToSet(
  eventName: string,
  setId: string,
  videoFilePath: string,
): Promise<GameSet> {
  const db = getEventDb(eventName);

  // UNIQUE constraint on video_file_path will reject if already in any set
  const setRow = db
    .prepare<[string], any>('SELECT * FROM sets WHERE id = ?')
    .get(setId);
  if (!setRow) throw new Error(`Set ${setId} not found`);

  // Get current games + add new one
  const existingGames = db
    .prepare<[string], { video_file_path: string }>(
      'SELECT video_file_path FROM set_games WHERE set_id = ? ORDER BY sort_order',
    )
    .all(setId)
    .map((g) => g.video_file_path);

  const sorted = sortVideoPaths([...existingGames, videoFilePath]);

  const update = db.transaction(() => {
    // Re-insert all with correct sort order
    db.prepare('DELETE FROM set_games WHERE set_id = ?').run(setId);
    const insert = db.prepare(
      'INSERT INTO set_games (set_id, video_file_path, sort_order) VALUES (?, ?, ?)',
    );
    sorted.forEach((vp, idx) => insert.run(setId, vp, idx));
  });

  try {
    update();
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      throw new Error('This game is already in a set. Remove it first.');
    }
    throw err;
  }

  log.info(`[sets] Added game to set ${setId}`);
  return rowToGameSet(setRow, sorted);
}

export async function removeGameFromSet(
  eventName: string,
  setId: string,
  videoFilePath: string,
): Promise<GameSet | null> {
  const db = getEventDb(eventName);

  const setRow = db
    .prepare<[string], any>('SELECT * FROM sets WHERE id = ?')
    .get(setId);
  if (!setRow) throw new Error(`Set ${setId} not found`);

  const result = db.transaction(() => {
    db.prepare(
      'DELETE FROM set_games WHERE set_id = ? AND video_file_path = ?',
    ).run(setId, videoFilePath);

    const remaining = db
      .prepare<[string], { video_file_path: string }>(
        'SELECT video_file_path FROM set_games WHERE set_id = ? ORDER BY sort_order',
      )
      .all(setId)
      .map((g) => g.video_file_path);

    if (remaining.length === 0) {
      db.prepare('DELETE FROM sets WHERE id = ?').run(setId);
      return null;
    }
    return remaining;
  })();

  if (result === null) {
    log.info(`[sets] Deleted empty set ${setId}`);
    return null;
  }

  log.info(`[sets] Removed game from set ${setId}`);
  return rowToGameSet(setRow, result);
}

export async function updateSet(
  eventName: string,
  setId: string,
  updates: Partial<
    Pick<
      GameSet,
      | 'matchType'
      | 'setType'
      | 'phase'
      | 'roundType'
      | 'roundNumber'
      | 'playerOverrides'
    >
  >,
): Promise<GameSet> {
  const db = getEventDb(eventName);

  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.matchType !== undefined) {
    setClauses.push('match_type = ?');
    values.push(updates.matchType);
  }
  if (updates.setType !== undefined) {
    setClauses.push('set_type = ?');
    values.push(updates.setType);
  }
  if (updates.phase !== undefined) {
    setClauses.push('phase = ?');
    values.push(updates.phase);
  }
  if (updates.roundType !== undefined) {
    setClauses.push('round_type = ?');
    values.push(updates.roundType);
  }
  if (updates.roundNumber !== undefined) {
    setClauses.push('round_number = ?');
    values.push(updates.roundNumber);
  }
  if (updates.playerOverrides !== undefined) {
    setClauses.push('player_overrides = ?');
    values.push(JSON.stringify(updates.playerOverrides));
  }

  if (setClauses.length > 0) {
    values.push(setId);
    db.prepare(`UPDATE sets SET ${setClauses.join(', ')} WHERE id = ?`).run(
      ...values,
    );
  }

  const setRow = db
    .prepare<[string], any>('SELECT * FROM sets WHERE id = ?')
    .get(setId);
  if (!setRow) throw new Error(`Set ${setId} not found`);

  const gamePaths = db
    .prepare<[string], { video_file_path: string }>(
      'SELECT video_file_path FROM set_games WHERE set_id = ? ORDER BY sort_order',
    )
    .all(setId)
    .map((g) => g.video_file_path);

  log.info(`[sets] Updated set ${setId}`);
  return rowToGameSet(setRow, gamePaths);
}

export async function deleteSet(
  eventName: string,
  setId: string,
): Promise<void> {
  const db = getEventDb(eventName);
  // CASCADE deletes set_games automatically
  db.prepare('DELETE FROM sets WHERE id = ?').run(setId);
  log.info(`[sets] Deleted set ${setId}`);
}

export async function findSetForVideo(
  eventName: string,
  videoFilePath: string,
): Promise<string | null> {
  const db = getEventDb(eventName);
  const row = db
    .prepare<
      [string],
      { set_id: string }
    >('SELECT set_id FROM set_games WHERE video_file_path = ?')
    .get(videoFilePath);
  return row?.set_id ?? null;
}

// ---------------------------------------------------------------------------
// Get enriched set entries for renderer
// ---------------------------------------------------------------------------

export function buildSetEntries(
  sets: GameSet[],
  allGames: GameEntry[],
  eventName: string,
): SetEntry[] {
  const gameMap = new Map<string, GameEntry>(
    allGames.map((g) => [g.video.filePath, g]),
  );

  return sets.map((set) => {
    const games = set.gameVideoFilePaths
      .map((vp) => gameMap.get(vp))
      .filter((g): g is GameEntry => g != null);

    const title = computeSetTitle(set, games, eventName);

    return { set, games, title };
  });
}

export async function getSetEntries(
  eventName: string,
  slpDataFolder: string,
): Promise<SetEntry[]> {
  const sets = await readSets(eventName);
  if (sets.length === 0) return [];

  const allGames = await getGameEntries(eventName, slpDataFolder);
  return buildSetEntries(sets, allGames, eventName);
}
