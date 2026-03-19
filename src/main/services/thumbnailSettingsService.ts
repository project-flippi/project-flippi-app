// src/main/services/thumbnailSettingsService.ts
// Per-event thumbnail settings — stored in event_metadata table
import log from 'electron-log';
import type { EventThumbnailSettings } from '../../common/meleeTypes';
import { getEventDb } from '../database/db';

const METADATA_KEY = 'thumbnail_settings';

const DEFAULT_SETTINGS: EventThumbnailSettings = {
  eventLogoStampPath: '',
  thumbnailCanvasPath: '',
  textColor: '#FFFFFF',
  leftBgColor: '#1a1a2e',
  rightBgColor: '#16213e',
};

export function getThumbnailSettings(
  eventName: string,
): EventThumbnailSettings {
  const db = getEventDb(eventName);
  const row = db
    .prepare<
      [string],
      { value: string }
    >('SELECT value FROM event_metadata WHERE key = ?')
    .get(METADATA_KEY);

  if (!row) return { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(row.value);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    log.warn(
      `[thumbnailSettings] Invalid JSON for ${METADATA_KEY}, returning defaults`,
    );
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateThumbnailSettings(
  eventName: string,
  updates: Partial<EventThumbnailSettings>,
): EventThumbnailSettings {
  const current = getThumbnailSettings(eventName);
  const merged = { ...current, ...updates };

  const db = getEventDb(eventName);
  db.prepare(
    'INSERT OR REPLACE INTO event_metadata (key, value) VALUES (?, ?)',
  ).run(METADATA_KEY, JSON.stringify(merged));

  log.info(`[thumbnailSettings] Updated settings for event ${eventName}`);
  return merged;
}
