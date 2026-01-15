import type { AppSettings } from '../main/settings/schema';
import type { ServiceStatus } from '../common/statusTypes';

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
    flippiStatus: {
      get: () => Promise<ServiceStatus>;
      onChanged: (cb: (status: ServiceStatus) => void) => () => void;
    };
    flippiStack: {
      start: (eventName: string) => Promise<{
        ok: boolean;
        eventName: string;
        recordingFolder: string;
        obs: {
          ok: boolean;
          connected: boolean;
          message?: string;
          replayBufferActive?: boolean;
          recordingFolder?: string;
        };
        message: string;
      }>;
    };
  }
}

export {};
