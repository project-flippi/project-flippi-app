// src/main/services/setService.ts
// CRUD operations for tournament sets
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
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

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function setsFilePath(eventName: string): string {
  return path.join(
    os.homedir(),
    'project-flippi',
    'Event',
    eventName,
    'data',
    'sets.json',
  );
}

// ---------------------------------------------------------------------------
// Read / write sets file
// ---------------------------------------------------------------------------

export async function readSets(eventName: string): Promise<GameSet[]> {
  try {
    const raw = await fs.readFile(setsFilePath(eventName), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeSets(eventName: string, sets: GameSet[]): Promise<void> {
  const filePath = setsFilePath(eventName);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(sets, null, 2), 'utf-8');
  await fs.rename(tmp, filePath);
}

/** Sort video paths by filename (alphabetical = chronological for OBS naming) */
function sortVideoPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b)),
  );
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
  const sets = await readSets(eventName);

  const newSet: GameSet = {
    id: randomUUID(),
    matchType,
    setType,
    phase,
    roundType,
    roundNumber,
    playerOverrides,
    gameVideoFilePaths: [videoFilePath],
    createdAt: new Date().toISOString(),
  };

  sets.push(newSet);
  await writeSets(eventName, sets);
  log.info(`[sets] Created set ${newSet.id} for event ${eventName}`);
  return newSet;
}

export async function addGameToSet(
  eventName: string,
  setId: string,
  videoFilePath: string,
): Promise<GameSet> {
  const sets = await readSets(eventName);
  const set = sets.find((s) => s.id === setId);
  if (!set) throw new Error(`Set ${setId} not found`);

  // Ensure game isn't already in any set
  const existingSet = sets.find((s) =>
    s.gameVideoFilePaths.includes(videoFilePath),
  );
  if (existingSet) {
    throw new Error(
      `This game is already in set "${existingSet.id}". Remove it first.`,
    );
  }

  set.gameVideoFilePaths = sortVideoPaths([
    ...set.gameVideoFilePaths,
    videoFilePath,
  ]);
  await writeSets(eventName, sets);
  log.info(`[sets] Added game to set ${setId}`);
  return set;
}

export async function removeGameFromSet(
  eventName: string,
  setId: string,
  videoFilePath: string,
): Promise<GameSet | null> {
  const sets = await readSets(eventName);
  const setIdx = sets.findIndex((s) => s.id === setId);
  if (setIdx < 0) throw new Error(`Set ${setId} not found`);

  const set = sets[setIdx];
  set.gameVideoFilePaths = set.gameVideoFilePaths.filter(
    (p) => p !== videoFilePath,
  );

  if (set.gameVideoFilePaths.length === 0) {
    sets.splice(setIdx, 1);
    await writeSets(eventName, sets);
    log.info(`[sets] Deleted empty set ${setId}`);
    return null;
  }

  await writeSets(eventName, sets);
  log.info(`[sets] Removed game from set ${setId}`);
  return set;
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
  const sets = await readSets(eventName);
  const set = sets.find((s) => s.id === setId);
  if (!set) throw new Error(`Set ${setId} not found`);

  if (updates.matchType !== undefined) set.matchType = updates.matchType;
  if (updates.setType !== undefined) set.setType = updates.setType;
  if (updates.phase !== undefined) set.phase = updates.phase;
  if (updates.roundType !== undefined) set.roundType = updates.roundType;
  if (updates.roundNumber !== undefined) set.roundNumber = updates.roundNumber;
  if (updates.playerOverrides !== undefined)
    set.playerOverrides = updates.playerOverrides;

  await writeSets(eventName, sets);
  log.info(`[sets] Updated set ${setId}`);
  return set;
}

export async function deleteSet(
  eventName: string,
  setId: string,
): Promise<void> {
  const sets = await readSets(eventName);
  const filtered = sets.filter((s) => s.id !== setId);
  await writeSets(eventName, filtered);
  log.info(`[sets] Deleted set ${setId}`);
}

/**
 * Find which set (if any) a video belongs to.
 */
export async function findSetForVideo(
  eventName: string,
  videoFilePath: string,
): Promise<string | null> {
  const sets = await readSets(eventName);
  const set = sets.find((s) => s.gameVideoFilePaths.includes(videoFilePath));
  return set?.id ?? null;
}

// ---------------------------------------------------------------------------
// Get enriched set entries for renderer
// ---------------------------------------------------------------------------

/**
 * Build SetEntry[] from pre-loaded game entries — avoids re-calling
 * getGameEntries() when games are already loaded.
 */
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

  // Load all game entries once
  const allGames = await getGameEntries(eventName, slpDataFolder);
  return buildSetEntries(sets, allGames, eventName);
}
