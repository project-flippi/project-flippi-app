// src/main/services/clippiIntegration.ts
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import log from 'electron-log';
import { patchStatus } from './statusStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncResult = {
  ok: boolean;
  configFile: string;
  comboDataPath: string;
  message: string;
};

// ---------------------------------------------------------------------------
// Path helpers (private)
// ---------------------------------------------------------------------------

function repoRootDir(): string {
  return path.join(os.homedir(), 'project-flippi');
}

function flippiConfigFile(): string {
  return path.join(repoRootDir(), 'flippi-config.json');
}

function eventComboFile(eventName: string): string {
  return path.join(
    repoRootDir(),
    'Event',
    eventName,
    'data',
    'combodata.jsonl',
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write flippi-config.json with the combo data path for the given event.
 *
 * 1. Validate event folder exists
 * 2. Create combodata.jsonl if missing
 * 3. Write flippi-config.json with the full path (atomic: .tmp + rename)
 * 4. Update status store
 */
export async function syncClippiComboData(
  eventName: string,
): Promise<SyncResult> {
  const comboDataPath = eventComboFile(eventName);
  const configFile = flippiConfigFile();
  const eventDir = path.join(repoRootDir(), 'Event', eventName);

  // 1. Validate event folder exists
  if (!(await pathExists(eventDir))) {
    const msg = `Event folder does not exist: ${eventDir}`;
    log.error(`[clippi] ${msg}`);
    patchStatus({
      clippi: {
        comboDataConfigWritten: false,
        activeEventName: null,
        lastError: msg,
        lastUpdatedAt: Date.now(),
      },
    });
    return { ok: false, configFile, comboDataPath, message: msg };
  }

  // 2. Create combodata.jsonl if it doesn't exist
  const dataDir = path.dirname(comboDataPath);
  await fs.mkdir(dataDir, { recursive: true });
  if (!(await pathExists(comboDataPath))) {
    await fs.writeFile(comboDataPath, '', 'utf-8');
    log.info(`[clippi] Created empty combodata.jsonl at ${comboDataPath}`);
  }

  // 3. Write flippi-config.json (atomic: write .tmp then rename)
  const configData = JSON.stringify({ comboDataPath }, null, 2);
  const tmpFile = `${configFile}.tmp`;
  try {
    await fs.writeFile(tmpFile, configData, 'utf-8');
    await fs.rename(tmpFile, configFile);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown write error';
    const msg = `Failed to write flippi-config.json: ${errMsg}`;
    log.error(`[clippi] ${msg}`);
    patchStatus({
      clippi: {
        comboDataConfigWritten: false,
        activeEventName: null,
        lastError: msg,
        lastUpdatedAt: Date.now(),
      },
    });
    return { ok: false, configFile, comboDataPath, message: msg };
  }

  // 4. Update status store
  log.info(`[clippi] Config written: ${configFile} -> ${comboDataPath}`);
  patchStatus({
    clippi: {
      comboDataConfigWritten: true,
      activeEventName: eventName,
      lastError: undefined,
      lastUpdatedAt: Date.now(),
    },
  });

  return {
    ok: true,
    configFile,
    comboDataPath,
    message: `Clippi combodata config set for event: ${eventName}`,
  };
}

/**
 * Clear flippi-config.json when the stack stops so Clippi stops writing.
 */
export async function clearFlippiConfig(): Promise<void> {
  const configFile = flippiConfigFile();
  try {
    await fs.unlink(configFile);
    log.info(`[clippi] Cleared flippi-config.json`);
  } catch {
    // File may not exist — that's fine
  }
  patchStatus({
    clippi: {
      comboDataConfigWritten: false,
      activeEventName: null,
      lastError: undefined,
      lastUpdatedAt: Date.now(),
    },
  });
}
