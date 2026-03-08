// src/main/services/videoDataService.ts
// JSONL I/O, combo data processing, clip/compilation management
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
    videoData: path.join(dataDir, 'videodata.jsonl'),
    compData: path.join(dataDir, 'compdata.jsonl'),
    titleHistory: path.join(dataDir, 'titlehistory.txt'),
    videoClips: path.join(eventDir, 'videos', 'clips'),
    videoCompilations: path.join(eventDir, 'videos', 'compilations'),
    thumbnails: path.join(eventDir, 'thumbnails'),
    slp: path.join(eventDir, 'slp'),
  };
}

// ---------------------------------------------------------------------------
// JSONL I/O
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

export async function writeJsonlAtomic<T>(
  filePath: string,
  rows: T[],
): Promise<void> {
  const content = rows.map((r) => JSON.stringify(r)).join('\n');
  const tmpFile = `${filePath}.tmp`;
  await fs.writeFile(tmpFile, content ? `${content}\n` : '', 'utf-8');
  await fs.rename(tmpFile, filePath);
}

export async function appendJsonl<T>(
  filePath: string,
  rows: T[],
): Promise<void> {
  const content = rows.map((r) => JSON.stringify(r)).join('\n');
  await fs.appendFile(filePath, `${content}\n`, 'utf-8');
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
  const paths = getEventDataPaths(eventName);
  return parseJsonl<VideoDataEntry>(paths.videoData);
}

export async function getCompilationsForEvent(
  eventName: string,
): Promise<CompilationEntry[]> {
  const paths = getEventDataPaths(eventName);
  return parseJsonl<CompilationEntry>(paths.compData);
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

    // Load existing videodata to find timestamps already processed
    const existing = await parseJsonl<VideoDataEntry>(paths.videoData);
    const existingTimestamps = new Set(existing.map((e) => e.timestamp));

    const newEntries = combos
      .filter((c) => !existingTimestamps.has(c.timestamp))
      .map(comboToVideoEntry);

    if (newEntries.length === 0) {
      return {
        ok: true,
        created: 0,
        message: 'All combos already processed.',
      };
    }

    await appendJsonl(paths.videoData, newEntries);

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
    const entries = await parseJsonl<VideoDataEntry>(paths.videoData);

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
    const sortedEntries = [...entries].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );

    let paired = 0;
    let unmatched = 0;

    const updated = entries.map((entry) => {
      if (entry.filePath) {
        paired += 1;
        return entry;
      }

      const idx = sortedEntries.indexOf(entry);
      if (idx >= 0 && idx < videoFiles.length) {
        paired += 1;
        return {
          ...entry,
          filePath: path.join(paths.videoClips, videoFiles[idx]),
        };
      }
      unmatched += 1;
      return entry;
    });

    await writeJsonlAtomic(paths.videoData, updated);

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
    const paths = getEventDataPaths(eventName);
    const entries = await parseJsonl<VideoDataEntry>(paths.videoData);

    const idx = entries.findIndex((e) => e.timestamp === timestamp);
    if (idx === -1) return { ok: false };

    entries[idx] = { ...entries[idx], ...updates };
    await writeJsonlAtomic(paths.videoData, entries);
    return { ok: true };
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
    const entries = await parseJsonl<VideoDataEntry>(paths.videoData);
    const opts = options as Partial<CompilationOptions>;

    // Filter clips for compilation
    let clips = entries.filter((e) => e.filePath);
    if (opts.excludeUsed) {
      clips = clips.filter((e) => !e.usedInCompilation);
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

    const compilation: CompilationEntry = {
      filePath: compPath,
      title: '',
      description: '',
      clipTitles: clips.map((c) => c.title),
      clipFiles: clips.map((c) => c.filePath),
      thumbnail: '',
      createdAt: new Date().toISOString(),
    };

    // Mark clips as used
    const usedTimestamps = new Set(clips.map((c) => c.timestamp));
    const updatedEntries = entries.map((e) =>
      usedTimestamps.has(e.timestamp)
        ? { ...e, usedInCompilation: compPath }
        : e,
    );
    await writeJsonlAtomic(paths.videoData, updatedEntries);

    // Append compilation record
    await appendJsonl(paths.compData, [compilation]);

    log.info(
      `[video] Created compilation with ${clips.length} clips for ${eventName}`,
    );
    return {
      ok: true,
      filePath: compPath,
      message: `Compilation created with ${clips.length} clips. FFmpeg concat not yet implemented — clip files listed in compdata.jsonl.`,
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
    const paths = getEventDataPaths(eventName);
    const entries = await parseJsonl<CompilationEntry>(paths.compData);

    const idx = entries.findIndex((e) => e.filePath === filePath);
    if (idx === -1) return { ok: false };

    entries[idx] = { ...entries[idx], ...updates };
    await writeJsonlAtomic(paths.compData, entries);
    return { ok: true };
  } catch (err: any) {
    log.error(`[video] updateCompilation failed: ${err.message}`);
    return { ok: false };
  }
}
