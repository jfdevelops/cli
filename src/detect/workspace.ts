import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { glob } from 'tinyglobby';
import { parse } from 'yaml';
import { z } from 'zod';
import { ManifestError, type PackageManifest } from './manifest.js';
import type { PackageManagerName } from './package-manager.js';

const pnpmWorkspaceSchema = z.looseObject({ packages: z.array(z.string()).optional() }).nullable();

async function readPnpmPatterns(projectRoot: string) {
  const content = await readFile(join(projectRoot, 'pnpm-workspace.yaml'), 'utf8');
  const result = pnpmWorkspaceSchema.safeParse(parse(content));

  if (!result.success) {
    throw new ManifestError(`Invalid pnpm-workspace.yaml:\n${z.prettifyError(result.error)}`);
  }

  return result.data?.packages ?? [];
}

function readManifestPatterns(manifest: PackageManifest) {
  const { workspaces } = manifest;

  if (workspaces === undefined) {

    return undefined;
  }

  return Array.isArray(workspaces) ? workspaces : (workspaces.packages ?? []);
}

function toManifestPattern(pattern: string) {
  const isNegated = pattern.startsWith('!');
  const directory = (isNegated ? pattern.slice(1) : pattern).trim().replace(/^\.\//, '').replace(/\/+$/, '');

  return `${isNegated ? '!' : ''}${directory}/package.json`;
}

export async function expandWorkspacePatterns(projectRoot: string, patterns: string[]) {
  const hasIncludes = patterns.some((pattern) => !pattern.startsWith('!'));

  if (!hasIncludes) {

    return [];
  }

  const manifestPaths = await glob(
    patterns.map((pattern) => toManifestPattern(pattern)),
    { cwd: projectRoot, ignore: ['**/node_modules/**'] },
  );

  return manifestPaths
    .map((path) => dirname(path))
    .filter((path) => path !== '.')
    .sort();
}

async function createWorkspace(projectRoot: string, source: 'pnpm-workspace.yaml' | 'package.json', patterns: string[]) {

  return { source, patterns, packagePaths: await expandWorkspacePatterns(projectRoot, patterns) };
}

export async function detectWorkspace(
  projectRoot: string,
  manifest: PackageManifest,
  packageManager: PackageManagerName | undefined,
) {
  const warnings: string[] = [];
  const hasPnpmWorkspace = existsSync(join(projectRoot, 'pnpm-workspace.yaml'));
  const manifestPatterns = readManifestPatterns(manifest);
  const usesPnpmWorkspace = hasPnpmWorkspace && (packageManager === 'pnpm' || packageManager === undefined);

  if (hasPnpmWorkspace && !usesPnpmWorkspace) {
    warnings.push(`Ignoring pnpm-workspace.yaml because the project uses ${packageManager}`);
  }

  if (usesPnpmWorkspace) {
    if (manifestPatterns !== undefined) {
      warnings.push('Ignoring package.json workspaces because pnpm reads pnpm-workspace.yaml');
    }

    return { workspace: await createWorkspace(projectRoot, 'pnpm-workspace.yaml', await readPnpmPatterns(projectRoot)), warnings };
  }

  if (manifestPatterns !== undefined) {

    return { workspace: await createWorkspace(projectRoot, 'package.json', manifestPatterns), warnings };
  }

  return { workspace: undefined, warnings };
}
