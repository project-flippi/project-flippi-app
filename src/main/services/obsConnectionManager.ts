// src/main/services/obsConnectionManager.ts
import OBSWebSocket from 'obs-websocket-js';
import log from 'electron-log';
import { patchStatus, getStatus } from './statusStore';
import { loadObsConnectionSettings } from './obsService';
import { getSettings } from '../settings/store';
import { getEventDb } from '../database/db';
import type { SourceTransform } from '../../common/obsTransformTypes';

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
        this.obs.on('ConnectionClosed', () => {
          this.connectionReady = false;
          if (!this.authFailed) setObsWebsocketState('disconnected');
        });
      } catch {
        // ignore
      }

      try {
        this.obs.on('Identified', () => {
          this.connectionReady = true;
          setObsWebsocketState('connected');
        });
      } catch {
        // ignore
      }

      // Subscribe to OBS output state events for instant UI updates
      this.obs.on('RecordStateChanged', (data) => {
        patchStatus({ obs: { recording: data.outputActive } });

        // When recording stops, capture source transforms for the saved file
        if (!data.outputActive && (data as any).outputPath) {
          this.captureAndStoreTransforms((data as any).outputPath).catch(
            (err) => {
              log.warn(
                `[obs] Failed to capture transforms: ${formatUnknownError(err)}`,
              );
            },
          );
        }
      });

      this.obs.on('StreamStateChanged', (data) => {
        patchStatus({ obs: { streaming: data.outputActive } });
      });

      this.obs.on('ReplayBufferStateChanged', (data) => {
        patchStatus({ obs: { replayBufferActive: data.outputActive } });
      });
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
    const url = `ws://${conn.host}:${conn.port}`;

    const startedAt = Date.now();
    let lastErrMsg: string | undefined;

    // eslint-disable-next-line no-await-in-loop
    while (Date.now() - startedAt < timeoutMs) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await obs.connect(url, conn.password);

        this.connectionReady = true;
        setObsWebsocketState('connected', undefined);
        this.syncFeatureStatus();
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
   * Fire-and-forget initial sync of feature status after connecting.
   * Events only fire on changes, so we need to query once to catch
   * features that were already running before Flippi connected.
   */
  private syncFeatureStatus(): void {
    this.getFeatureStatus()
      .then((status) => {
        if (status) patchStatus({ obs: status });
        return undefined;
      })
      .catch(() => {});
  }

  /**
   * Configure OBS for recording (requires connection).
   */
  public async configureForEvent(
    recordingFolder: string,
    opts?: {
      connectTimeoutMs?: number;
      enableReplayBuffer?: boolean;
      startRecording?: boolean;
      startStreaming?: boolean;
    },
  ): Promise<{ ok: boolean; message?: string }> {
    const connRes = await this.ensureConnected({
      timeoutMs: opts?.connectTimeoutMs ?? 20_000,
      intervalMs: 500,
    });

    if (!connRes.ok) return { ok: false, message: connRes.message };

    // OBS v5 WebSocket resolves connect() after identification, but OBS
    // may not be fully ready to handle requests yet (especially right
    // after launch). Wait before the first attempt, then retry if needed.
    await delay(3000);

    const maxRetries = 3;
    let lastErr: string | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0) {
        // eslint-disable-next-line no-await-in-loop
        await delay(1000);
      }

      // eslint-disable-next-line no-await-in-loop
      const result = await this.tryConfigureForEvent(recordingFolder, opts);
      if (result.ok) return result;

      lastErr = result.message;
    }

    setObsWebsocketState('error', lastErr);
    return { ok: false, message: lastErr };
  }

  private async tryConfigureForEvent(
    recordingFolder: string,
    opts?: {
      enableReplayBuffer?: boolean;
      startRecording?: boolean;
      startStreaming?: boolean;
    },
  ): Promise<{ ok: boolean; message?: string }> {
    const obs = this.ensureObsInstance();

    try {
      await obs.call('SetRecordDirectory', {
        recordDirectory: recordingFolder,
      });
      const got = await obs.call('GetRecordDirectory');
      const folder =
        (got as any).recordDirectory?.toString?.() ?? recordingFolder;

      // Ensure consistent filename formatting
      await obs.call('SetProfileParameter', {
        parameterCategory: 'Output',
        parameterName: 'FilenameFormatting',
        parameterValue: '%CCYY-%MM-%DD %hh-%mm-%ss',
      });

      // Set replay buffer filename prefix (saves to clips/ subfolder)
      try {
        await obs.call('SetProfileParameter', {
          parameterCategory: 'SimpleOutput',
          parameterName: 'RecRBPrefix',
          parameterValue: 'clips/Replay',
        });
      } catch {
        // May fail if OBS is in Advanced output mode; non-critical
      }

      // Replay buffer (enabled by default for backwards-compat)
      if (opts?.enableReplayBuffer !== false) {
        try {
          const r = await obs.call('GetReplayBufferStatus');
          const active = Boolean((r as any).outputActive);
          if (!active) {
            await obs.call('StartReplayBuffer');
          }
        } catch {
          // ignore: replay buffer may not be enabled
        }
      }

      // Recording (opt-in)
      if (opts?.startRecording) {
        try {
          const r = await obs.call('GetRecordStatus');
          const recording = Boolean((r as any).outputActive);
          if (!recording) {
            await obs.call('StartRecord');
          }
        } catch {
          // ignore
        }
      }

      // Streaming (opt-in)
      if (opts?.startStreaming) {
        try {
          const r = await obs.call('GetStreamStatus');
          const streaming = Boolean((r as any).outputActive);
          if (!streaming) {
            await obs.call('StartStream');
          }
        } catch {
          // ignore
        }
      }

      return { ok: true, message: `OBS configured (folder: ${folder}).` };
    } catch (err: unknown) {
      const msg = formatUnknownError(err);
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
      const r = await obs.call('GetReplayBufferStatus');
      const active = Boolean((r as any).outputActive);
      if (active) {
        await obs.call('StopReplayBuffer');
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
      const r = await obs.call('GetRecordStatus');
      const recording = Boolean((r as any).outputActive);
      if (recording) {
        await obs.call('StopRecord');
      }
      return { ok: true, message: 'Recording stopped' };
    } catch (err: unknown) {
      const msg = formatUnknownError(err);
      return { ok: false, message: `Failed to stop recording: ${msg}` };
    }
  }

  /**
   * Generic pass-through to obs.send(). Throws if not connected.
   */
  public async sendRequest(
    requestType: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.connectionReady) {
      throw new Error('Not connected to OBS');
    }

    const obs = this.ensureObsInstance();
    return obs.call(requestType as any, params as any);
  }

  /**
   * Get all OBS sources. Returns { name, type, typeId }[].
   */
  public async getSourcesList(): Promise<
    { name: string; type: string; typeId: string }[]
  > {
    const result = (await this.sendRequest('GetInputList')) as any;
    const sources: { name: string; type: string; typeId: string }[] = [];

    if (Array.isArray(result?.inputs)) {
      result.inputs.forEach((s: any) => {
        if (typeof s.inputName === 'string') {
          sources.push({
            name: s.inputName,
            type: s.inputKind ?? '',
            typeId: s.inputUuid ?? '',
          });
        }
      });
    }

    return sources;
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
      const r = await obs.call('GetReplayBufferStatus');
      const active = Boolean((r as any).outputActive);
      if (!active) {
        await obs.call('StartReplayBuffer');
      }
      return { ok: true, message: 'Replay buffer started' };
    } catch (err: unknown) {
      const msg = formatUnknownError(err);
      return { ok: false, message: `Failed to start replay buffer: ${msg}` };
    }
  }

  /**
   * Start recording if not already active.
   */
  public async startRecording(): Promise<{ ok: boolean; message?: string }> {
    if (!this.connectionReady) {
      return { ok: false, message: 'Not connected to OBS' };
    }

    const obs = this.ensureObsInstance();

    try {
      const r = await obs.call('GetRecordStatus');
      const recording = Boolean((r as any).outputActive);
      if (!recording) {
        await obs.call('StartRecord');
      }
      return { ok: true, message: 'Recording started' };
    } catch (err: unknown) {
      const msg = formatUnknownError(err);
      return { ok: false, message: `Failed to start recording: ${msg}` };
    }
  }

  /**
   * Start streaming if not already active.
   * Verifies streaming is still active after a short delay to catch
   * asynchronous failures (e.g. OBS can't connect to the stream service).
   */
  public async startStreaming(): Promise<{ ok: boolean; message?: string }> {
    if (!this.connectionReady) {
      return { ok: false, message: 'Not connected to OBS' };
    }

    const obs = this.ensureObsInstance();

    try {
      const r = await obs.call('GetStreamStatus');
      const streaming = Boolean((r as any).outputActive);
      if (streaming) {
        return { ok: true, message: 'Already streaming' };
      }

      await obs.call('StartStream');

      // OBS accepts the command but may fail asynchronously (e.g. bad
      // stream key, unreachable server). Wait briefly then verify.
      await delay(3000);

      if (!this.connectionReady) {
        return {
          ok: false,
          message: 'OBS connection lost after starting stream',
        };
      }

      const check = await obs.call('GetStreamStatus');
      const stillStreaming = Boolean((check as any).outputActive);
      if (!stillStreaming) {
        return {
          ok: false,
          message: 'Streaming failed — check OBS stream settings',
        };
      }

      return { ok: true, message: 'Streaming started' };
    } catch (err: unknown) {
      const msg = formatUnknownError(err);
      return { ok: false, message: `Failed to start streaming: ${msg}` };
    }
  }

  /**
   * Stop streaming if active.
   */
  public async stopStreaming(): Promise<{ ok: boolean; message?: string }> {
    if (!this.connectionReady) {
      return { ok: false, message: 'Not connected to OBS' };
    }

    const obs = this.ensureObsInstance();

    try {
      const r = await obs.call('GetStreamStatus');
      const streaming = Boolean((r as any).outputActive);
      if (streaming) {
        await obs.call('StopStream');
      }
      return { ok: true, message: 'Streaming stopped' };
    } catch (err: unknown) {
      const msg = formatUnknownError(err);
      return { ok: false, message: `Failed to stop streaming: ${msg}` };
    }
  }

  /**
   * Capture the transform settings for a single OBS source in the current scene.
   */
  private async captureSourceTransform(
    sceneName: string,
    sourceName: string,
  ): Promise<SourceTransform | null> {
    if (!this.connectionReady || !sourceName) return null;

    const obs = this.ensureObsInstance();

    try {
      // Get scene items to find the sceneItemId for this source
      const itemsResult = (await obs.call('GetSceneItemList', {
        sceneName,
      })) as any;

      const items: any[] = itemsResult?.sceneItems ?? [];
      const item = items.find((i: any) => i.sourceName === sourceName);
      if (!item) return null;

      const sceneItemId = item.sceneItemId as number;

      // Get the transform for this scene item
      const transformResult = (await obs.call('GetSceneItemTransform', {
        sceneName,
        sceneItemId,
      })) as any;

      const t = transformResult?.sceneItemTransform;
      if (!t) return null;

      return {
        positionX: t.positionX ?? 0,
        positionY: t.positionY ?? 0,
        width: t.width ?? 0,
        height: t.height ?? 0,
        sourceWidth: t.sourceWidth ?? 0,
        sourceHeight: t.sourceHeight ?? 0,
        alignment: t.alignment ?? 0,
        boundsType: t.boundsType ?? 'OBS_BOUNDS_NONE',
        boundsWidth: t.boundsWidth ?? 0,
        boundsHeight: t.boundsHeight ?? 0,
        boundsAlignment: t.boundsAlignment ?? 0,
        cropToBounds: Boolean(t.cropToBounds),
        cropLeft: t.cropLeft ?? 0,
        cropTop: t.cropTop ?? 0,
        cropRight: t.cropRight ?? 0,
        cropBottom: t.cropBottom ?? 0,
      };
    } catch (err) {
      log.warn(
        `[obs] Failed to get transform for "${sourceName}": ${formatUnknownError(err)}`,
      );
      return null;
    }
  }

  /**
   * Capture transforms for both configured sources and store in the event DB.
   * Called fire-and-forget when a recording stops.
   */
  private async captureAndStoreTransforms(outputPath: string): Promise<void> {
    if (!this.connectionReady) return;

    const status = getStatus();
    const eventName = status.stack.currentEventName;
    if (!eventName) return;

    const settings = await getSettings();
    const gameCaptureSource = settings.obs.gameCaptureSource || '';
    const playerCameraSource = settings.obs.playerCameraSource || '';

    if (!gameCaptureSource && !playerCameraSource) return;

    const obs = this.ensureObsInstance();

    // Get the current scene
    let sceneName = '';
    try {
      const sceneResult = (await obs.call('GetCurrentProgramScene')) as any;
      sceneName = sceneResult?.currentProgramSceneName ?? '';
    } catch {
      return;
    }

    if (!sceneName) return;

    const [gcTransform, pcTransform] = await Promise.all([
      this.captureSourceTransform(sceneName, gameCaptureSource),
      this.captureSourceTransform(sceneName, playerCameraSource),
    ]);

    // Store in event database
    try {
      const db = getEventDb(eventName);
      db.prepare(
        `INSERT OR REPLACE INTO recording_transforms
         (video_path, scene_name, game_capture_source, game_capture_transform,
          player_camera_source, player_camera_transform, captured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        outputPath,
        sceneName,
        gameCaptureSource,
        JSON.stringify(gcTransform ?? {}),
        playerCameraSource,
        JSON.stringify(pcTransform ?? {}),
        new Date().toISOString(),
      );
      log.info(
        `[obs] Saved recording transforms for ${outputPath} (event: ${eventName})`,
      );
    } catch (err) {
      log.warn(`[obs] Failed to store transforms: ${formatUnknownError(err)}`);
    }
  }

  /**
   * Query live status of replay buffer, recording, and streaming.
   * Returns null if not connected.
   */
  public async getFeatureStatus(): Promise<{
    replayBufferActive: boolean;
    recording: boolean;
    streaming: boolean;
  } | null> {
    if (!this.connectionReady) return null;

    const obs = this.ensureObsInstance();

    let replayBufferActive = false;
    let recording = false;
    let streaming = false;

    try {
      const r = await obs.call('GetReplayBufferStatus');
      replayBufferActive = Boolean((r as any).outputActive);
    } catch {
      // replay buffer may not be enabled in OBS
    }

    try {
      const r = await obs.call('GetRecordStatus');
      recording = Boolean((r as any).outputActive);
    } catch {
      // ignore
    }

    try {
      const r = await obs.call('GetStreamStatus');
      streaming = Boolean((r as any).outputActive);
    } catch {
      // ignore
    }

    return { replayBufferActive, recording, streaming };
  }
}

const obsConnectionManager = new ObsConnectionManager();
export default obsConnectionManager;
