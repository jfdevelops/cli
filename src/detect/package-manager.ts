import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PackageManifest } from './manifest.js';

export type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun';
type LockfileName = keyof typeof lockfileManagers;

const lockfileManagers = {
  'pnpm-lock.yaml': 'pnpm',
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
  'yarn.lock': 'yarn',
  'bun.lock': 'bun',
  'bun.lockb': 'bun',
} as const satisfies Record<string, PackageManagerName>;

const packageManagerPattern = /^(npm|pnpm|yarn|bun)@([^+\s]+)(?:\+\S+)?$/;

export function detectPackageManager(projectRoot: string, manifest: PackageManifest) {
  const warnings: string[] = [];
  const lockfiles = (Object.keys(lockfileManagers) as LockfileName[]).filter((name) => existsSync(join(projectRoot, name)));
  const lockfileManagerNames = [...new Set(lockfiles.map((name) => lockfileManagers[name]))];
  const declared = manifest.packageManager?.match(packageManagerPattern);

  if (manifest.packageManager && !declared) {
    warnings.push(`Ignoring unrecognized packageManager field: ${manifest.packageManager}`);
  }

  if (declared) {
    const name = declared[1] as PackageManagerName;
    const conflicting = lockfiles.filter((file) => lockfileManagers[file] !== name);

    if (conflicting.length > 0) {
      warnings.push(`Lockfiles do not match packageManager ${name}: ${conflicting.join(', ')}`);
    }

    return { packageManager: { name, version: declared[2], source: 'packageManager' as const }, lockfiles, warnings };
  }

  if (lockfileManagerNames.length > 1) {
    warnings.push(`Lockfiles from multiple package managers: ${lockfiles.join(', ')}`);

    return { packageManager: undefined, lockfiles, warnings };
  }

  const name = lockfileManagerNames[0];
  const packageManager = name ? { name, version: undefined, source: 'lockfile' as const } : undefined;

  return { packageManager, lockfiles, warnings };
}
