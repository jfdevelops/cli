import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { glob } from 'tinyglobby';
import { z } from 'zod';
import { compareStrings } from '../compare.js';
import { readPackageManifest } from '../detect/manifest.js';
import { agentSkillDirectories } from '../skills/agent-directories.js';
import { parseSkillFrontmatter } from '../skills/frontmatter.js';
import { packageSkillsSchema, type PackageSkillEntry } from '../skills/metadata.js';

export type UnregisteredSkill = { path: string; name: string; description: string } | { path: string; problem: string };

// Installed copies, build output, and dependencies are not authored skills.
const ignoredDirectories = ['**/node_modules/**', 'dist/**', '.git/**', ...agentSkillDirectories.map((directory) => `${directory}/**`)];

async function readUnregisteredSkill(packageRoot: string, path: string): Promise<UnregisteredSkill> {
  try {
    const frontmatter = parseSkillFrontmatter(await readFile(join(packageRoot, path, 'SKILL.md'), 'utf8'));
    const directoryName = basename(path);

    if (frontmatter.name !== directoryName) {

      return { path, problem: `frontmatter name ${frontmatter.name} does not match directory ${directoryName}` };
    }

    return { path, name: frontmatter.name, description: frontmatter.description };
  } catch (error) {

    return { path, problem: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Reads a library package's skill registrations and finds authored SKILL.md directories that are not
 * registered yet. Nothing in the package is executed.
 */
export async function inspectLibraryPackage(packageRoot: string) {
  const manifest = await readPackageManifest(packageRoot);

  if (!manifest?.name) {
    throw new Error(`${packageRoot} has no package.json with a name.`);
  }

  const metadata = manifest.jfdevelops === undefined ? undefined : packageSkillsSchema.safeParse(manifest.jfdevelops);

  if (metadata && !metadata.success) {
    throw new Error(`Invalid jfdevelops metadata in ${manifest.name}:\n${z.prettifyError(metadata.error)}`);
  }

  const registrations: PackageSkillEntry[] = metadata?.data.skills ?? [];
  const registeredPaths = new Set(registrations.map((entry) => entry.path));
  const skillFiles = await glob('**/SKILL.md', { cwd: packageRoot, ignore: ignoredDirectories });
  const unregisteredPaths = skillFiles
    .map((file) => `./${dirname(file)}`)
    .filter((path) => path !== './.' && !registeredPaths.has(path))
    .sort(compareStrings);
  const unregistered = await Promise.all(unregisteredPaths.map((path) => readUnregisteredSkill(packageRoot, path)));

  return { manifest, registrations, unregistered };
}

export type LibraryPackageInspection = Awaited<ReturnType<typeof inspectLibraryPackage>>;
