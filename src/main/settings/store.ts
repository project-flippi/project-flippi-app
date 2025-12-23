import { AppSettings, defaultSettings } from './schema';

let storePromise: Promise<any> | null = null;

async function getStore() {
  if (!storePromise) {
    storePromise = (async () => {
      const { default: Store } = await import('electron-store');

      return new Store<AppSettings>({
        name: 'settings',
        defaults: defaultSettings,
      });
    })();
  }

  return storePromise;
}

// Deep-merge helper for nested objects
function mergeSettings(
  current: AppSettings,
  partial: Partial<AppSettings>,
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

export async function getSettings(): Promise<AppSettings> {
  const store = await getStore();
  const current = store.store;
  return mergeSettings(defaultSettings, current);
}

export async function updateSettings(
  partial: Partial<AppSettings>,
): Promise<AppSettings> {
  const store = await getStore();
  const current = await getSettings();
  const updated = mergeSettings(current, partial);
  store.store = updated;
  return updated;
}
