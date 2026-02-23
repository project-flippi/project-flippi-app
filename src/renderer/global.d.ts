import type {
  AppSettings,
  ObsSettings,
  YoutubeSettings,
  TextAiSettings,
  ImageAiSettings,
} from '../main/settings/schema';
import type { ServiceStatus } from '../common/statusTypes';

declare global {
  interface Window {
    flippiSettings: {
      get: () => Promise<AppSettings>;
      update: (partial: {
        version?: 1;
        youtube?: Partial<YoutubeSettings>;
        obs?: Partial<ObsSettings>;
        textAi?: Partial<TextAiSettings>;
        imageAi?: Partial<ImageAiSettings>;
      }) => Promise<AppSettings>;
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
      stop: () => Promise<{
        ok: boolean;
        message: string;
        warnings?: string[];
      }>;
      switch: (eventName: string) => Promise<{
        ok: boolean;
        eventName: string;
        message: string;
      }>;
      relaunchClippi: () => Promise<{ ok: boolean; message: string }>;
      relaunchSlippi: () => Promise<{ ok: boolean; message: string }>;
    };
    flippiObs: {
      getSources: () => Promise<
        { name: string; type: string; typeId: string }[]
      >;
      setFeature: (
        feature: 'replayBuffer' | 'recording' | 'streaming',
        enabled: boolean,
      ) => Promise<{ ok: boolean; message?: string }>;
    };
  }
}

export {};
