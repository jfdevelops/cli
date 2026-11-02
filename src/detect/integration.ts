import { join } from 'node:path';
import { compareStrings } from '../compare.js';
import { readPackageManifest, type PackageManifest } from './manifest.js';

export type DetectedIntegration = { name: string; package: string; scopes: string[] };

function getIntegrationName(packageName: string) {
  if (packageName === 'portless' || packageName === 'convex') {

    return packageName;
  }

  if (packageName.startsWith('@tanstack/')) {

    return packageName;
  }

  if (packageName.startsWith('@jfdevelops/') && packageName !== '@jfdevelops/cli' && packageName !== '@jfdevelops/skills') {

    return packageName;
  }

  return undefined;
}

function getDependencyNames(manifest: PackageManifest) {

  return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies });
}

/** Detects supported installed integrations by declared dependency, without enabling any of them. */
export async function detectIntegrations(projectRoot: string, scopes: string[]) {
  const integrations = new Map<string, DetectedIntegration>();

  for (const scope of [...new Set(scopes)]) {
    const manifest = await readPackageManifest(join(projectRoot, scope));

    if (!manifest) {
      continue;
    }

    for (const packageName of getDependencyNames(manifest)) {
      const name = getIntegrationName(packageName);

      if (!name) {
        continue;
      }

      const existing = integrations.get(name);

      if (existing) {
        existing.scopes = [...new Set([...existing.scopes, scope])];
      } else {
        integrations.set(name, { name, package: packageName, scopes: [scope] });
      }
    }
  }

  return [...integrations.values()].sort((left, right) => compareStrings(left.name, right.name));
}
