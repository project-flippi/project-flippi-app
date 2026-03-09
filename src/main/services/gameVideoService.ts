// src/main/services/gameVideoService.ts
// Lists game videos, discovers SLP files, pairs them by timestamp
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import log from 'electron-log';
import type {
  GameVideoFile,
  SlpFileInfo,
  GameEntry,
  PairGamesResult,
} from '../../common/meleeTypes';

const VIDEO_EXTENSIONS = /\.(mp4|mkv|avi|mov|flv|webm)$/i;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function eventVideosDir(eventName: string): string {
  return path.join(
    os.homedir(),
    'project-flippi',
    'Event',
    eventName,
    'videos',
  );
}

function pairingsFilePath(eventName: string): string {
  return path.join(
    os.homedir(),
    'project-flippi',
    'Event',
    eventName,
    'data',
    'gamepairings.json',
  );
}

// ---------------------------------------------------------------------------
// SLP filename timestamp parsing
// ---------------------------------------------------------------------------

function parseSlpTimestamp(fileName: string): Date | null {
  // Game_YYYYMMDDTHHMMSS.slp
  const match = fileName.match(
    /Game_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.slp$/i,
  );
  if (!match) return null;
  const [, year, month, day, hour, min, sec] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
}

/**
 * Parse timestamp from OBS video filename.
 * OBS uses: YYYY-MM-DD HH-MM-SS.ext (e.g., "2026-03-07 16-53-28.mp4")
 */
function parseVideoTimestamp(fileName: string): Date | null {
  const match = fileName.match(
    /(\d{4})-(\d{2})-(\d{2})\s+(\d{2})-(\d{2})-(\d{2})\./,
  );
  if (!match) return null;
  const [, year, month, day, hour, min, sec] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
}

// ---------------------------------------------------------------------------
// List video files in event's videos/ directory
// ---------------------------------------------------------------------------

export async function listGameVideos(
  eventName: string,
): Promise<GameVideoFile[]> {
  const dir = eventVideosDir(eventName);
  let fileNames: string[];
  try {
    fileNames = await fs.readdir(dir);
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const videoNames = fileNames.filter((n) => VIDEO_EXTENSIONS.test(n));

  const statResults = await Promise.all(
    videoNames.map(async (name) => {
      try {
        const fullPath = path.join(dir, name);
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) return null;
        const parsed = parseVideoTimestamp(name);
        return {
          filePath: fullPath,
          fileName: name,
          fileCreatedAt: parsed
            ? parsed.toISOString()
            : stat.birthtime.toISOString(),
          fileSize: stat.size,
        } as GameVideoFile;
      } catch {
        return null;
      }
    }),
  );

  const results = statResults.filter((r): r is GameVideoFile => r !== null);
  results.sort((a, b) => a.fileCreatedAt.localeCompare(b.fileCreatedAt));
  return results;
}

// ---------------------------------------------------------------------------
// List SLP files (flat or nested in month/year subdirectories)
// ---------------------------------------------------------------------------

export async function listSlpFiles(
  slpDataFolder: string,
): Promise<SlpFileInfo[]> {
  if (!slpDataFolder) return [];

  const results: SlpFileInfo[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const dirs = entries.filter((e) => e.isDirectory());
    const slpEntries = entries.filter(
      (e) => e.isFile() && e.name.toLowerCase().endsWith('.slp'),
    );

    // Process SLP files in parallel
    const slpResults = await Promise.all(
      slpEntries.map(async (entry) => {
        const parsed = parseSlpTimestamp(entry.name);
        if (!parsed) return null;
        try {
          const fullPath = path.join(dir, entry.name);
          const stat = await fs.stat(fullPath);
          return {
            filePath: fullPath,
            fileName: entry.name,
            gameStartedAt: parsed.toISOString(),
            fileSize: stat.size,
          } as SlpFileInfo;
        } catch {
          return null;
        }
      }),
    );

    slpResults.forEach((r) => {
      if (r) results.push(r);
    });

    // Recurse into subdirectories sequentially
    await dirs.reduce(async (prev, d) => {
      await prev;
      await walk(path.join(dir, d.name));
    }, Promise.resolve());
  }

  await walk(slpDataFolder);
  results.sort((a, b) => a.gameStartedAt.localeCompare(b.gameStartedAt));
  return results;
}

// ---------------------------------------------------------------------------
// Read / write pairings file
// ---------------------------------------------------------------------------

interface StoredPairing {
  videoPath: string;
  slpPath: string | null;
}

async function readPairings(eventName: string): Promise<StoredPairing[]> {
  try {
    const raw = await fs.readFile(pairingsFilePath(eventName), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writePairings(
  eventName: string,
  pairings: StoredPairing[],
): Promise<void> {
  const filePath = pairingsFilePath(eventName);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(pairings, null, 2), 'utf-8');
  await fs.rename(tmp, filePath);
}

// ---------------------------------------------------------------------------
// Pair game videos with SLP files
// ---------------------------------------------------------------------------

const MAX_GAP_MS = 120_000; // 2 minutes max gap between SLP start and video start

export async function pairGameVideos(
  eventName: string,
  slpDataFolder: string,
): Promise<PairGamesResult> {
  try {
    if (!slpDataFolder) {
      return {
        ok: false,
        totalVideos: 0,
        paired: 0,
        unmatched: 0,
        message: 'No SLP data folder configured. Set it in Settings.',
      };
    }

    const videos = await listGameVideos(eventName);
    if (videos.length === 0) {
      return {
        ok: true,
        totalVideos: 0,
        paired: 0,
        unmatched: 0,
        message: 'No video files found.',
      };
    }

    const slpFiles = await listSlpFiles(slpDataFolder);
    if (slpFiles.length === 0) {
      return {
        ok: true,
        totalVideos: videos.length,
        paired: 0,
        unmatched: videos.length,
        message: `Found ${videos.length} videos but no SLP files in the configured folder.`,
      };
    }

    // Greedy matching: for each video (sorted by creation time),
    // find the SLP with the closest gameStartedAt that is <= video creation time.
    // SLP game starts first, then Clippi triggers OBS recording.
    const usedSlpIndices = new Set<number>();
    let paired = 0;

    const pairings: StoredPairing[] = videos.map((video) => {
      const videoTime = new Date(video.fileCreatedAt).getTime();
      let bestIdx = -1;
      let bestGap = Infinity;

      slpFiles.forEach((slp, i) => {
        if (usedSlpIndices.has(i)) return;
        const slpTime = new Date(slp.gameStartedAt).getTime();
        const gap = Math.abs(videoTime - slpTime);
        if (gap <= MAX_GAP_MS && gap < bestGap) {
          bestGap = gap;
          bestIdx = i;
        }
      });

      if (bestIdx >= 0) {
        usedSlpIndices.add(bestIdx);
        paired += 1;
        return {
          videoPath: video.filePath,
          slpPath: slpFiles[bestIdx].filePath,
        };
      }
      return { videoPath: video.filePath, slpPath: null };
    });

    await writePairings(eventName, pairings);

    const unmatched = videos.length - paired;
    log.info(
      `[gameVideo] Paired ${paired}/${videos.length} videos for ${eventName}`,
    );
    return {
      ok: true,
      totalVideos: videos.length,
      paired,
      unmatched,
      message: `Paired ${paired} of ${videos.length} videos (${unmatched} unmatched).`,
    };
  } catch (err: any) {
    log.error(`[gameVideo] pairGameVideos failed: ${err.message}`);
    return {
      ok: false,
      totalVideos: 0,
      paired: 0,
      unmatched: 0,
      message: err.message,
    };
  }
}

// ---------------------------------------------------------------------------
// Get game entries (videos + their paired SLP info)
// ---------------------------------------------------------------------------

async function buildSlpFileInfo(slpPath: string): Promise<SlpFileInfo | null> {
  try {
    const stat = await fs.stat(slpPath);
    const parsed = parseSlpTimestamp(path.basename(slpPath));
    return {
      filePath: slpPath,
      fileName: path.basename(slpPath),
      gameStartedAt: parsed?.toISOString() ?? stat.birthtime.toISOString(),
      fileSize: stat.size,
    };
  } catch {
    return null;
  }
}

export async function getGameEntries(
  eventName: string,
  slpDataFolder: string,
): Promise<GameEntry[]> {
  const videos = await listGameVideos(eventName);
  if (videos.length === 0) return [];

  const pairings = await readPairings(eventName);
  const pairingMap = new Map<string, string | null>(
    pairings.map((p) => [p.videoPath, p.slpPath]),
  );

  // Check if any videos have pairings that need SLP info
  const hasPairings = videos.some((v) => pairingMap.get(v.filePath) != null);

  // Lazy-load SLP info map only when needed
  let slpInfoMap: Map<string, SlpFileInfo> | null = null;
  if (hasPairings && slpDataFolder) {
    const slpFiles = await listSlpFiles(slpDataFolder);
    slpInfoMap = new Map(slpFiles.map((s) => [s.filePath, s]));
  }

  const entries: GameEntry[] = await Promise.all(
    videos.map(async (video) => {
      const slpPath = pairingMap.get(video.filePath) ?? null;
      if (!slpPath) return { video, slpFile: null };

      // Try from the pre-loaded map first
      const fromMap = slpInfoMap?.get(slpPath) ?? null;
      if (fromMap) return { video, slpFile: fromMap };

      // Fallback: stat the file directly
      const fallback = await buildSlpFileInfo(slpPath);
      return { video, slpFile: fallback };
    }),
  );

  return entries;
}
