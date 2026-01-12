// src/main/services/obsService.ts
import { getSettings } from '../settings/store';
import OBSWebSocket from 'obs-websocket-js';

export type ObsConnectionSettings = {
  host: string;
  port: string;
  password: string; // allow empty string
  source: 'settings';
};

export type ObsStatus = {
  ok: boolean;
  connected: boolean;
  recordingFolder?: string;
  replayBufferActive?: boolean;
  message?: string;
};

function normalizeString(v: unknown): string {
  return (v ?? '').toString().trim();
}

export async function loadObsConnectionSettings(): Promise<ObsConnectionSettings> {
  const settings = await getSettings();

  // Adjust these field names if your schema uses different ones.
  const host = normalizeString(settings?.obs?.host);
  const port = normalizeString(settings?.obs?.port);

  // Password is allowed to be empty string, but must exist as a value (not undefined/null)
  const rawPassword = settings?.obs?.password;
  const passwordDefined = rawPassword !== undefined && rawPassword !== null;
  const password = passwordDefined ? rawPassword.toString() : '';

  if (!host) {
    throw new Error('OBS settings missing: host (Settings → OBS).');
  }
  if (!port) {
    throw new Error('OBS settings missing: port (Settings → OBS).');
  }
  if (!passwordDefined) {
    throw new Error('OBS settings missing: password (Settings → OBS).');
  }

  return { host, port, password, source: 'settings' };
}

export async function waitForObsWebsocket(params: {
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<{ ok: boolean; message?: string }> {
  const timeoutMs = params.timeoutMs ?? 15_000;
  const intervalMs = params.intervalMs ?? 500;

  const started = Date.now();
  // Use Promise-based polling (no loops)
  const attempt = async (): Promise<{ ok: boolean; message?: string }> => {
    if (Date.now() - started > timeoutMs) {
      return { ok: false, message: 'Timed out waiting for OBS websocket.' };
    }

    const obs = new OBSWebSocket();
    try {
      const conn = await loadObsConnectionSettings();
      const address = `${conn.host}:${conn.port}`;
      await obs.connect({ address, password: conn.password });
      obs.disconnect();
      return { ok: true };
    } catch {
      try {
        obs.disconnect();
      } catch {
        // ignore disconnect failures (OBS may already be gone)
      }

      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(attempt());
        }, intervalMs);
      });
    }
  };

  return attempt();
}

export async function configureObsForEventRecording(params: {
  recordingFolder: string;
}): Promise<ObsStatus> {
  const obs = new OBSWebSocket();

  let conn: ObsConnectionSettings;
  try {
    conn = await loadObsConnectionSettings();
  } catch (e: any) {
    return { ok: false, connected: false, message: e?.message ?? String(e) };
  }

  const address = `${conn.host}:${conn.port}`;

  try {
    await obs.connect({ address, password: conn.password });

    // Set recording folder (compat-safe)
    await obs.send('SetRecordingFolder', {
      'rec-folder': params.recordingFolder,
    }); // :contentReference[oaicite:6]{index=6}
    const got = await obs.send('GetRecordingFolder'); // :contentReference[oaicite:7]{index=7}
    const folder =
      (got as any)['rec-folder']?.toString?.() ?? params.recordingFolder;

    // Ensure Replay Buffer running
    let replayActive: boolean | undefined;
    try {
      const r = await obs.send('GetReplayBufferStatus'); // :contentReference[oaicite:8]{index=8}
      replayActive = Boolean((r as any).isReplayBufferActive);
      if (!replayActive) {
        await obs.send('StartReplayBuffer'); // :contentReference[oaicite:9]{index=9}
        replayActive = true;
      }
    } catch {
      // mirrors your JS behavior: don’t fail hard if replay buffer is disabled :contentReference[oaicite:10]{index=10}
      replayActive = undefined;
    }

    try {
      obs.disconnect();
    } catch {
      // ignore
    }

    return {
      ok: true,
      connected: true,
      recordingFolder: folder,
      replayBufferActive: replayActive,
      message:
        replayActive === true
          ? `OBS connected. Recording folder set. Replay Buffer running. (${conn.source})`
          : `OBS connected. Recording folder set. Replay Buffer status unknown. (${conn.source})`,
    };
  } catch (e: any) {
    try {
      obs.disconnect();
    } catch {
      // ignore
    }
    return {
      ok: false,
      connected: false,
      message: `Failed to configure OBS via obs-websocket: ${e?.message ?? String(e)}`,
    };
  }
}
