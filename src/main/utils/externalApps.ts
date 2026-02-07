// src/main/utils/externalApps.ts
import fs from 'fs/promises';
import path from 'path';
import { execFile, spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';

export type LaunchOptions = {
  exePath: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  /**
   * If true, the process is launched detached (useful for GUI apps on Windows).
   * Defaults to true.
   */
  detached?: boolean;
  /**
   * If true, stdio is ignored (prevents Electron from hanging on child output).
   * Defaults to true.
   */
  ignoreStdio?: boolean;
};

export type LaunchResult = {
  pid: number;
  exePath: string;
  args: string[];
};

/**
 * Ensure a directory exists (recursive).
 * This replaces the missing ensureDir you referenced in stackService.ts.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Throws if the exe doesn't exist (nice early error).
 */
async function assertExeExists(exePath: string): Promise<void> {
  try {
    // If user passes a relative path, resolve it from CWD for consistency.
    const resolved = path.isAbsolute(exePath) ? exePath : path.resolve(exePath);
    await fs.access(resolved);
  } catch {
    throw new Error(`Executable not found: ${exePath}`);
  }
}

// Env vars that should not leak to child Electron apps.
// ELECTRON_RUN_AS_NODE makes Electron behave as plain Node (no GUI).
// NODE_OPTIONS with e.g. "-r ts-node/register" crashes packaged apps that lack ts-node.
const ELECTRON_ENV_VARS = [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'ELECTRON_FORCE_IS_PACKAGED',
  'NODE_OPTIONS',
  'NODE_PATH',
];

function cleanEnv(
  extra?: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const merged = { ...process.env, ...(extra ?? {}) };
  ELECTRON_ENV_VARS.forEach((key) => {
    delete merged[key];
  });
  return merged;
}

/**
 * Launch an external application (OBS / Clippi / Slippi / etc).
 */
export async function launchApp(opts: LaunchOptions): Promise<LaunchResult> {
  const {
    exePath,
    args = [],
    cwd,
    env,
    detached = true,
    ignoreStdio = true,
  } = opts;

  await assertExeExists(exePath);

  const child: ChildProcess = spawn(exePath, args, {
    cwd,
    env: cleanEnv(env),
    detached,
    stdio: ignoreStdio ? 'ignore' : 'pipe',
    windowsHide: false,
  });

  // If detached + stdio ignored, unref so Electron can exit independently.
  if (detached) child.unref();

  if (!child.pid) {
    throw new Error(`Failed to launch app: ${exePath}`);
  }

  return { pid: child.pid, exePath, args };
}

/**
 * Convenience wrappers (optional but nice for readability in stackService.ts).
 * These just call launchApp() with the correct exe path and args.
 */
export async function launchOBS(
  exePath: string,
  cwd?: string,
  args?: string[],
): Promise<LaunchResult> {
  return launchApp({ exePath, args: args ?? [], cwd });
}

export async function launchClippi(
  exePath: string,
  args: string[] = [],
): Promise<LaunchResult> {
  return launchApp({ exePath, args });
}

export async function launchSlippi(
  exePath: string,
  args: string[] = [],
): Promise<LaunchResult> {
  return launchApp({ exePath, args });
}

const execFileAsync = promisify(execFile);

export async function isClippiRunning(): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false;
  }

  try {
    const { stdout } = await execFileAsync('tasklist', [
      '/FI',
      'IMAGENAME eq Project Clippi.exe',
      '/FO',
      'CSV',
      '/NH',
    ]);

    return stdout.toLowerCase().includes('project clippi.exe');
  } catch {
    return false;
  }
}

export async function killClippi(): Promise<{
  killed: boolean;
  message: string;
}> {
  if (process.platform !== 'win32') {
    return { killed: false, message: 'killClippi only supported on Windows' };
  }

  try {
    const running = await isClippiRunning();
    if (!running) {
      return { killed: false, message: 'Project Clippi is not running' };
    }

    await execFileAsync('taskkill', ['/IM', 'Project Clippi.exe', '/F']);
    return { killed: true, message: 'Project Clippi terminated successfully' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { killed: false, message: `Failed to kill Project Clippi: ${msg}` };
  }
}

export async function isSlippiRunning(): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false;
  }

  try {
    const { stdout } = await execFileAsync('tasklist', [
      '/FI',
      'IMAGENAME eq Slippi Launcher.exe',
      '/FO',
      'CSV',
      '/NH',
    ]);

    return stdout.toLowerCase().includes('slippi launcher.exe');
  } catch {
    return false;
  }
}

export async function killSlippi(): Promise<{
  killed: boolean;
  message: string;
}> {
  if (process.platform !== 'win32') {
    return { killed: false, message: 'killSlippi only supported on Windows' };
  }

  try {
    const running = await isSlippiRunning();
    if (!running) {
      return { killed: false, message: 'Slippi Launcher is not running' };
    }

    await execFileAsync('taskkill', ['/IM', 'Slippi Launcher.exe', '/F']);
    return { killed: true, message: 'Slippi Launcher terminated successfully' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { killed: false, message: `Failed to kill Slippi Launcher: ${msg}` };
  }
}

export async function isObsRunning(): Promise<boolean> {
  // Windows-only implementation for now
  if (process.platform !== 'win32') {
    return false;
  }

  try {
    // CSV output makes parsing consistent.
    // tasklist returns a header; /NH removes the header row.
    const { stdout } = await execFileAsync('tasklist', [
      '/FI',
      'IMAGENAME eq obs64.exe',
      '/FO',
      'CSV',
      '/NH',
    ]);

    // If not running, output is typically like:
    // "INFO: No tasks are running which match the specified criteria."
    // If running, first column includes "obs64.exe"
    return stdout.toLowerCase().includes('obs64.exe');
  } catch {
    // If tasklist fails for any reason, assume not running rather than crash the app.
    return false;
  }
}

export async function killOBS(): Promise<{ killed: boolean; message: string }> {
  // Windows-only implementation for now
  if (process.platform !== 'win32') {
    return { killed: false, message: 'killOBS only supported on Windows' };
  }

  try {
    // Check if OBS is running first
    const running = await isObsRunning();
    if (!running) {
      return { killed: false, message: 'OBS is not running' };
    }

    // Use taskkill to terminate obs64.exe
    await execFileAsync('taskkill', ['/IM', 'obs64.exe', '/F']);
    return { killed: true, message: 'OBS terminated successfully' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { killed: false, message: `Failed to kill OBS: ${msg}` };
  }
}
