// src/main/services/gameCaptureService.ts
import log from 'electron-log';
import obsConnectionManager from './obsConnectionManager';
import { getStatus, patchStatus, subscribeStatus } from './statusStore';
import { getSettings } from '../settings/store';
import type { GameCaptureState } from '../../common/statusTypes';

const POLL_INTERVAL_MS = 3000;
const NON_BLACK_THRESHOLD = 10; // R/G/B channel value above which a pixel counts as non-black
const NON_BLACK_RATIO = 0.001; // 0.1% of pixels must be non-black

let pollTimer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

function setGameCapture(state: GameCaptureState): void {
  const prev = getStatus().obs.gameCapture;
  if (prev !== state) {
    patchStatus({ obs: { gameCapture: state } });
  }
}

/**
 * Analyze a base64-encoded PNG screenshot for non-black content.
 * Returns true if more than 0.1% of pixels are non-black.
 */
async function analyzeScreenshot(base64: string): Promise<boolean> {
  // Dynamic import so sharp is only loaded when needed (native module)
  const sharp = (await import('sharp')).default;

  // Strip data URI prefix if present
  const raw = base64.replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(raw, 'base64');

  const { data, info } = await sharp(buf)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const totalPixels = info.width * info.height;
  const { channels } = info; // typically 3 (RGB) or 4 (RGBA)
  let nonBlackCount = 0;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (
      r > NON_BLACK_THRESHOLD ||
      g > NON_BLACK_THRESHOLD ||
      b > NON_BLACK_THRESHOLD
    ) {
      nonBlackCount += 1;
    }
  }

  return nonBlackCount / totalPixels > NON_BLACK_RATIO;
}

/**
 * Take a screenshot of the given OBS source and check if it contains non-black content.
 * Returns true if capture detected, false if black, null on error.
 */
async function checkCapture(sourceName: string): Promise<boolean | null> {
  if (!obsConnectionManager.isConnected()) return null;

  try {
    const result = (await obsConnectionManager.sendRequest(
      'TakeSourceScreenshot',
      {
        sourceName,
        embedPictureFormat: 'png',
        width: 160,
        height: 90,
      },
    )) as any;

    const imgData: string | undefined = result?.img;
    if (!imgData) return null;

    return analyzeScreenshot(imgData);
  } catch (err) {
    log.warn('[gameCaptureService] Screenshot check failed:', err);
    return null;
  }
}

export function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollTick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;

  try {
    const settings = await getSettings();
    const sourceName = settings.obs.gameCaptureSource;
    if (!sourceName) {
      setGameCapture('unconfigured');
      return;
    }

    const status = getStatus();
    if (!status.stack.running) return;

    // If the websocket dropped, try to reconnect before giving up
    if (!obsConnectionManager.isConnected()) {
      const res = await obsConnectionManager.ensureConnected({
        timeoutMs: 5000,
        intervalMs: 500,
      });
      if (!res.ok) return;
    }

    const hasCapture = await checkCapture(sourceName);

    if (hasCapture === true) {
      setGameCapture('active');
    } else if (hasCapture === false) {
      setGameCapture('monitoring');
    } else if (!obsConnectionManager.isConnected()) {
      // Screenshot failed and connection dropped — try to reconnect next tick
      log.warn(
        '[gameCaptureService] Connection lost during screenshot, will retry',
      );
    }
  } finally {
    inFlight = false;
  }
}

export function startPolling(): void {
  stopPolling();

  // Set initial monitoring state if source is configured
  getSettings()
    .then((settings) => {
      if (settings.obs.gameCaptureSource) {
        setGameCapture('monitoring');
      } else {
        setGameCapture('unconfigured');
      }
      return undefined;
    })
    .catch(() => {});

  // Run immediately then on interval
  pollTick().catch(() => {});

  pollTimer = setInterval(() => {
    pollTick().catch(() => {});
  }, POLL_INTERVAL_MS);

  pollTimer.unref?.();
}

/**
 * Subscribe to status store changes to manage game capture lifecycle.
 * Call once at app startup.
 */
export function initGameCaptureMonitoring(): void {
  let prevStackRunning = false;

  subscribeStatus((status) => {
    const stackRunning = status.stack.running;

    // Stack just started
    if (stackRunning && !prevStackRunning) {
      startPolling();
    }

    // Stack just stopped
    if (!stackRunning && prevStackRunning) {
      stopPolling();
      setGameCapture('unconfigured');
    }

    prevStackRunning = stackRunning;
  });
}
