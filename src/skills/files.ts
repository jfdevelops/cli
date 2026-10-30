import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { compareStrings } from '../compare.js';
import type { DesiredFile } from '../plan/create.js';
import { agentSkillDirectories } from './agent-directories.js';

// Reads every bundled resource; symlinks and special files are rejected rather than followed.
export async function readSkillFiles(directory: string, prefix = '') {
  const files = new Map<string, Buffer>();

  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      for (const [nestedPath, content] of await readSkillFiles(directory, path)) {
        files.set(nestedPath, content);
      }
    } else if (entry.isFile()) {
      files.set(path, await readFile(join(directory, path)));
    } else {
      throw new Error(`Unsupported skill resource: ${path}`);
    }
  }

  return new Map([...files].sort(([left], [right]) => compareStrings(left, right)));
}

export async function createSkillInstallFiles(skill: { name: string; directory: string }, directories = agentSkillDirectories) {
  const resources = await readSkillFiles(skill.directory);
  const owner = { type: 'skill' as const, name: skill.name };

  return directories.flatMap((directory) =>
    [...resources].map(([path, content]): DesiredFile => ({ path: `${directory}/${skill.name}/${path}`, owner, content })),
  );
}
