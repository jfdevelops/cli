import { readFile, realpath } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { readPackageManifest } from '../detect/manifest.js';
import { parseSkillFrontmatter } from './frontmatter.js';
import { packageSkillsSchema, type PackageSkillEntry } from './metadata.js';

function isInside(root: string, path: string) {
  const local = relative(root, path);

  // relative() returns an absolute path when the target is on another Windows drive.
  return local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local);
}

async function readSkill(packageRoot: string, entry: PackageSkillEntry) {
  const directory = await realpath(resolve(packageRoot, entry.path));
  const file = await realpath(join(directory, 'SKILL.md'));

  if (!isInside(packageRoot, directory) || !isInside(packageRoot, file)) {
    throw new Error('path resolves outside the package');
  }

  if (basename(directory) !== entry.name) {
    throw new Error(`directory name ${basename(directory)} does not match`);
  }

  const frontmatter = parseSkillFrontmatter(await readFile(file, 'utf8'));

  if (frontmatter.name !== entry.name) {
    throw new Error(`frontmatter name ${frontmatter.name} does not match`);
  }

  return { name: entry.name, description: frontmatter.description, path: entry.path, directory };
}

function describeError(error: unknown) {
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {

    return 'SKILL.md or its directory is missing';
  }

  return error instanceof Error ? error.message : String(error);
}

export type DiscoveredSkill = Awaited<ReturnType<typeof readSkill>>;

// Reads declared skill metadata and frontmatter only; nothing in the package is executed.
export async function discoverPackageSkills(packageDirectory: string) {
  const manifest = await readPackageManifest(packageDirectory);

  if (!manifest?.name || !manifest.version || manifest.jfdevelops === undefined) {

    return undefined;
  }

  const source = { name: manifest.name, version: manifest.version };
  const skills: DiscoveredSkill[] = [];
  const problems: string[] = [];
  const metadata = packageSkillsSchema.safeParse(manifest.jfdevelops);

  if (!metadata.success) {
    problems.push(`Invalid jfdevelops metadata:\n${z.prettifyError(metadata.error)}`);

    return { source, skills, problems };
  }

  const packageRoot = await realpath(packageDirectory);
  const seenNames = new Set<string>();
  const seenPaths = new Set<string>();

  for (const entry of metadata.data.skills) {
    if (seenNames.has(entry.name) || seenPaths.has(entry.path)) {
      problems.push(`Skill ${entry.name}: duplicate registration`);
      continue;
    }

    seenNames.add(entry.name);
    seenPaths.add(entry.path);

    try {
      skills.push(await readSkill(packageRoot, entry));
    } catch (error) {
      problems.push(`Skill ${entry.name}: ${describeError(error)}`);
    }
  }

  return { source, skills, problems };
}
