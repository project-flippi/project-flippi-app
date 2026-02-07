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
