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
} from './services/stackService';

import { getSettings, updateSettings } from './settings/store';
import type { AppSettings } from './settings/schema';

import {
  isObsRunning,
  isClippiRunning,
  isSlippiRunning,
} from './utils/externalApps';
import {
  getStatus,
  subscribeStatus,
  patchStatus,
} from './services/statusStore';

import obsConnectionManager from './services/obsConnectionManager';

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

        // If OBS stopped unexpectedly while stack was running, reset stack state
        if (!isRunningNow && status.stack.running) {
          patchStatus({
            stack: {
              running: false,
              currentEventName: null,
              startedAt: null,
            },
          });
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

function startClippiProcessPolling(): void {
  const intervalMs = 3000;

  let inFlight = false;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;

    try {
      const isRunningNow = await isClippiRunning();
      const status = getStatus();
      const prev = status.clippi.processRunning;

      if (isRunningNow !== prev) {
        patchStatus({
          clippi: {
            processRunning: isRunningNow,
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
      const isRunningNow = await isSlippiRunning();
      const status = getStatus();
      const prev = status.slippi.processRunning;

      if (isRunningNow !== prev) {
        patchStatus({
          slippi: {
            processRunning: isRunningNow,
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

    // If OBS settings were changed, force the websocket manager to reset
    if (partial.obs) {
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

ipcMain.handle('status:get', async () => {
  return getStatus();
});

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
    startClippiProcessPolling();
    startSlippiProcessPolling();
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
