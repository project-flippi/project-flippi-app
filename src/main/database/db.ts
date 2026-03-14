import path from 'path';
import { app } from 'electron';
import log from 'electron-log';
import Database from 'better-sqlite3';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized — call initDatabase() first');
  }
  return db;
}

export function initDatabase(): void {
  if (db) return;

  const dbPath = path.join(app.getPath('userData'), 'slp-cache.db');
  log.info(`[database] Opening SQLite database at ${dbPath}`);

  db = new Database(dbPath);

  // Performance pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS slp_cache (
      slp_path    TEXT PRIMARY KEY,
      file_mtime  INTEGER NOT NULL,
      file_size   INTEGER NOT NULL,
      game_data   TEXT NOT NULL,
      cached_at   TEXT NOT NULL
    );
  `);

  log.info('[database] SQLite database initialized');
}
