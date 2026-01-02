import fs from 'fs/promises';
import path from 'path';
import os from 'os';

function repoRootDir(): string {
  // Same assumption as the Python tools for now: ~/project-flippi
  // If you later want this to be dynamic, we’ll swap this to src/main/config/paths.ts.
  return path.join(os.homedir(), 'project-flippi');
}

function templateDir(): string {
  return path.join(repoRootDir(), '_EventTemplate');
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

type CpFn = (
  src: string,
  dest: string,
  opts: { recursive: boolean; errorOnExist?: boolean },
) => Promise<void>;

async function copyDir(src: string, dest: string): Promise<void> {
  // Prefer native fs.cp if available (Node 16+)
  const fsWithCp = fs as unknown as { cp?: CpFn };
  if (typeof fsWithCp.cp === 'function') {
    await fsWithCp.cp(src, dest, { recursive: true, errorOnExist: true });
    return;
  }

  // Fallback recursive copy (lint-friendly: no for..of, no await-in-loop)
  await fs.mkdir(dest, { recursive: true });

  const entries = await fs.readdir(src, { withFileTypes: true });

  await Promise.all(
    entries.map(async (e) => {
      const s = path.join(src, e.name);
      const d = path.join(dest, e.name);

      if (e.isDirectory()) {
        await copyDir(s, d);
        return;
      }

      if (e.isFile()) {
        await fs.copyFile(s, d);
      }
    }),
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

  // Copy template -> Event/<Sanitized>
  await copyDir(templateDir(), dest);

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
