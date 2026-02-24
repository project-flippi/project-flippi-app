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

/**
 * Cross-platform process detection.
 * - Windows: uses `tasklist /FI "IMAGENAME eq <name>"` and checks stdout.
 * - macOS/Linux: uses `pgrep -fi <pattern>` which returns exit code 0 if found.
 */
async function isProcessRunning(
  windowsName: string,
  unixPattern: string,
): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('tasklist', [
        '/FI',
        `IMAGENAME eq ${windowsName}`,
        '/FO',
        'CSV',
        '/NH',
      ]);
      return stdout.toLowerCase().includes(windowsName.toLowerCase());
    }
    // macOS/Linux: pgrep exits 0 if at least one match, 1 if none
    await execFileAsync('pgrep', ['-fi', unixPattern]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cross-platform process termination.
 * - Windows: uses `taskkill /IM <name> /F`.
 * - macOS/Linux: uses `pkill -fi <pattern>`.
 */
async function killProcess(
  windowsName: string,
  unixPattern: string,
  label: string,
): Promise<{ killed: boolean; message: string }> {
  try {
    const running = await isProcessRunning(windowsName, unixPattern);
    if (!running) {
      return { killed: false, message: `${label} is not running` };
    }

    if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/IM', windowsName, '/F']);
    } else {
      await execFileAsync('pkill', ['-fi', unixPattern]);
    }
    return { killed: true, message: `${label} terminated successfully` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { killed: false, message: `Failed to kill ${label}: ${msg}` };
  }
}

export async function isClippiRunning(): Promise<boolean> {
  return isProcessRunning('Project Clippi.exe', 'project.clippi');
}

export async function killClippi(): Promise<{
  killed: boolean;
  message: string;
}> {
  return killProcess('Project Clippi.exe', 'project.clippi', 'Project Clippi');
}

export async function isSlippiRunning(): Promise<boolean> {
  return isProcessRunning('Slippi Launcher.exe', 'slippi.launcher');
}

export async function killSlippi(): Promise<{
  killed: boolean;
  message: string;
}> {
  return killProcess(
    'Slippi Launcher.exe',
    'slippi.launcher',
    'Slippi Launcher',
  );
}

export async function isSlippiDolphinRunning(): Promise<boolean> {
  return isProcessRunning('Slippi Dolphin.exe', 'slippi.dolphin');
}

export async function isObsRunning(): Promise<boolean> {
  return isProcessRunning('obs64.exe', 'obs');
}

export async function killOBS(): Promise<{
  killed: boolean;
  message: string;
}> {
  return killProcess('obs64.exe', 'obs', 'OBS');
}
