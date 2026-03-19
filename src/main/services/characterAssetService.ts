// src/main/services/characterAssetService.ts
// Downloads and caches full-size character renders from ThumbnailGeneratorAssets
import path from 'path';
import fsSync from 'fs';
import fs from 'fs/promises';
import { app } from 'electron';
import log from 'electron-log';
import https from 'https';

const ASSETS_BASE_URL =
  'https://raw.githubusercontent.com/Kekwel/ThumbnailGeneratorAssets/main/games/melee/char';

/**
 * Maps Melee characterId (0-25) to the asset filename prefix used in
 * the ThumbnailGeneratorAssets repository.
 */
const CHARACTER_ASSET_NAMES: Record<number, string> = {
  0: 'captain_falcon',
  1: 'donkey_kong',
  2: 'fox',
  3: 'game_and_watch',
  4: 'kirby',
  5: 'bowser',
  6: 'link',
  7: 'luigi',
  8: 'mario',
  9: 'marth',
  10: 'mewtwo',
  11: 'ness',
  12: 'peach',
  13: 'pikachu',
  14: 'ice_climbers',
  15: 'jigglypuff',
  16: 'samus',
  17: 'yoshi',
  18: 'zelda',
  19: 'sheik',
  20: 'falco',
  21: 'young_link',
  22: 'dr_mario',
  23: 'roy',
  24: 'pichu',
  25: 'ganondorf',
};

function getCacheDir(): string {
  return path.join(app.getPath('userData'), 'character-renders', 'melee');
}

function getCachedPath(characterId: number, colorId: number): string {
  return path.join(getCacheDir(), `${characterId}_${colorId}.png`);
}

function getStockIconPath(characterId: number, colorId: number): string {
  // Stock icons are bundled in assets/stock-icons/{charId}/{colorId}/stock.png
  // In packaged app, __dirname is inside app.asar, assets are at app root
  const basePath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '..', '..', 'assets');
  return path.join(
    basePath,
    'stock-icons',
    String(characterId),
    String(colorId),
    'stock.png',
  );
}

/**
 * Download a file from HTTPS URL to a local path.
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpPath = `${dest}.tmp`;
    const file = fsSync.createWriteStream(tmpPath);

    https
      .get(url, { timeout: 15000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          fsSync.unlinkSync(tmpPath);
          if (res.headers.location) {
            downloadFile(res.headers.location, dest)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error('Redirect with no location'));
          }
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fsSync.unlinkSync(tmpPath);
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }

        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            fsSync.renameSync(tmpPath, dest);
            resolve();
          });
        });
      })
      .on('error', (err) => {
        file.close();
        try {
          fsSync.unlinkSync(tmpPath);
        } catch {
          // ignore
        }
        reject(err);
      });
  });
}

/**
 * Get a character render image as a local file path.
 * Downloads from GitHub on first use, caches locally.
 * Falls back to stock icon if download fails.
 */
export async function getCharacterRender(
  characterId: number,
  colorId: number,
): Promise<string> {
  const cached = getCachedPath(characterId, colorId);

  // Check cache first
  try {
    await fs.access(cached);
    return cached;
  } catch {
    // Not cached, try to download
  }

  const assetName = CHARACTER_ASSET_NAMES[characterId];
  if (!assetName) {
    log.warn(
      `[characterAssets] No asset name mapping for characterId ${characterId}`,
    );
    return getStockIconPath(characterId, colorId);
  }

  // Asset filenames use format: {name}_0_{colorId padded to 2 digits}.png
  const paddedColor = String(colorId).padStart(2, '0');
  const url = `${ASSETS_BASE_URL}/${assetName}_0_${paddedColor}.png`;

  try {
    await fs.mkdir(getCacheDir(), { recursive: true });
    await downloadFile(url, cached);
    log.info(
      `[characterAssets] Downloaded render for char ${characterId} color ${colorId}`,
    );
    return cached;
  } catch (err: any) {
    log.warn(
      `[characterAssets] Download failed for ${url}: ${err.message}, using stock icon`,
    );
    return getStockIconPath(characterId, colorId);
  }
}

/**
 * Read a character render file and return it as a base64 data URL.
 */
export async function getCharacterRenderAsDataUrl(
  characterId: number,
  colorId: number,
): Promise<string> {
  const filePath = await getCharacterRender(characterId, colorId);
  const buffer = await fs.readFile(filePath);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}
