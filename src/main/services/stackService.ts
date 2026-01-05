// src/main/services/stackService.ts
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ensureDir, launchOBS, launchClippi, launchSlippi } from '../utils/externalApps';
import { waitForObsWebsocket, configureObsForEventRecording, ObsStatus } from './obsService';

function obsExePath(): string {
  // %ProgramFiles%\obs-studio\bin\64bit\obs64.exe
  const programFiles =
    process.env.ProgramFiles || 'C:\\Program Files';

  return path.join(
    programFiles,
    'obs-studio',
    'bin',
    '64bit',
    'obs64.exe',
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

  // 1) Launch OBS (detached)
  const exePath = obsExePath();
  await launchOBS(exePath, [], path.dirname(exePath));

  // 2) Wait for obs-websocket to be ready
  const ready = await waitForObsWebsocket({
    timeoutMs: 20_000,
    intervalMs: 500,
  });

  if (!ready.ok) {
    return {
      ok: false,
      eventName: params.eventName,
      recordingFolder,
      obs: {
        ok: false,
        connected: false,
        message: ready.message,
      },
      message: `OBS did not become ready: ${ready.message}`,
    };
  }

  // 3) Configure OBS (recording path + replay buffer)
  const obs = await configureObsForEventRecording({
    recordingFolder,
  });

  return {
    ok: obs.ok,
    eventName: params.eventName,
    recordingFolder,
    obs,
    message: obs.ok
      ? `Recording stack started for ${params.eventName}`
      : `OBS configuration failed: ${obs.message}`,
  };
}

