// src/main/services/stackService.ts
import path from 'path';
import os from 'os';
import log from 'electron-log';
import {
  ensureDir,
  launchOBS,
  launchClippi,
  launchSlippi,
  isObsRunning,
  isClippiRunning,
  isSlippiRunning,
  killOBS,
  killClippi,
  killSlippi,
} from '../utils/externalApps';
import { ObsStatus } from './obsService';
import obsConnectionManager from './obsConnectionManager';
import { patchStatus, getStatus } from './statusStore';
import { syncClippiComboData, clearFlippiConfig } from './clippiIntegration';
import { getSettings } from '../settings/store';
import {
  startPolling as startGameCapturePolling,
  stopPolling as stopGameCapturePolling,
} from './gameCaptureService';

function obsExePath(): string {
  // %ProgramFiles%\obs-studio\bin\64bit\obs64.exe
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

  return path.join(programFiles, 'obs-studio', 'bin', '64bit', 'obs64.exe');
}

function clippiExePath(): string {
  // %LOCALAPPDATA%\Programs\project-clippi\Project Clippi.exe
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

  return path.join(
    localAppData,
    'Programs',
    'project-clippi',
    'Project Clippi.exe',
  );
}

function slippiExePath(): string {
  // %LOCALAPPDATA%\Programs\Slippi Launcher\Slippi Launcher.exe
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

  return path.join(
    localAppData,
    'Programs',
    'Slippi Launcher',
    'Slippi Launcher.exe',
  );
}

export type StartStackResult = {
  ok: boolean;
  eventName: string;
  recordingFolder: string;
  obs: ObsStatus;
  message: string;
};

function repoRootDir(): string {
  return path.join(os.homedir(), 'project-flippi');
}

function eventsDir(): string {
  return path.join(repoRootDir(), 'Event');
}

function eventVideosDir(eventName: string): string {
  // matches bat: %EVENTS_DIR%\%EVENT_NAME%\videos
  return path.join(eventsDir(), eventName, 'videos');
}

export async function startStack(params: {
  eventName: string;
}): Promise<StartStackResult> {
  const recordingFolder = eventVideosDir(params.eventName);

  // Ensure Event/<name>/videos exists
  await ensureDir(recordingFolder);

  // Only launch OBS if not already running
  const obsRunning = await isObsRunning();

  let launchedObs = false;
  if (!obsRunning) {
    const exePath = obsExePath();
    await launchOBS(exePath, path.dirname(exePath));
    launchedObs = true;
  }

  // Only launch Project Clippi if not already running.
  // Uses launchClippi (spawn with cleanEnv) to strip dev-only env vars
  // like NODE_OPTIONS that would crash a packaged Electron app.
  const clippiRunning = await isClippiRunning();
  if (!clippiRunning) {
    try {
      const clippiPath = clippiExePath();
      await launchClippi(clippiPath);
    } catch (err) {
      log.error('[stack] Failed to launch Project Clippi:', err);
    }
  }

  // Only launch Slippi Launcher if not already running.
  const slippiRunning = await isSlippiRunning();
  if (!slippiRunning) {
    try {
      const slippiPath = slippiExePath();
      await launchSlippi(slippiPath);
    } catch (err) {
      log.error('[stack] Failed to launch Slippi Launcher:', err);
    }
  }

  // If we launched OBS, give it more time to boot and start websocket
  const connectTimeoutMs = launchedObs ? 30_000 : 10_000;

  const { obs: obsSettings } = await getSettings();

  // Persistent manager handles connect + configure (no disconnect)
  const cfg = await obsConnectionManager.configureForEvent(recordingFolder, {
    connectTimeoutMs,
    enableReplayBuffer: obsSettings.enableReplayBuffer,
    startRecording: obsSettings.startRecording,
    startStreaming: obsSettings.startStreaming,
  });

  // Update stack state on success
  if (cfg.ok) {
    patchStatus({
      stack: {
        running: true,
        currentEventName: params.eventName,
        startedAt: Date.now(),
      },
    });

    // Sync Clippi combodata config (non-fatal)
    const clippiSync = await syncClippiComboData(params.eventName);
    if (!clippiSync.ok) {
      log.warn('[stack] Clippi combodata sync failed:', clippiSync.message);
    }

    // Start game capture detection polling
    startGameCapturePolling();
  }

  return {
    ok: cfg.ok,
    eventName: params.eventName,
    recordingFolder,
    obs: {
      ok: cfg.ok,
      connected: cfg.ok,
      message: cfg.message,
    },
    message: cfg.ok
      ? `Recording stack started for ${params.eventName}`
      : `OBS setup failed: ${cfg.message ?? 'Unknown error'}`,
  };
}

export type StopStackResult = {
  ok: boolean;
  message: string;
  warnings?: string[];
};

export async function stopStack(): Promise<StopStackResult> {
  const warnings: string[] = [];

  // Stop replay buffer (best-effort)
  const replayRes = await obsConnectionManager.stopReplayBuffer();
  if (!replayRes.ok && replayRes.message !== 'Not connected to OBS') {
    warnings.push(replayRes.message ?? 'Failed to stop replay buffer');
  }

  // Stop recording (best-effort)
  const recordRes = await obsConnectionManager.stopRecording();
  if (!recordRes.ok && recordRes.message !== 'Not connected to OBS') {
    warnings.push(recordRes.message ?? 'Failed to stop recording');
  }

  // Stop streaming (best-effort)
  const streamRes = await obsConnectionManager.stopStreaming();
  if (!streamRes.ok && streamRes.message !== 'Not connected to OBS') {
    warnings.push(streamRes.message ?? 'Failed to stop streaming');
  }

  // Kill OBS process
  const killRes = await killOBS();
  if (!killRes.killed && killRes.message !== 'OBS is not running') {
    warnings.push(killRes.message);
  }

  // Kill Project Clippi process
  const killClippiRes = await killClippi();
  if (
    !killClippiRes.killed &&
    killClippiRes.message !== 'Project Clippi is not running'
  ) {
    warnings.push(killClippiRes.message);
  }

  // Kill Slippi Launcher process
  const killSlippiRes = await killSlippi();
  if (
    !killSlippiRes.killed &&
    killSlippiRes.message !== 'Slippi Launcher is not running'
  ) {
    warnings.push(killSlippiRes.message);
  }

  // Stop game capture detection polling
  stopGameCapturePolling();

  // Clear flippi-config.json so Clippi stops writing combo data
  await clearFlippiConfig();

  // Reset stack state
  patchStatus({
    stack: {
      running: false,
      currentEventName: null,
      startedAt: null,
    },
  });

  return {
    ok: true,
    message: 'Recording stack stopped',
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export type RelaunchClippiResult = { ok: boolean; message: string };

export async function relaunchClippi(): Promise<RelaunchClippiResult> {
  const status = getStatus();

  if (!status.stack.running) {
    return { ok: false, message: 'Stack is not running' };
  }

  const alreadyRunning = await isClippiRunning();
  if (alreadyRunning) {
    return { ok: true, message: 'Project Clippi is already running' };
  }

  try {
    await launchClippi(clippiExePath());
  } catch (err) {
    log.error('[stack] Failed to relaunch Project Clippi:', err);
    return {
      ok: false,
      message: `Failed to launch Clippi: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Re-sync combo data for the current event
  const { currentEventName } = status.stack;
  if (currentEventName) {
    const clippiSync = await syncClippiComboData(currentEventName);
    if (!clippiSync.ok) {
      log.warn('[stack] Clippi combodata sync failed:', clippiSync.message);
    }
  }

  return { ok: true, message: 'Project Clippi relaunched' };
}

export type RelaunchSlippiResult = { ok: boolean; message: string };

export async function relaunchSlippi(): Promise<RelaunchSlippiResult> {
  const status = getStatus();

  if (!status.stack.running) {
    return { ok: false, message: 'Stack is not running' };
  }

  const alreadyRunning = await isSlippiRunning();
  if (alreadyRunning) {
    return { ok: true, message: 'Slippi Launcher is already running' };
  }

  try {
    await launchSlippi(slippiExePath());
  } catch (err) {
    log.error('[stack] Failed to relaunch Slippi Launcher:', err);
    return {
      ok: false,
      message: `Failed to launch Slippi: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { ok: true, message: 'Slippi Launcher relaunched' };
}

export type SwitchEventResult = {
  ok: boolean;
  eventName: string;
  message: string;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function switchEvent(params: {
  eventName: string;
}): Promise<SwitchEventResult> {
  const status = getStatus();

  // If stack is not running, just start it
  if (!status.stack.running) {
    const result = await startStack(params);
    return {
      ok: result.ok,
      eventName: params.eventName,
      message: result.message,
    };
  }

  // Stack is running - gracefully switch events
  const recordingFolder = eventVideosDir(params.eventName);
  await ensureDir(recordingFolder);

  const { obs: obsSettings } = await getSettings();

  // Stop replay buffer and recording
  await obsConnectionManager.stopReplayBuffer();
  await obsConnectionManager.stopRecording();

  // Give OBS time to fully stop the replay buffer before we change folder and restart
  await delay(500);

  // Reconfigure folder and restart features per settings
  const cfg = await obsConnectionManager.configureForEvent(recordingFolder, {
    connectTimeoutMs: 10_000,
    enableReplayBuffer: obsSettings.enableReplayBuffer,
    startRecording: obsSettings.startRecording,
    startStreaming: false, // don't restart streaming on event switch
  });

  if (!cfg.ok) {
    return {
      ok: false,
      eventName: params.eventName,
      message: `Failed to switch event: ${cfg.message ?? 'Unknown error'}`,
    };
  }

  patchStatus({
    stack: {
      running: true,
      currentEventName: params.eventName,
      startedAt: Date.now(),
    },
  });

  // Sync Clippi combodata symlink (non-fatal)
  const clippiSync = await syncClippiComboData(params.eventName);
  if (!clippiSync.ok) {
    log.warn('[stack] Clippi combodata sync failed:', clippiSync.message);
  }

  return {
    ok: true,
    eventName: params.eventName,
    message: `Switched to event: ${params.eventName}`,
  };
}
