import fs from 'fs/promises';
import path from 'path';
import os from 'os';

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

  const dataFiles = [
    'combodata.jsonl',
    'compdata.jsonl',
    'event_title.txt',
    'postedvids.txt',
    'titlehistory.txt',
    'venue_desc.txt',
    'videodata.jsonl',
  ];

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

  // Write metadata files
  const dataDir = path.join(dest, 'data');
  await fs.mkdir(dataDir, { recursive: true });

  await fs.writeFile(
    path.join(dataDir, 'event_title.txt'),
    eventTitle,
    'utf-8',
  );
  await fs.writeFile(
    path.join(dataDir, 'venue_desc.txt'),
    venueDesc ?? '',
    'utf-8',
  );

  return { eventName: sanitized, eventPath: dest };
}
