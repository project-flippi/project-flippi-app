import type Database from 'better-sqlite3';
import log from 'electron-log';
import type { SlpGameData } from '../../common/meleeTypes';
import { getDb } from './db';

// Prepared statements are created lazily and cached for the process lifetime.
let stmtGet: Database.Statement<
  [string, number, number],
  { game_data: string }
> | null = null;
let stmtUpsert: Database.Statement<
  [string, number, number, string, string]
> | null = null;
let stmtDeleteOne: Database.Statement<[string]> | null = null;
let stmtDeleteAll: Database.Statement<[]> | null = null;

function ensureStatements() {
  if (stmtGet) return;
  const db = getDb();
  stmtGet = db.prepare<[string, number, number], { game_data: string }>(
    'SELECT game_data FROM slp_cache WHERE slp_path = ? AND file_mtime = ? AND file_size = ?',
  );
  stmtUpsert = db.prepare<[string, number, number, string, string]>(
    'INSERT OR REPLACE INTO slp_cache (slp_path, file_mtime, file_size, game_data, cached_at) VALUES (?, ?, ?, ?, ?)',
  );
  stmtDeleteOne = db.prepare<[string]>(
    'DELETE FROM slp_cache WHERE slp_path = ?',
  );
  stmtDeleteAll = db.prepare<[]>('DELETE FROM slp_cache');
}

export function getCached(
  slpPath: string,
  mtime: number,
  size: number,
): SlpGameData | null {
  try {
    ensureStatements();
    const row = stmtGet!.get(slpPath, mtime, size);
    if (!row) return null;
    return JSON.parse(row.game_data) as SlpGameData;
  } catch (err: any) {
    log.warn(`[metadataCache] getCached error: ${err.message}`);
    return null;
  }
}

export function upsertEntry(
  slpPath: string,
  mtime: number,
  size: number,
  gameData: SlpGameData,
): void {
  try {
    ensureStatements();
    stmtUpsert!.run(
      slpPath,
      mtime,
      size,
      JSON.stringify(gameData),
      new Date().toISOString(),
    );
  } catch (err: any) {
    log.warn(`[metadataCache] upsertEntry error: ${err.message}`);
  }
}

export function pruneStaleEntries(validPaths: Set<string>): number {
  try {
    const db = getDb();
    const allRows = db
      .prepare<[], { slp_path: string }>('SELECT slp_path FROM slp_cache')
      .all();
    const toDelete = allRows.filter((r) => !validPaths.has(r.slp_path));
    if (toDelete.length === 0) return 0;

    ensureStatements();
    const deleteMany = db.transaction((paths: string[]) => {
      paths.forEach((p) => stmtDeleteOne!.run(p));
    });
    deleteMany(toDelete.map((r) => r.slp_path));
    log.info(`[metadataCache] Pruned ${toDelete.length} stale cache entries`);
    return toDelete.length;
  } catch (err: any) {
    log.warn(`[metadataCache] pruneStaleEntries error: ${err.message}`);
    return 0;
  }
}

export function invalidateAll(): void {
  try {
    ensureStatements();
    const result = stmtDeleteAll!.run();
    log.info(
      `[metadataCache] Invalidated all cache entries (${result.changes} rows)`,
    );
  } catch (err: any) {
    log.warn(`[metadataCache] invalidateAll error: ${err.message}`);
  }
}

export function invalidatePath(slpPath: string): void {
  try {
    ensureStatements();
    stmtDeleteOne!.run(slpPath);
  } catch (err: any) {
    log.warn(`[metadataCache] invalidatePath error: ${err.message}`);
  }
}
