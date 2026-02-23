// Mock the preload-bridge APIs that Electron exposes on `window`.
// These don't exist in the Jest/jsdom environment.

const noop = () => {};
const resolved = (val) => Promise.resolve(val);

window.flippiStatus = {
  get: () =>
    resolved({
      obs: {
        processRunning: false,
        websocket: 'unknown',
        gameCapture: 'unconfigured',
        replayBufferActive: false,
        recording: false,
        streaming: false,
        lastError: undefined,
        lastUpdatedAt: 0,
      },
      stack: { running: false, currentEventName: null, startedAt: null },
      clippi: {
        processRunning: false,
        obsConnected: null,
        slippiConnected: null,
        comboDataConfigWritten: false,
        activeEventName: null,
        lastError: undefined,
        lastUpdatedAt: 0,
      },
      slippi: { processRunning: false, dolphinRunning: false },
    }),
  onChanged: () => noop,
};

window.flippiSettings = {
  get: () =>
    resolved({
      version: 1,
      youtube: { clientId: '', projectId: '', clientSecret: '' },
      obs: {
        host: '127.0.0.1',
        port: '4444',
        password: '',
        gameCaptureSource: '',
        enableReplayBuffer: true,
        startRecording: false,
        startStreaming: false,
      },
      textAi: { provider: 'openai', apiKey: '' },
      imageAi: { provider: 'openai', apiKey: '' },
    }),
  update: (partial) => resolved(partial),
};

window.flippiEvents = {
  list: () => resolved([]),
  create: () => resolved({ eventName: '', eventPath: '' }),
};

window.flippiStack = {
  start: () =>
    resolved({
      ok: true,
      eventName: '',
      recordingFolder: '',
      obs: { ok: true, connected: false },
      message: '',
    }),
  stop: () => resolved({ ok: true, message: '' }),
  switch: () => resolved({ ok: true, eventName: '', message: '' }),
  relaunchClippi: () => resolved({ ok: true, message: '' }),
  relaunchSlippi: () => resolved({ ok: true, message: '' }),
};

window.flippiObs = {
  getSources: () => resolved([]),
  setFeature: () => resolved({ ok: true }),
};
