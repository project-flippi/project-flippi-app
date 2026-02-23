import type { AppSettings } from '../main/settings/schema';
import type { ServiceStatus } from '../common/statusTypes';

declare module '*.svg' {
  import type { FC, SVGProps } from 'react';

  export const ReactComponent: FC<SVGProps<SVGSVGElement>>;
  const src: string;
  export default src;
}

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
    };
  }
}

export {};
