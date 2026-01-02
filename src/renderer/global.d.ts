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
  }
}

export {};
