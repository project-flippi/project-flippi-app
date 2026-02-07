// src/main/services/obsConnectionManager.ts
import OBSWebSocket from 'obs-websocket-js';
import { patchStatus, getStatus } from './statusStore';
import { loadObsConnectionSettings } from './obsService';

type EnsureConnectedResult =
  | { ok: true }
  | { ok: false; reason: 'auth_failed' | 'timeout' | 'error'; message: string };

function setObsWebsocketState(
  websocket:
    | 'unknown'
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'auth_failed'
    | 'error',
  lastError?: string,
) {
  const prev = getStatus().obs.websocket;
  const prevErr = getStatus().obs.lastError;

  if (prev !== websocket || prevErr !== lastError) {
    patchStatus({
      obs: {
        websocket,
        lastError,
      },
    });
  }
}

function isAuthFailureMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('authentication') ||
    m.includes('auth') ||
    m.includes('password') ||
    m.includes('identify')
  );
}

function formatUnknownError(err: unknown): string {
  if (err instanceof Error) return err.message;

  if (typeof err === 'string') return err;

  if (err && typeof err === 'object') {
    // Try common shapes without assuming too much
    const anyErr = err as Record<string, unknown>;
    let msg: string | undefined;
    if (typeof anyErr.message === 'string') {
      msg = anyErr.message;
    } else if (typeof anyErr.error === 'string') {
      msg = anyErr.error;
    }

    let code: string | undefined;
    if (typeof anyErr.code === 'string') {
      code = anyErr.code;
    } else if (typeof anyErr.code === 'number') {
      code = String(anyErr.code);
    }

    if (msg && code) return `${msg} (${code})`;
    if (msg) return msg;

    try {
      const json = JSON.stringify(err);
      if (json && json !== '{}') return json;
    } catch {
      // ignore
    }

    return '[unknown error object]';
  }

  return String(err);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Singleton manager for a single persistent OBS websocket connection.
 * Other apps can also connect to OBS — this does not interfere with them.
 */
class ObsConnectionManager {
  private obs: OBSWebSocket | null = null;

  private connectPromise: Promise<EnsureConnectedResult> | null = null;

  private authFailed = false;

  private connectionReady = false;

  private ensureObsInstance(): OBSWebSocket {
    if (!this.obs) {
      this.obs = new OBSWebSocket();

      try {
        // @ts-expect-error - event name depends on obs-websocket-js version
        this.obs.on('ConnectionClosed', () => {
          this.connectionReady = false;
          if (!this.authFailed) setObsWebsocketState('disconnected');
        });
      } catch {
        // ignore
      }

      try {
        // @ts-expect-error - event name depends on obs-websocket-js version
        this.obs.on('ConnectionOpened', () => {
          this.connectionReady = true;
          setObsWebsocketState('connected');
        });
      } catch {
        // ignore
      }
    }

    return this.obs;
  }

  /**
   * Call this when OBS settings change (host/port/password).
   * It clears auth_failed and forces reconnection on next ensureConnected().
   */
  public invalidateConnection(): void {
    this.authFailed = false;
    this.connectionReady = false;

    this.connectPromise = null;

    if (this.obs) {
      try {
        this.obs.disconnect();
      } catch {
        // ignore
      }
    }

    setObsWebsocketState('disconnected', undefined);
  }

  public isConnected(): boolean {
    return this.connectionReady;
  }

  /**
   * Ensure we have a live websocket connection, with guarded concurrency.
   * - If connecting, await the same promise.
   * - If auth_failed, do not retry until invalidateConnection() is called.
   */
  public async ensureConnected(params?: {
    timeoutMs?: number;
    intervalMs?: number;
  }): Promise<EnsureConnectedResult> {
    if (this.connectionReady) return { ok: true };

    if (this.authFailed) {
      return {
        ok: false,
        reason: 'auth_failed',
        message: 'OBS websocket auth failed. Check password in Settings → OBS.',
      };
    }

    if (this.connectPromise) return this.connectPromise;

    const timeoutMs = params?.timeoutMs ?? 20_000;
    const intervalMs = params?.intervalMs ?? 500;

    setObsWebsocketState('connecting', undefined);

    const p = this.connectWithRetry({ timeoutMs, intervalMs });
    this.connectPromise = p;

    const result = await p;
    this.connectPromise = null;

    return result;
  }

  private async connectWithRetry(params: {
    timeoutMs: number;
    intervalMs: number;
  }): Promise<EnsureConnectedResult> {
    const { timeoutMs, intervalMs } = params;

    const obs = this.ensureObsInstance();

    const conn = await loadObsConnectionSettings();
    const address = `${conn.host}:${conn.port}`;

    const startedAt = Date.now();
    let lastErrMsg: string | undefined;

    // eslint-disable-next-line no-await-in-loop
    while (Date.now() - startedAt < timeoutMs) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await obs.connect({ address, password: conn.password });

        this.connectionReady = true;
        setObsWebsocketState('connected', undefined);
        return { ok: true };
      } catch (err: unknown) {
        const msg = formatUnknownError(err);
        lastErrMsg = msg;

        // Auth failure: stop retrying until settings change
        if (isAuthFailureMessage(msg)) {
          this.authFailed = true;
          this.connectionReady = false;

          setObsWebsocketState(
            'auth_failed',
            'Authentication failed (check OBS password).',
          );

          return { ok: false, reason: 'auth_failed', message: msg };
        }

        // Non-auth failure: likely OBS still starting or websocket not ready yet.
        // Keep "connecting" status while we retry.
        this.connectionReady = false;
        setObsWebsocketState('connecting', undefined);

        // eslint-disable-next-line no-await-in-loop
        await delay(intervalMs);
      }
    }

    // Timeout
    this.connectionReady = false;

    setObsWebsocketState(
      'disconnected',
      'Timed out waiting for OBS websocket.',
    );

    return {
      ok: false,
      reason: 'timeout',
      message: lastErrMsg
        ? `Timed out waiting for OBS websocket. Last error: ${lastErrMsg}`
        : 'Timed out waiting for OBS websocket.',
    };
  }

  /**
   * Configure OBS for recording (requires connection).
   */
  public async configureForEvent(
    recordingFolder: string,
    opts?: { connectTimeoutMs?: number },
  ): Promise<{ ok: boolean; message?: string }> {
    const connRes = await this.ensureConnected({
      timeoutMs: opts?.connectTimeoutMs ?? 20_000,
      intervalMs: 500,
    });

    if (!connRes.ok) return { ok: false, message: connRes.message };

    const obs = this.ensureObsInstance();

    try {
      await obs.send('SetRecordingFolder', { 'rec-folder': recordingFolder });
      const got = await obs.send('GetRecordingFolder');
      const folder =
        (got as any)['rec-folder']?.toString?.() ?? recordingFolder;

      // Replay buffer best-effort
      try {
        const r = await obs.send('GetReplayBufferStatus');
        const active = Boolean((r as any).isReplayBufferActive);
        if (!active) {
          await obs.send('StartReplayBuffer');
        }
      } catch {
        // ignore: replay buffer may not be enabled
      }

      return { ok: true, message: `OBS configured (folder: ${folder}).` };
    } catch (err: unknown) {
      const msg = formatUnknownError(err);
      setObsWebsocketState('error', msg);
      return { ok: false, message: msg };
    }
  }

  /**
   * Stop the replay buffer if it's active.
   */
  public async stopReplayBuffer(): Promise<{ ok: boolean; message?: string }> {
    if (!this.connectionReady) {
      return { ok: false, message: 'Not connected to OBS' };
    }

    const obs = this.ensureObsInstance();

    try {
      const r = await obs.send('GetReplayBufferStatus');
      const active = Boolean((r as any).isReplayBufferActive);
      if (active) {
        await obs.send('StopReplayBuffer');
      }
      return { ok: true, message: 'Replay buffer stopped' };
    } catch (err: unknown) {
      const msg = formatUnknownError(err);
      return { ok: false, message: `Failed to stop replay buffer: ${msg}` };
    }
  }

  /**
   * Stop recording if it's active.
   */
  public async stopRecording(): Promise<{ ok: boolean; message?: string }> {
    if (!this.connectionReady) {
      return { ok: false, message: 'Not connected to OBS' };
    }

    const obs = this.ensureObsInstance();

    try {
      const r = await obs.send('GetRecordingStatus');
      const recording = Boolean((r as any).isRecording);
      if (recording) {
        await obs.send('StopRecording');
      }
      return { ok: true, message: 'Recording stopped' };
    } catch (err: unknown) {
      const msg = formatUnknownError(err);
      return { ok: false, message: `Failed to stop recording: ${msg}` };
    }
  }

  /**
   * Start the replay buffer.
   */
  public async startReplayBuffer(): Promise<{ ok: boolean; message?: string }> {
    if (!this.connectionReady) {
      return { ok: false, message: 'Not connected to OBS' };
    }

    const obs = this.ensureObsInstance();

    try {
      const r = await obs.send('GetReplayBufferStatus');
      const active = Boolean((r as any).isReplayBufferActive);
      if (!active) {
        await obs.send('StartReplayBuffer');
      }
      return { ok: true, message: 'Replay buffer started' };
    } catch (err: unknown) {
      const msg = formatUnknownError(err);
      return { ok: false, message: `Failed to start replay buffer: ${msg}` };
    }
  }
}

const obsConnectionManager = new ObsConnectionManager();
export default obsConnectionManager;
