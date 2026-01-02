import fs from 'fs/promises';
import path from 'path';
import os from 'os';

function eventsBaseDir(): string {
  // Matches the Python assumption: Path.home() / "project-flippi" / "Event"
  // :contentReference[oaicite:2]{index=2}
  return path.join(os.homedir(), 'project-flippi', 'Event');
}

export default async function listEventFolders(): Promise<string[]> {
  const base = eventsBaseDir();

  try {
    const entries = await fs.readdir(base, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (err: any) {
    // If directory doesn't exist yet, just return empty list
    if (err?.code === 'ENOENT') return [];
    throw err;
  }
}
