import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getEventDb } from '../database/db';

function repoRootDir(): string {
  // Same assumption as the Python tools for now: ~/project-flippi
  // If you later want this to be dynamic, we’ll swap this to src/main/config/paths.ts.
  return path.join(os.homedir(), 'project-flippi');
}

function eventsDir(): string {
  return path.join(repoRootDir(), 'Event');
}

// Port of sanitize_event_folder_name()
// - split on non-alphanum
// - TitleCase each word
// - join with dashes
// - strip unsafe chars and repeated dashes
export function sanitizeEventFolderName(rawTitle: string): string {
  const words = rawTitle.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const titled = words.map(
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );

  let joined = titled.join('-');
  joined = joined.replace(/[^A-Za-z0-9-]/g, '');
  joined = joined.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');

  return joined || 'Event';
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function scaffoldEventFolder(dest: string): Promise<void> {
  const dirs = [
    'data',
    'images',
    'slp',
    'thumbnails',
    path.join('videos', 'clips'),
    path.join('videos', 'compilations'),
  ];

  const dataFiles = ['combodata.jsonl'];

  await Promise.all(
    dirs.map((d) => fs.mkdir(path.join(dest, d), { recursive: true })),
  );

  await Promise.all(
    dataFiles.map((f) => fs.writeFile(path.join(dest, 'data', f), '', 'utf-8')),
  );
}

export async function createEventFromTemplate(params: {
  eventTitle: string;
  venueDesc: string;
}): Promise<{ eventName: string; eventPath: string }> {
  const { eventTitle, venueDesc } = params;

  const sanitized = sanitizeEventFolderName(eventTitle);
  const dest = path.join(eventsDir(), sanitized);

  // Ensure Event/ exists
  await fs.mkdir(eventsDir(), { recursive: true });

  if (await pathExists(dest)) {
    throw new Error(`Event folder already exists: ${sanitized}`);
  }

  // Scaffold the event folder structure
  await scaffoldEventFolder(dest);

  // Initialize event.db and seed metadata
  const db = getEventDb(sanitized);
  db.prepare(
    'INSERT OR REPLACE INTO event_metadata (key, value) VALUES (?, ?)',
  ).run('event_title', eventTitle);
  db.prepare(
    'INSERT OR REPLACE INTO event_metadata (key, value) VALUES (?, ?)',
  ).run('venue_desc', venueDesc ?? '');
  // Mark as not needing file migration (fresh event)
  db.prepare(
    'INSERT OR REPLACE INTO event_metadata (key, value) VALUES (?, ?)',
  ).run('migrated_from_files', new Date().toISOString());

  return { eventName: sanitized, eventPath: dest };
}
