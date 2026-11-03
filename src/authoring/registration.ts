import picomatch from 'picomatch';
import { stringify } from 'yaml';
import type { FileEdit } from '../plan/create.js';
import type { PackageSkillEntry } from '../skills/metadata.js';

function normalizeEntry(entry: string) {

  return entry.trim().replace(/^\.?\//, '').replace(/\/+$/, '');
}

/** Whether a package's `files` field publishes a directory; an absent field publishes everything npm does not ignore. */
export function isPublished(files: string[] | undefined, directory: string) {
  if (files === undefined) {

    return true;
  }

  const path = normalizeEntry(directory);

  return files.map((entry) => normalizeEntry(entry)).some((entry) => {
    const isParent = path === entry || path.startsWith(`${entry}/`);

    return isParent || picomatch.isMatch(path, entry) || picomatch.isMatch(`${path}/SKILL.md`, entry);
  });
}

function detectIndent(content: string) {

  return content.match(/^[ \t]+(?=")/m)?.[0] ?? '  ';
}

/**
 * Adds skill registrations to `jfdevelops.skills` and, when the `files` field would leave a skill out
 * of the published package, adds the skill's top-level directory to it. Other fields, their order,
 * and the file's indentation are preserved.
 */
export function createRegistrationEdit(manifestPath: string, entries: PackageSkillEntry[]): FileEdit {

  return {
    path: manifestPath,
    transform: (current) => {
      if (current === undefined) {
        throw new Error(`${manifestPath} does not exist`);
      }

      const manifest = JSON.parse(current) as { files?: string[]; jfdevelops?: { skills?: PackageSkillEntry[] } };
      const existing = manifest.jfdevelops?.skills ?? [];
      const added: PackageSkillEntry[] = [];

      // Each name and path is registered once, whether it was already in the manifest or repeated in this batch.
      for (const entry of entries) {
        const isTaken = [...existing, ...added].some((registered) => registered.name === entry.name || registered.path === entry.path);

        if (!isTaken) {
          added.push(entry);
        }
      }

      const unpublished = added.filter((entry) => !isPublished(manifest.files, entry.path));
      const topDirectories = [...new Set(unpublished.map((entry) => normalizeEntry(entry.path).split('/')[0] ?? ''))];

      manifest.jfdevelops = { ...manifest.jfdevelops, skills: [...existing, ...added] };

      if (manifest.files && topDirectories.length > 0) {
        manifest.files = [...manifest.files, ...topDirectories];
      }

      return `${JSON.stringify(manifest, null, detectIndent(current))}\n`;
    },
  };
}

function toTitle(name: string) {

  return name
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

// Starting SKILL.md for a new package-owned skill; the description is serialized as a YAML scalar.
export function createSkillDocument(name: string, description: string) {

  return [
    '---',
    `name: ${name}`,
    `description: ${stringify(description).trimEnd()}`,
    '---',
    '',
    `# ${toTitle(name)}`,
    '',
    'Describe when an agent should use this skill, then the steps, commands, and conventions it should follow.',
    '',
  ].join('\n');
}
