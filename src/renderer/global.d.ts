import type { AppSettings } from '../main/settings/schema';

declare global {
  interface Window {
    flippiSettings: {
      get: () => Promise<AppSettings>;
      update: (partial: Partial<AppSettings>) => Promise<AppSettings>;
    };
  }
}

export {};