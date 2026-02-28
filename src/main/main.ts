/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import fs from 'fs';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import listEventFolders from './services/eventService';
import { createEventFromTemplate } from './services/folderCreation';
import {
  startStack,
  stopStack,
  switchEvent,
  relaunchClippi,
  relaunchSlippi,
  relaunchObs,
} from './services/stackService';

import { getSettings, updateSettings } from './settings/store';
import type { AppSettings } from './settings/schema';

import {
  isObsRunning,
  isClippiRunning,
  isSlippiRunning,
  isSlippiDolphinRunning,
} from './utils/externalApps';
import {
  getStatus,
  subscribeStatus,
  patchStatus,
} from './services/statusStore';

import obsConnectionManager from './services/obsConnectionManager';
import {
  initGameCaptureMonitoring,
  stopPolling as stopGameCapturePolling,
} from './services/gameCaptureService';

function broadcastStatus() {
  const status = getStatus();
  BrowserWindow.getAllWindows().forEach((win) => {
    // Guard: only send if webContents exists and isn't destroyed
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('status:changed', status);
    }
  });
}

function startObsProcessPolling(): void {
  const intervalMs = 3000;

  let inFlight = false;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;

    try {
      const isRunningNow = await isObsRunning();
      const status = getStatus();
      const prev = status.obs.processRunning;

      if (isRunningNow !== prev) {
        patchStatus({
          obs: {
            processRunning: isRunningNow,
            // Do NOT change websocket state here; Step 3 owns that.
          },
        });

        // When OBS goes down while the stack is running, reset game
        // capture state and stop polling (no OBS to screenshot).
        if (!isRunningNow && status.stack.running) {
          patchStatus({ obs: { gameCapture: 'unconfigured' } });
          stopGameCapturePolling();
        }
      }
    } finally {
      inFlight = false;
    }
  };

  // Run once immediately so UI updates fast
  tick().catch(() => {});

  const timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);

  // Don't keep the process alive solely for this timer
  timer.unref?.();

  // Optional: if you want cleanup
  process.on('exit', () => clearInterval(timer));
}

function startObsFeaturePolling(): void {
  const intervalMs = 3000;

  let inFlight = false;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;

    try {
      const featureStatus = await obsConnectionManager.getFeatureStatus();
      if (!featureStatus) return;

      const current = getStatus().obs;
      if (
        current.replayBufferActive !== featureStatus.replayBufferActive ||
        current.recording !== featureStatus.recording ||
        current.streaming !== featureStatus.streaming
      ) {
        patchStatus({ obs: featureStatus });
      }
    } finally {
      inFlight = false;
    }
  };

  tick().catch(() => {});

  const timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);

  timer.unref?.();
  process.on('exit', () => clearInterval(timer));
}

function getClippiStatusFilePath(): string {
  try {
    return path.join(
      app.getPath('appData'),
      'Project Clippi',
      'connection-status.json',
    );
  } catch {
    return '';
  }
}

function readClippiConnectionStatus(): {
  obsConnected: boolean;
  slippiConnected: boolean;
  updatedAt: number;
} | null {
  const filePath = getClippiStatusFilePath();
  if (!filePath) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (
      typeof data.obsConnected === 'boolean' &&
      typeof data.slippiConnected === 'boolean' &&
      typeof data.updatedAt === 'number'
    ) {
      return {
        obsConnected: data.obsConnected,
        slippiConnected: data.slippiConnected,
        updatedAt: data.updatedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function startClippiProcessPolling(): void {
  const intervalMs = 3000;

  let inFlight = false;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;

    try {
      const isRunningNow = await isClippiRunning();
      const status = getStatus();
      const prev = status.clippi;

      // Read connection status file
      let obsConnected: boolean | null = null;
      let slippiConnected: boolean | null = null;

      if (isRunningNow) {
        const connStatus = readClippiConnectionStatus();
        if (connStatus) {
          obsConnected = connStatus.obsConnected;
          slippiConnected = connStatus.slippiConnected;
        }
        // If no file or invalid, leave as null (unknown)
      }
      // If not running, both stay null

      const changed =
        isRunningNow !== prev.processRunning ||
        obsConnected !== prev.obsConnected ||
        slippiConnected !== prev.slippiConnected;

      if (changed) {
        patchStatus({
          clippi: {
            processRunning: isRunningNow,
            obsConnected,
            slippiConnected,
          },
        });
      }
    } finally {
      inFlight = false;
    }
  };

  // Run once immediately so UI updates fast
  tick().catch(() => {});

  const timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);

  // Don't keep the process alive solely for this timer
  timer.unref?.();

  process.on('exit', () => clearInterval(timer));
}

function startSlippiProcessPolling(): void {
  const intervalMs = 3000;

  let inFlight = false;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;

    try {
      const [isRunningNow, isDolphinRunningNow] = await Promise.all([
        isSlippiRunning(),
        isSlippiDolphinRunning(),
      ]);
      const status = getStatus();
      const prevRunning = status.slippi.processRunning;
      const prevDolphin = status.slippi.dolphinRunning;

      if (isRunningNow !== prevRunning || isDolphinRunningNow !== prevDolphin) {
        patchStatus({
          slippi: {
            processRunning: isRunningNow,
            dolphinRunning: isDolphinRunningNow,
          },
        });
      }
    } finally {
      inFlight = false;
    }
  };

  // Run once immediately so UI updates fast
  tick().catch(() => {});

  const timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);

  // Don't keep the process alive solely for this timer
  timer.unref?.();

  process.on('exit', () => clearInterval(timer));
}

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

ipcMain.handle('settings:get', () => getSettings());

ipcMain.handle(
  'settings:update',
  async (event, partial: Partial<AppSettings>) => {
    const updated = updateSettings(partial);

    // If OBS connection settings changed, force the websocket manager to reset.
    // Only invalidate for host/port/password — not for action toggles like
    // enableReplayBuffer, startRecording, startStreaming.
    if (
      partial.obs &&
      ('host' in partial.obs ||
        'port' in partial.obs ||
        'password' in partial.obs)
    ) {
      obsConnectionManager.invalidateConnection();
    }

    return updated;
  },
);

ipcMain.handle('events:list', async () => {
  return listEventFolders();
});

ipcMain.handle(
  'events:create',
  async (_evt, args: { eventTitle: string; venueDesc: string }) => {
    return createEventFromTemplate(args);
  },
);

ipcMain.handle('stack:start', async (_evt, args: { eventName: string }) => {
  return startStack(args);
});

ipcMain.handle('stack:stop', async () => {
  return stopStack();
});

ipcMain.handle('stack:switch', async (_evt, args: { eventName: string }) => {
  return switchEvent(args);
});

ipcMain.handle('stack:relaunchClippi', async () => {
  return relaunchClippi();
});

ipcMain.handle('stack:relaunchSlippi', async () => {
  return relaunchSlippi();
});

ipcMain.handle('stack:relaunchObs', async () => {
  return relaunchObs();
});

ipcMain.handle('status:get', async () => {
  return getStatus();
});

ipcMain.handle('obs:getSources', async () => {
  try {
    return await obsConnectionManager.getSourcesList();
  } catch {
    return [];
  }
});

ipcMain.handle(
  'obs:setFeature',
  async (
    _evt,
    args: {
      feature: 'replayBuffer' | 'recording' | 'streaming';
      enabled: boolean;
    },
  ) => {
    let result: { ok: boolean; message?: string };

    if (args.feature === 'replayBuffer') {
      result = await (args.enabled
        ? obsConnectionManager.startReplayBuffer()
        : obsConnectionManager.stopReplayBuffer());
    } else if (args.feature === 'recording') {
      result = await (args.enabled
        ? obsConnectionManager.startRecording()
        : obsConnectionManager.stopRecording());
    } else if (args.feature === 'streaming') {
      result = await (args.enabled
        ? obsConnectionManager.startStreaming()
        : obsConnectionManager.stopStreaming());
    } else {
      return { ok: false, message: 'Unknown feature' };
    }

    // Immediately refresh live OBS feature status so the UI updates fast
    const featureStatus = await obsConnectionManager.getFeatureStatus();
    if (featureStatus) {
      patchStatus({ obs: featureStatus });
    }

    return result;
  },
);

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
      broadcastStatus();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    startObsProcessPolling();
    startObsFeaturePolling();
    startClippiProcessPolling();
    startSlippiProcessPolling();
    initGameCaptureMonitoring();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);

// Subscribe once (keep unsubscribe if you ever need cleanup)
subscribeStatus(() => {
  broadcastStatus();
});
