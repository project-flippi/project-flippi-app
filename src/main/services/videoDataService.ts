// src/main/services/videoDataService.ts
// Clip/compilation management — backed by per-event SQLite
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import log from 'electron-log';
import type {
  ComboData,
  VideoDataEntry,
  CompilationEntry,
  CompilationOptions,
} from '../../common/meleeTypes';
import {
  getCharacterName,
  getStageName,
  getMoveName,
} from '../../common/meleeResources';
import { getEventDb } from '../database/db';
import {
  rowToVideoDataEntry,
  videoDataEntryToParams,
  rowToCompilationEntry,
} from '../database/eventDbHelpers';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function repoRootDir(): string {
  return path.join(os.homedir(), 'project-flippi');
}

export function getEventDataPaths(eventName: string) {
  const eventDir = path.join(repoRootDir(), 'Event', eventName);
  const dataDir = path.join(eventDir, 'data');
  return {
    eventDir,
    dataDir,
    comboData: path.join(dataDir, 'combodata.jsonl'),
    videoClips: path.join(eventDir, 'videos', 'clips'),
    videoCompilations: path.join(eventDir, 'videos', 'compilations'),
    thumbnails: path.join(eventDir, 'thumbnails'),
    slp: path.join(eventDir, 'slp'),
  };
}

// ---------------------------------------------------------------------------
// JSONL parser — kept for combodata.jsonl (written by external Clippi process)
// ---------------------------------------------------------------------------

export async function parseJsonl<T>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    if (!content.trim()) return [];
    return content
      .trim()
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as T);
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Combo data processing (port of ProcessComboTextFile.py)
// ---------------------------------------------------------------------------

function buildTitlePrompt(combo: ComboData): string {
  const { event } = combo;
  const { combo: c, settings } = event;
  const { players } = settings;

  const attacker = players.find((p) => p.playerIndex === c.playerIndex);
  const defender = players.find((p) => p.playerIndex !== c.playerIndex);

  const attackerChar = getCharacterName(attacker?.characterId ?? null);
  const defenderChar = getCharacterName(defender?.characterId ?? null);
  const stage = getStageName(settings.stageId);

  const moveList = c.moves
    .map((m) => `${getMoveName(m.moveId)} (${m.damage.toFixed(1)}%)`)
    .join(', ');

  const totalDamage = (c.endPercent - c.startPercent).toFixed(1);
  const killStr = c.didKill ? ' (KO!)' : '';

  const parts = [
    `${attackerChar} vs ${defenderChar} on ${stage}`,
    `Combo: ${moveList}`,
    `Total damage: ${totalDamage}%${killStr}`,
    `Moves: ${c.moves.length}`,
  ];

  if (attacker?.nametag) parts.push(`Attacker tag: ${attacker.nametag}`);
  if (defender?.nametag) parts.push(`Defender tag: ${defender.nametag}`);

  return parts.join(' | ');
}

function comboToVideoEntry(combo: ComboData): VideoDataEntry {
  const { event } = combo;
  const { combo: c, settings } = event;
  const { players } = settings;

  const attacker = players.find((p) => p.playerIndex === c.playerIndex);
  const defender = players.find((p) => p.playerIndex !== c.playerIndex);

  return {
    timestamp: combo.timestamp,
    filePath: '',
    title: '',
    prompt: buildTitlePrompt(combo),
    description: '',
    nametag: attacker?.nametag ?? '',
    stageId: settings.stageId,
    stageName: getStageName(settings.stageId),
    attackerCharacterId: attacker?.characterId ?? null,
    attackerCharacterName: getCharacterName(attacker?.characterId ?? null),
    attackerCharacterColor: attacker?.characterColor ?? null,
    attackerNametag: attacker?.nametag ?? '',
    attackerConnectCode: attacker?.connectCode ?? '',
    attackerDisplayName: attacker?.displayName ?? '',
    defenderCharacterId: defender?.characterId ?? null,
    defenderCharacterName: getCharacterName(defender?.characterId ?? null),
    defenderCharacterColor: defender?.characterColor ?? null,
    defenderNametag: defender?.nametag ?? '',
    defenderConnectCode: defender?.connectCode ?? '',
    defenderDisplayName: defender?.displayName ?? '',
    combo: c,
    phase: combo.phase ?? '',
    usedInCompilation: '',
    videoId: '',
    metadataFixed: false,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getClipsForEvent(
  eventName: string,
): Promise<VideoDataEntry[]> {
  const db = getEventDb(eventName);
  const rows = db
    .prepare<[], any>('SELECT * FROM clips ORDER BY timestamp')
    .all();
  return rows.map(rowToVideoDataEntry);
}

export async function getCompilationsForEvent(
  eventName: string,
): Promise<CompilationEntry[]> {
  const db = getEventDb(eventName);
  const rows = db
    .prepare<[], any>('SELECT * FROM compilations ORDER BY created_at')
    .all();
  return rows.map(rowToCompilationEntry);
}

export async function getComboDataForEvent(
  eventName: string,
): Promise<ComboData[]> {
  const paths = getEventDataPaths(eventName);
  return parseJsonl<ComboData>(paths.comboData);
}

export async function generateClipData(
  eventName: string,
): Promise<{ ok: boolean; created: number; message: string }> {
  try {
    const paths = getEventDataPaths(eventName);
    const combos = await parseJsonl<ComboData>(paths.comboData);

    if (combos.length === 0) {
      return { ok: true, created: 0, message: 'No combo data found.' };
    }

    const db = getEventDb(eventName);
    const newEntries = combos.map(comboToVideoEntry).filter((entry) => {
      // INSERT OR IGNORE handles dedup, but we can skip already-existing ones
      const existing = db
        .prepare<
          [string],
          { timestamp: string }
        >('SELECT timestamp FROM clips WHERE timestamp = ?')
        .get(entry.timestamp);
      return !existing;
    });

    if (newEntries.length === 0) {
      return {
        ok: true,
        created: 0,
        message: 'All combos already processed.',
      };
    }

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

    const batchInsert = db.transaction(() => {
      newEntries.forEach((entry) => {
        insertClip.run(...videoDataEntryToParams(entry));
      });
    });
    batchInsert();

    log.info(
      `[video] Generated ${newEntries.length} clip entries for ${eventName}`,
    );
    return {
      ok: true,
      created: newEntries.length,
      message: `Created ${newEntries.length} clip entries.`,
    };
  } catch (err: any) {
    log.error(`[video] generateClipData failed: ${err.message}`);
    return { ok: false, created: 0, message: err.message };
  }
}

export async function pairVideoFiles(
  eventName: string,
): Promise<{ ok: boolean; paired: number; unmatched: number }> {
  try {
    const paths = getEventDataPaths(eventName);
    const db = getEventDb(eventName);

    const entries = db
      .prepare<
        [],
        any
      >('SELECT timestamp, file_path FROM clips ORDER BY timestamp')
      .all();

    if (entries.length === 0) {
      return { ok: true, paired: 0, unmatched: 0 };
    }

    // List video files in clips directory
    let videoFiles: string[] = [];
    try {
      const allFiles = await fs.readdir(paths.videoClips);
      videoFiles = allFiles
        .filter((f) => /\.(mp4|mkv|avi|mov)$/i.test(f))
        .sort();
    } catch {
      // clips dir may not exist yet
    }

    // Simple pairing by index order (both sorted by timestamp/name)
    const unpaired = entries.filter((e: any) => !e.file_path);
    let paired = entries.length - unpaired.length;
    let unmatched = 0;

    const updateStmt = db.prepare(
      'UPDATE clips SET file_path = ? WHERE timestamp = ?',
    );

    const batchUpdate = db.transaction(() => {
      unpaired.forEach((entry: any, idx: number) => {
        if (idx < videoFiles.length) {
          updateStmt.run(
            path.join(paths.videoClips, videoFiles[idx]),
            entry.timestamp,
          );
          paired += 1;
        } else {
          unmatched += 1;
        }
      });
    });
    batchUpdate();

    return { ok: true, paired, unmatched };
  } catch (err: any) {
    log.error(`[video] pairVideoFiles failed: ${err.message}`);
    return { ok: false, paired: 0, unmatched: 0 };
  }
}

export async function updateClip(
  eventName: string,
  timestamp: string,
  updates: Record<string, any>,
): Promise<{ ok: boolean }> {
  try {
    const db = getEventDb(eventName);

    // Map camelCase field names to snake_case column names
    const fieldMap: Record<string, string> = {
      filePath: 'file_path',
      title: 'title',
      prompt: 'prompt',
      description: 'description',
      nametag: 'nametag',
      stageId: 'stage_id',
      stageName: 'stage_name',
      attackerCharacterId: 'attacker_character_id',
      attackerCharacterName: 'attacker_character_name',
      attackerCharacterColor: 'attacker_character_color',
      attackerNametag: 'attacker_nametag',
      attackerConnectCode: 'attacker_connect_code',
      attackerDisplayName: 'attacker_display_name',
      defenderCharacterId: 'defender_character_id',
      defenderCharacterName: 'defender_character_name',
      defenderCharacterColor: 'defender_character_color',
      defenderNametag: 'defender_nametag',
      defenderConnectCode: 'defender_connect_code',
      defenderDisplayName: 'defender_display_name',
      combo: 'combo',
      phase: 'phase',
      usedInCompilation: 'used_in_compilation',
      videoId: 'video_id',
      metadataFixed: 'metadata_fixed',
    };

    const setClauses: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      const col = fieldMap[key] ?? key;
      setClauses.push(`${col} = ?`);
      if (key === 'combo') {
        values.push(JSON.stringify(value));
      } else if (key === 'metadataFixed') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value);
      }
    });

    if (setClauses.length === 0) return { ok: true };

    values.push(timestamp);
    const result = db
      .prepare(`UPDATE clips SET ${setClauses.join(', ')} WHERE timestamp = ?`)
      .run(...values);

    return { ok: result.changes > 0 };
  } catch (err: any) {
    log.error(`[video] updateClip failed: ${err.message}`);
    return { ok: false };
  }
}

export async function createCompilation(
  eventName: string,
  options: Record<string, any>,
): Promise<{ ok: boolean; filePath?: string; message: string }> {
  try {
    const paths = getEventDataPaths(eventName);
    const db = getEventDb(eventName);
    const opts = options as Partial<CompilationOptions>;

    // Filter clips for compilation
    let clips: any[];
    if (opts.excludeUsed) {
      clips = db
        .prepare<
          [],
          any
        >("SELECT * FROM clips WHERE file_path != '' AND used_in_compilation = '' ORDER BY timestamp")
        .all();
    } else {
      clips = db
        .prepare<
          [],
          any
        >("SELECT * FROM clips WHERE file_path != '' ORDER BY timestamp")
        .all();
    }

    const maxClips = opts.maxClips ?? 20;
    const minClips = opts.minClips ?? 1;

    if (clips.length < minClips) {
      return {
        ok: false,
        message: `Not enough clips (${clips.length} found, ${minClips} required).`,
      };
    }

    clips = clips.slice(0, maxClips);

    // Create compilation entry
    const compName = `compilation_${Date.now()}.mp4`;
    const compPath = path.join(paths.videoCompilations, compName);

    const batchWrite = db.transaction(() => {
      db.prepare(
        `INSERT INTO compilations (file_path, title, description, clip_titles, clip_files, thumbnail, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        compPath,
        '',
        '',
        JSON.stringify(clips.map((c: any) => c.title)),
        JSON.stringify(clips.map((c: any) => c.file_path)),
        '',
        new Date().toISOString(),
      );

      const updateStmt = db.prepare(
        'UPDATE clips SET used_in_compilation = ? WHERE timestamp = ?',
      );
      clips.forEach((clip: any) => {
        updateStmt.run(compPath, clip.timestamp);
      });
    });
    batchWrite();

    log.info(
      `[video] Created compilation with ${clips.length} clips for ${eventName}`,
    );
    return {
      ok: true,
      filePath: compPath,
      message: `Compilation created with ${clips.length} clips. FFmpeg concat not yet implemented — clip files listed in database.`,
    };
  } catch (err: any) {
    log.error(`[video] createCompilation failed: ${err.message}`);
    return { ok: false, message: err.message };
  }
}

export async function updateCompilation(
  eventName: string,
  filePath: string,
  updates: Record<string, any>,
): Promise<{ ok: boolean }> {
  try {
    const db = getEventDb(eventName);

    const fieldMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      clipTitles: 'clip_titles',
      clipFiles: 'clip_files',
      thumbnail: 'thumbnail',
    };

    const setClauses: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      const col = fieldMap[key] ?? key;
      setClauses.push(`${col} = ?`);
      if (key === 'clipTitles' || key === 'clipFiles') {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
    });

    if (setClauses.length === 0) return { ok: true };

    values.push(filePath);
    const result = db
      .prepare(
        `UPDATE compilations SET ${setClauses.join(', ')} WHERE file_path = ?`,
      )
      .run(...values);

    return { ok: result.changes > 0 };
  } catch (err: any) {
    log.error(`[video] updateCompilation failed: ${err.message}`);
    return { ok: false };
  }
}
