import path from 'path';
import os from 'os';
import { app } from 'electron';
import log from 'electron-log';
import Database from 'better-sqlite3';
import { migrateEventIfNeeded } from './eventMigration';

// ---------------------------------------------------------------------------
// Global SLP cache database
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Per-event SQLite databases
// ---------------------------------------------------------------------------

const EVENT_DB_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clips (
  timestamp                TEXT PRIMARY KEY,
  file_path                TEXT NOT NULL DEFAULT '',
  title                    TEXT NOT NULL DEFAULT '',
  prompt                   TEXT NOT NULL DEFAULT '',
  description              TEXT NOT NULL DEFAULT '',
  nametag                  TEXT NOT NULL DEFAULT '',
  stage_id                 INTEGER,
  stage_name               TEXT NOT NULL DEFAULT '',
  attacker_character_id    INTEGER,
  attacker_character_name  TEXT NOT NULL DEFAULT '',
  attacker_character_color INTEGER,
  attacker_nametag         TEXT NOT NULL DEFAULT '',
  attacker_connect_code    TEXT NOT NULL DEFAULT '',
  attacker_display_name    TEXT NOT NULL DEFAULT '',
  defender_character_id    INTEGER,
  defender_character_name  TEXT NOT NULL DEFAULT '',
  defender_character_color INTEGER,
  defender_nametag         TEXT NOT NULL DEFAULT '',
  defender_connect_code    TEXT NOT NULL DEFAULT '',
  defender_display_name    TEXT NOT NULL DEFAULT '',
  combo                    TEXT NOT NULL DEFAULT '{}',
  phase                    TEXT NOT NULL DEFAULT '',
  used_in_compilation      TEXT NOT NULL DEFAULT '',
  video_id                 TEXT NOT NULL DEFAULT '',
  metadata_fixed           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS compilations (
  file_path    TEXT PRIMARY KEY,
  title        TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  clip_titles  TEXT NOT NULL DEFAULT '[]',
  clip_files   TEXT NOT NULL DEFAULT '[]',
  thumbnail    TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sets (
  id              TEXT PRIMARY KEY,
  match_type      TEXT NOT NULL,
  set_type        TEXT NOT NULL,
  phase           TEXT NOT NULL DEFAULT '',
  round_type      TEXT NOT NULL DEFAULT '',
  round_number    TEXT NOT NULL DEFAULT '',
  player_overrides     TEXT NOT NULL DEFAULT '[]',
  compiled_video_path  TEXT DEFAULT NULL,
  created_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS set_games (
  set_id          TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  video_file_path TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (set_id, video_file_path),
  UNIQUE (video_file_path)
);

CREATE TABLE IF NOT EXISTS game_pairings (
  video_path TEXT PRIMARY KEY,
  slp_path   TEXT
);

CREATE TABLE IF NOT EXISTS title_history (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recording_transforms (
  video_path              TEXT PRIMARY KEY,
  scene_name              TEXT NOT NULL DEFAULT '',
  game_capture_source     TEXT NOT NULL DEFAULT '',
  game_capture_transform  TEXT NOT NULL DEFAULT '{}',
  player_camera_source    TEXT NOT NULL DEFAULT '',
  player_camera_transform TEXT NOT NULL DEFAULT '{}',
  captured_at             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
`;

const eventDbPool = new Map<string, Database.Database>();

function eventDbPath(eventName: string): string {
  return path.join(
    os.homedir(),
    'project-flippi',
    'Event',
    eventName,
    'data',
    'event.db',
  );
}

export function getEventDb(eventName: string): Database.Database {
  let edb = eventDbPool.get(eventName);
  if (edb) return edb;

  const dbPath = eventDbPath(eventName);
  log.info(`[database] Opening event database at ${dbPath}`);

  edb = new Database(dbPath);
  edb.exec(EVENT_DB_SCHEMA);

  // Schema migrations for existing databases
  const cols = edb
    .prepare("PRAGMA table_info('sets')")
    .all()
    .map((c: any) => c.name);
  if (!cols.includes('compiled_video_path')) {
    edb.exec(
      'ALTER TABLE sets ADD COLUMN compiled_video_path TEXT DEFAULT NULL',
    );
  }

  // Run migration from old files if needed
  migrateEventIfNeeded(eventName, edb);

  eventDbPool.set(eventName, edb);
  return edb;
}

export function closeEventDb(eventName: string): void {
  const edb = eventDbPool.get(eventName);
  if (edb) {
    edb.close();
    eventDbPool.delete(eventName);
    log.info(`[database] Closed event database for ${eventName}`);
  }
}

export function closeAllEventDbs(): void {
  eventDbPool.forEach((edb, name) => {
    edb.close();
    log.info(`[database] Closed event database for ${name}`);
  });
  eventDbPool.clear();
}
