import OBSWebSocket from 'obs-websocket-js';
import { getSettings } from '../settings/store';

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

  const url = `ws://${conn.host}:${conn.port}`;

  try {
    await obs.connect(url, conn.password);

    // Set recording folder
    await obs.call('SetRecordDirectory', {
      recordDirectory: params.recordingFolder,
    });
    const got = await obs.call('GetRecordDirectory');
    const folder =
      (got as any).recordDirectory?.toString?.() ?? params.recordingFolder;

    // Ensure Replay Buffer running
    let replayActive: boolean | undefined;
    try {
      const r = await obs.call('GetReplayBufferStatus');
      replayActive = Boolean((r as any).outputActive);
      if (!replayActive) {
        await obs.call('StartReplayBuffer');
        replayActive = true;
      }
    } catch {
      // don’t fail hard if replay buffer is disabled in OBS
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
