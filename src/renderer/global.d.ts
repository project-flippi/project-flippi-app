import type { AppSettings } from '../main/settings/schema';

declare global {
  interface Window {
    flippiSettings: {
      get: () => Promise<AppSettings>;
      update: (partial: Partial<AppSettings>) => Promise<AppSettings>;
    };
    flippiEvents: {
      list: () => Promise<string[]>;
      create: (
        eventTitle: string,
        venueDesc: string,
      ) => Promise<{ eventName: string; eventPath: string }>;
    };
    flippiStack: {
      start: (eventName: string) => Promise<{
        ok: boolean;
        eventName: string;
        recordingFolder: string;
        obs: { ok: boolean; connected: boolean; message?: string; replayBufferActive?: boolean; recordingFolder?: string };
        message: string;
      }>;
    };
  }
}

export {};
