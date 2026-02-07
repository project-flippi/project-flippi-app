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
  activeFile: string;
  targetFile: string;
  message: string;
};

export type ClippiSyncInfo = {
  linked: boolean;
  targetPath: string | null;
  activeFilePath: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// Path helpers (private)
// ---------------------------------------------------------------------------

function repoRootDir(): string {
  return path.join(os.homedir(), 'project-flippi');
}

function activeComboDir(): string {
  return path.join(repoRootDir(), '_ActiveClippiComboData');
}

function activeComboFile(): string {
  return path.join(activeComboDir(), 'combodata.jsonl');
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
 * Point the active Clippi symlink at the given event's combodata.jsonl.
 *
 * 1. Validate event folder exists
 * 2. Create combodata.jsonl if missing
 * 3. Ensure _ActiveClippiComboData/ directory exists
 * 4. Remove existing file/symlink at active path
 * 5. Create symbolic link (type 'file' for Windows)
 * 6. Update status store
 */
export async function syncClippiComboData(
  eventName: string,
): Promise<SyncResult> {
  const targetFile = eventComboFile(eventName);
  const activeFile = activeComboFile();
  const eventDir = path.join(repoRootDir(), 'Event', eventName);

  // 1. Validate event folder exists
  if (!(await pathExists(eventDir))) {
    const msg = `Event folder does not exist: ${eventDir}`;
    log.error(`[clippi] ${msg}`);
    patchStatus({
      clippi: {
        comboDataLinked: false,
        activeEventName: null,
        activeFilePath: null,
        lastError: msg,
        lastUpdatedAt: Date.now(),
      },
    });
    return { ok: false, activeFile, targetFile, message: msg };
  }

  // 2. Create combodata.jsonl if it doesn't exist
  const dataDir = path.dirname(targetFile);
  await fs.mkdir(dataDir, { recursive: true });
  if (!(await pathExists(targetFile))) {
    await fs.writeFile(targetFile, '', 'utf-8');
    log.info(`[clippi] Created empty combodata.jsonl at ${targetFile}`);
  }

  // 3. Ensure _ActiveClippiComboData/ directory exists
  await fs.mkdir(activeComboDir(), { recursive: true });

  // 4. Remove existing file/symlink at activeFile
  if (await pathExists(activeFile)) {
    await fs.unlink(activeFile);
  }

  // 5. Create symbolic link (type 'file' for Windows)
  try {
    await fs.symlink(targetFile, activeFile, 'file');
  } catch (symErr: unknown) {
    const errMsg =
      symErr instanceof Error ? symErr.message : 'Unknown symlink error';
    const msg = `Failed to create symlink: ${errMsg}`;
    log.error(`[clippi] ${msg}`);
    patchStatus({
      clippi: {
        comboDataLinked: false,
        activeEventName: null,
        activeFilePath: null,
        lastError: msg,
        lastUpdatedAt: Date.now(),
      },
    });
    return { ok: false, activeFile, targetFile, message: msg };
  }

  // 6. Update status store
  log.info(`[clippi] Symlink created: ${activeFile} -> ${targetFile}`);
  patchStatus({
    clippi: {
      comboDataLinked: true,
      activeEventName: eventName,
      activeFilePath: activeFile,
      lastError: undefined,
      lastUpdatedAt: Date.now(),
    },
  });

  return {
    ok: true,
    activeFile,
    targetFile,
    message: `Clippi combodata linked to event: ${eventName}`,
  };
}

/**
 * Return current symlink status (exists, target path, broken link, etc.)
 */
export async function getClippiSyncStatus(): Promise<ClippiSyncInfo> {
  const activeFile = activeComboFile();

  try {
    const target = await fs.readlink(activeFile);
    // Verify the target still exists
    const targetExists = await pathExists(target);
    return {
      linked: targetExists,
      targetPath: target,
      activeFilePath: activeFile,
      error: targetExists ? undefined : 'Symlink target no longer exists',
    };
  } catch {
    // readlink fails if the file doesn't exist or isn't a symlink
    const exists = await pathExists(activeFile);
    if (exists) {
      // File exists but is not a symlink (regular file)
      return {
        linked: false,
        targetPath: null,
        activeFilePath: activeFile,
        error: 'Active file exists but is not a symlink',
      };
    }
    return {
      linked: false,
      targetPath: null,
      activeFilePath: activeFile,
    };
  }
}
