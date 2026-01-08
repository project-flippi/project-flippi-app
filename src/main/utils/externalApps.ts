// src/main/utils/externalApps.ts
import fs from 'fs/promises';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';

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
    env: { ...process.env, ...(env ?? {}) },
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
