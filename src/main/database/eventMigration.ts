// src/main/database/eventMigration.ts
// Auto-migrate old per-event files to SQLite on first access
import fs from 'fs';
import path from 'path';
import os from 'os';
import type Database from 'better-sqlite3';
import log from 'electron-log';
import { videoDataEntryToParams } from './eventDbHelpers';
import type {
  VideoDataEntry,
  CompilationEntry,
  GameSet,
} from '../../common/meleeTypes';

function eventDataDir(eventName: string): string {
  return path.join(os.homedir(), 'project-flippi', 'Event', eventName, 'data');
}

function readFileSync(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function parseJsonlSync<T>(filePath: string): T[] {
  const content = readFileSync(filePath);
  if (!content || !content.trim()) return [];
  return content
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

// eslint-disable-next-line import/prefer-default-export
export function migrateEventIfNeeded(
  eventName: string,
  db: Database.Database,
): void {
  // Check if already migrated
  const existing = db
    .prepare<
      [string],
      { value: string }
    >('SELECT value FROM event_metadata WHERE key = ?')
    .get('migrated_from_files');
  if (existing) return;

  const dataDir = eventDataDir(eventName);

  // Check if there are any old files to migrate
  const videoDataPath = path.join(dataDir, 'videodata.jsonl');
  const compDataPath = path.join(dataDir, 'compdata.jsonl');
  const setsPath = path.join(dataDir, 'sets.json');
  const pairingsPath = path.join(dataDir, 'gamepairings.json');
  const titleHistoryPath = path.join(dataDir, 'titlehistory.txt');
  const eventTitlePath = path.join(dataDir, 'event_title.txt');
  const venueDescPath = path.join(dataDir, 'venue_desc.txt');

  const migrate = db.transaction(() => {
    // Migrate clips (videodata.jsonl)
    const clips = parseJsonlSync<VideoDataEntry>(videoDataPath);
    if (clips.length > 0) {
      const insertClip = db.prepare(
        `INSERT OR IGNORE INTO clips (
          timestamp, file_path, title, prompt, description, nametag,
          stage_id, stage_name,
          attacker_character_id, attacker_character_name, attacker_character_color,
          attacker_nametag, attacker_connect_code, attacker_display_name,
          defender_character_id, defender_character_name, defender_character_color,
          defender_nametag, defender_connect_code, defender_display_name,
          combo, phase, used_in_compilation, video_id, metadata_fixed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      clips.forEach((clip) => {
        insertClip.run(...videoDataEntryToParams(clip));
      });
      log.info(`[migration] Migrated ${clips.length} clips for ${eventName}`);
    }

    // Migrate compilations (compdata.jsonl)
    const comps = parseJsonlSync<CompilationEntry>(compDataPath);
    if (comps.length > 0) {
      const insertComp = db.prepare(
        `INSERT OR IGNORE INTO compilations (
          file_path, title, description, clip_titles, clip_files, thumbnail, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      comps.forEach((comp) => {
        insertComp.run(
          comp.filePath,
          comp.title,
          comp.description,
          JSON.stringify(comp.clipTitles),
          JSON.stringify(comp.clipFiles),
          comp.thumbnail,
          comp.createdAt,
        );
      });
      log.info(
        `[migration] Migrated ${comps.length} compilations for ${eventName}`,
      );
    }

    // Migrate sets (sets.json)
    const setsRaw = readFileSync(setsPath);
    if (setsRaw && setsRaw.trim()) {
      try {
        const sets: GameSet[] = JSON.parse(setsRaw);
        const insertSet = db.prepare(
          `INSERT OR IGNORE INTO sets (
            id, match_type, set_type, phase, round_type, round_number,
            player_overrides, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const insertSetGame = db.prepare(
          `INSERT OR IGNORE INTO set_games (set_id, video_file_path, sort_order)
           VALUES (?, ?, ?)`,
        );
        sets.forEach((set) => {
          insertSet.run(
            set.id,
            set.matchType,
            set.setType,
            set.phase,
            set.roundType,
            set.roundNumber,
            JSON.stringify(set.playerOverrides),
            set.createdAt,
          );
          set.gameVideoFilePaths.forEach((vp, idx) => {
            insertSetGame.run(set.id, vp, idx);
          });
        });
        log.info(`[migration] Migrated ${sets.length} sets for ${eventName}`);
      } catch (err: any) {
        log.warn(
          `[migration] Failed to parse sets.json for ${eventName}: ${err.message}`,
        );
      }
    }

    // Migrate game pairings (gamepairings.json)
    const pairingsRaw = readFileSync(pairingsPath);
    if (pairingsRaw && pairingsRaw.trim()) {
      try {
        const pairings: { videoPath: string; slpPath: string | null }[] =
          JSON.parse(pairingsRaw);
        const insertPairing = db.prepare(
          'INSERT OR IGNORE INTO game_pairings (video_path, slp_path) VALUES (?, ?)',
        );
        pairings.forEach((p) => {
          insertPairing.run(p.videoPath, p.slpPath);
        });
        log.info(
          `[migration] Migrated ${pairings.length} game pairings for ${eventName}`,
        );
      } catch (err: any) {
        log.warn(
          `[migration] Failed to parse gamepairings.json for ${eventName}: ${err.message}`,
        );
      }
    }

    // Migrate title history (titlehistory.txt)
    const historyContent = readFileSync(titleHistoryPath);
    if (historyContent && historyContent.trim()) {
      const lines = historyContent
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length > 0) {
        const insertTitle = db.prepare(
          'INSERT INTO title_history (title) VALUES (?)',
        );
        lines.forEach((line) => {
          insertTitle.run(line);
        });
        log.info(
          `[migration] Migrated ${lines.length} title history entries for ${eventName}`,
        );
      }
    }

    // Migrate event metadata (event_title.txt, venue_desc.txt)
    const eventTitle = readFileSync(eventTitlePath);
    if (eventTitle !== null) {
      db.prepare(
        'INSERT OR REPLACE INTO event_metadata (key, value) VALUES (?, ?)',
      ).run('event_title', eventTitle.trim());
    }
    const venueDesc = readFileSync(venueDescPath);
    if (venueDesc !== null) {
      db.prepare(
        'INSERT OR REPLACE INTO event_metadata (key, value) VALUES (?, ?)',
      ).run('venue_desc', venueDesc.trim());
    }

    // Mark as migrated
    db.prepare(
      'INSERT OR REPLACE INTO event_metadata (key, value) VALUES (?, ?)',
    ).run('migrated_from_files', new Date().toISOString());
  });

  migrate();
  log.info(`[migration] Event migration complete for ${eventName}`);
}
