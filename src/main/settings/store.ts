import Store from 'electron-store';
import {
  AppSettings,
  defaultSettings,
} from './schema';

const store = new Store<AppSettings>({
  name: 'settings',      // file will be something like settings.json
  defaults: defaultSettings,
});

// Deep-merge helper for nested objects
function mergeSettings(
  current: AppSettings,
  partial: Partial<AppSettings>
): AppSettings {
  return {
    ...current,
    ...partial,
    version: 1, // lock version for now
    youtube: {
      ...current.youtube,
      ...(partial.youtube ?? {}),
    },
    obs: {
      ...current.obs,
      ...(partial.obs ?? {}),
    },
    textAi: {
      ...current.textAi,
      ...(partial.textAi ?? {}),
    },
    imageAi: {
      ...current.imageAi,
      ...(partial.imageAi ?? {}),
    },
  };
}

export function getSettings(): AppSettings {
  // store.store is already AppSettings thanks to defaults
  const current = store.store;
  // Just ensure version & defaults are always present
  return mergeSettings(defaultSettings, current);
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const updated = mergeSettings(current, partial);
  store.store = updated;
  return updated;
}
