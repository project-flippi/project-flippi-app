// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { AppSettings } from './settings/schema';

export type Channels = 'ipc-example';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

contextBridge.exposeInMainWorld('flippiSettings', {
  get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  update: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:update', partial),
});

contextBridge.exposeInMainWorld('flippiEvents', {
  list: (): Promise<string[]> => ipcRenderer.invoke('events:list'),
  create: (
    eventTitle: string,
    venueDesc: string,
  ): Promise<{ eventName: string; eventPath: string }> =>
    ipcRenderer.invoke('events:create', { eventTitle, venueDesc }),
});

contextBridge.exposeInMainWorld('flippiStack', {
  start: (eventName: string) =>
    ipcRenderer.invoke('stack:start', { eventName }),
  stop: () => ipcRenderer.invoke('stack:stop'),
  switch: (eventName: string) =>
    ipcRenderer.invoke('stack:switch', { eventName }),
  relaunchClippi: () => ipcRenderer.invoke('stack:relaunchClippi'),
  relaunchSlippi: () => ipcRenderer.invoke('stack:relaunchSlippi'),
  relaunchObs: () => ipcRenderer.invoke('stack:relaunchObs'),
});

contextBridge.exposeInMainWorld('flippiObs', {
  getSources: (): Promise<{ name: string; type: string; typeId: string }[]> =>
    ipcRenderer.invoke('obs:getSources'),
  setFeature: (
    feature: 'replayBuffer' | 'recording' | 'streaming',
    enabled: boolean,
  ): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('obs:setFeature', { feature, enabled }),
});

contextBridge.exposeInMainWorld('flippiDialog', {
  selectFolder: (): Promise<{ ok: boolean; path: string }> =>
    ipcRenderer.invoke('dialog:selectFolder'),
});

contextBridge.exposeInMainWorld('flippiVideo', {
  getClips: (eventName: string) =>
    ipcRenderer.invoke('video:getClips', { eventName }),
  getCompilations: (eventName: string) =>
    ipcRenderer.invoke('video:getCompilations', { eventName }),
  generateClipData: (eventName: string) =>
    ipcRenderer.invoke('video:generateClipData', { eventName }),
  pairVideoFiles: (eventName: string) =>
    ipcRenderer.invoke('video:pairVideoFiles', { eventName }),
  updateClip: (
    eventName: string,
    timestamp: string,
    updates: Record<string, any>,
  ) =>
    ipcRenderer.invoke('video:updateClip', { eventName, timestamp, updates }),
  createCompilation: (eventName: string, options: Record<string, any>) =>
    ipcRenderer.invoke('video:createCompilation', { eventName, options }),
  updateCompilation: (
    eventName: string,
    filePath: string,
    updates: Record<string, any>,
  ) =>
    ipcRenderer.invoke('video:updateCompilation', {
      eventName,
      filePath,
      updates,
    }),
  aiGenerateTitle: (prompt: string, eventName: string) =>
    ipcRenderer.invoke('video:aiGenerateTitle', { prompt, eventName }),
  aiGenerateDesc: (title: string) =>
    ipcRenderer.invoke('video:aiGenerateDesc', { title }),
  aiGenerateThumbnail: (title: string) =>
    ipcRenderer.invoke('video:aiGenerateThumbnail', { title }),
  getGameEntries: (eventName: string) =>
    ipcRenderer.invoke('video:getGameEntries', { eventName }),
  pairGameVideos: (eventName: string) =>
    ipcRenderer.invoke('video:pairGameVideos', { eventName }),
  getGameAndSetEntries: (eventName: string) =>
    ipcRenderer.invoke('video:getGameAndSetEntries', { eventName }),
  invalidateCache: (slpPath?: string) =>
    ipcRenderer.invoke('video:invalidateCache', slpPath ? { slpPath } : {}),
});

contextBridge.exposeInMainWorld('flippiSets', {
  getEntries: (eventName: string) =>
    ipcRenderer.invoke('sets:getEntries', { eventName }),
  create: (
    eventName: string,
    matchType: string,
    setType: string,
    phase: string,
    roundType: string,
    roundNumber: string,
    playerOverrides: { side: number; name: string }[],
    videoFilePath: string,
  ) =>
    ipcRenderer.invoke('sets:create', {
      eventName,
      matchType,
      setType,
      phase,
      roundType,
      roundNumber,
      playerOverrides,
      videoFilePath,
    }),
  addGame: (eventName: string, setId: string, videoFilePath: string) =>
    ipcRenderer.invoke('sets:addGame', { eventName, setId, videoFilePath }),
  removeGame: (eventName: string, setId: string, videoFilePath: string) =>
    ipcRenderer.invoke('sets:removeGame', { eventName, setId, videoFilePath }),
  update: (eventName: string, setId: string, updates: Record<string, any>) =>
    ipcRenderer.invoke('sets:update', { eventName, setId, updates }),
  delete: (eventName: string, setId: string) =>
    ipcRenderer.invoke('sets:delete', { eventName, setId }),
  findForVideo: (eventName: string, videoFilePath: string) =>
    ipcRenderer.invoke('sets:findForVideo', { eventName, videoFilePath }),
  compile: (eventName: string, setId: string) =>
    ipcRenderer.invoke('sets:compile', { eventName, setId }),
  deleteVideo: (eventName: string, setId: string) =>
    ipcRenderer.invoke('sets:deleteVideo', { eventName, setId }),
  renameVideo: (eventName: string, setId: string) =>
    ipcRenderer.invoke('sets:renameVideo', { eventName, setId }),
  onCompileProgress: (
    handler: (
      _event: any,
      progress: {
        setId: string;
        percent: number;
        status: string;
        filePath?: string;
        error?: string;
      },
    ) => void,
  ) => {
    ipcRenderer.on('sets:compile-progress', handler);
    return () => ipcRenderer.removeListener('sets:compile-progress', handler);
  },
});

contextBridge.exposeInMainWorld('flippiStatus', {
  get: () => ipcRenderer.invoke('status:get'),
  onChanged: (callback: (status: any) => void) => {
    const handler = (_event: unknown, status: any) => callback(status);
    ipcRenderer.on('status:changed', handler);
    return () => ipcRenderer.removeListener('status:changed', handler);
  },
});

export type ElectronHandler = typeof electronHandler;
