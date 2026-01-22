// src/main/services/stackService.ts
import path from 'path';
import os from 'os';
import { ensureDir, launchOBS, isObsRunning } from '../utils/externalApps';
import {
  configureObsForEventRecording,
  ObsStatus,
} from './obsService';
import { obsConnectionManager } from './obsConnectionManager';

function obsExePath(): string {
  // %ProgramFiles%\obs-studio\bin\64bit\obs64.exe
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

  return path.join(programFiles, 'obs-studio', 'bin', '64bit', 'obs64.exe');
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
  const running = await isObsRunning();

  let launchedObs = false;
  if (!running) {
    const exePath = obsExePath();
    await launchOBS(exePath, path.dirname(exePath));
    launchedObs = true;
  }

  // If we launched OBS, give it more time to boot and start websocket
  const connectTimeoutMs = launchedObs ? 30_000 : 10_000;

  // Persistent manager handles connect + configure (no disconnect)
  const cfg = await obsConnectionManager.configureForEvent(recordingFolder, {
    connectTimeoutMs,
  });

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