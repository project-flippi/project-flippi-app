// src/main/services/obsService.ts
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import OBSWebSocket from 'obs-websocket-js';

export type ObsConnectionSettings = {
  host: string;
  port: string;
  password: string; // allow empty string
  source: 'settings' | 'keysFile';
  keysPath?: string;
};

export type ObsStatus = {
  ok: boolean;
  connected: boolean;
  recordingFolder?: string;
  replayBufferActive?: boolean;
  message?: string;
};

type KeysJson = {
  OBS_HOST?: unknown;
  OBS_PORT?: unknown;
  OBS_PASSWORD?: unknown;
};

function defaultKeysPath(): string {
  // matches set-rec-path.js default
  // %USERPROFILE%\project-flippi\_keys\OBSconnection.json :contentReference[oaicite:4]{index=4}
  return path.join(os.homedir(), 'project-flippi', '_keys', 'OBSconnection.json');
}

function normalizeString(v: unknown): string {
  return (v ?? '').toString().trim();
}

export async function loadObsConnectionSettings(args?: {
  // Pass these if you already have them in electron-store settings.
  // If not provided, we fall back to keys file.
  host?: string;
  port?: string;
  password?: string;
  keysPathOverride?: string;
}): Promise<ObsConnectionSettings> {
  const fromSettingsHost = normalizeString(args?.host);
  const fromSettingsPort = normalizeString(args?.port);
  const fromSettingsPassword =
    args?.password !== undefined ? (args.password ?? '').toString() : undefined;

  // Prefer explicit settings if host/port present
  if (fromSettingsHost && fromSettingsPort && fromSettingsPassword !== undefined) {
    return {
      host: fromSettingsHost,
      port: fromSettingsPort,
      password: fromSettingsPassword,
      source: 'settings',
    };
  }

  // Fallback to keys json file (same semantics as set-rec-path.js)
  const keysPath = args?.keysPathOverride || process.env.OBS_KEYS || defaultKeysPath();

  let raw: string;
  try {
    raw = await fs.readFile(keysPath, 'utf-8');
  } catch (e: any) {
    throw new Error(`OBS keys file not found/readable at: ${keysPath} (${e?.message ?? String(e)})`);
  }

  let cfg: KeysJson;
  try {
    cfg = JSON.parse(raw) as KeysJson;
  } catch (e: any) {
    throw new Error(`OBS keys file is not valid JSON: ${keysPath} (${e?.message ?? String(e)})`);
  }

  const host = normalizeString(cfg.OBS_HOST);
  const port = normalizeString(cfg.OBS_PORT);
  const password = (cfg.OBS_PASSWORD ?? '').toString(); // allow empty string

  // mirrors your JS validation :contentReference[oaicite:5]{index=5}
  if (!host) throw new Error('OBS_HOST missing/empty in keys JSON');
  if (!port) throw new Error('OBS_PORT missing/empty in keys JSON');
  if (cfg.OBS_PASSWORD === undefined) throw new Error('OBS_PASSWORD missing in keys JSON');

  return { host, port, password, source: 'keysFile', keysPath };
}

export async function waitForObsWebsocket(params: {
  timeoutMs?: number;
  intervalMs?: number;
  connection?: { host?: string; port?: string; password?: string; keysPathOverride?: string };
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
      const conn = await loadObsConnectionSettings(params.connection);
      const address = `${conn.host}:${conn.port}`;
      await obs.connect({ address, password: conn.password });
      obs.disconnect();
      return { ok: true };
    } catch {
      try { obs.disconnect(); } catch {}
      return new Promise((resolve) =>
        setTimeout(() => resolve(attempt()), intervalMs),
      );
    }
  };

  return attempt();
}

export async function configureObsForEventRecording(params: {
  recordingFolder: string;
  // Optionally pass settings; otherwise we load from keys file / env.
  connection?: { host?: string; port?: string; password?: string; keysPathOverride?: string };
}): Promise<ObsStatus> {
  const obs = new OBSWebSocket();

  let conn: ObsConnectionSettings;
  try {
    conn = await loadObsConnectionSettings(params.connection);
  } catch (e: any) {
    return { ok: false, connected: false, message: e?.message ?? String(e) };
  }

  const address = `${conn.host}:${conn.port}`;

  try {
    await obs.connect({ address, password: conn.password });

    // Set recording folder (compat-safe)
    await obs.send('SetRecordingFolder', { 'rec-folder': params.recordingFolder }); // :contentReference[oaicite:6]{index=6}
    const got = await obs.send('GetRecordingFolder'); // :contentReference[oaicite:7]{index=7}
    const folder = (got as any)['rec-folder']?.toString?.() ?? params.recordingFolder;

    // Ensure Replay Buffer running
    let replayActive: boolean | undefined;
    try {
      const r = await obs.send('GetReplayBufferStatus'); // :contentReference[oaicite:8]{index=8}
      replayActive = Boolean((r as any)['isReplayBufferActive']);
      if (!replayActive) {
        await obs.send('StartReplayBuffer'); // :contentReference[oaicite:9]{index=9}
        replayActive = true;
      }
    } catch (e: any) {
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
