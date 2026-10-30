import { join } from 'node:path';
import { readPackageManifest } from '../detect/manifest.js';
import { discoverPackageSkills, type DiscoveredSkill } from './discover.js';
import { findInstalledPackage } from './installed.js';

export type CatalogSkill = Omit<DiscoveredSkill, 'path'> & {
  source: { package: string; version: string; path: string };
  scopes: string[];
};

export type SkillConflict = { name: string; sources: Array<{ package: string; version: string }> };

function readDependencyNames(manifest: NonNullable<Awaited<ReturnType<typeof readPackageManifest>>>) {

  return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies }).sort();
}

function findConflicts(skills: CatalogSkill[]) {
  const sourcesByName = new Map<string, SkillConflict['sources']>();

  for (const { name, source } of skills) {
    sourcesByName.set(name, [...(sourcesByName.get(name) ?? []), { package: source.package, version: source.version }]);
  }

  return [...sourcesByName]
    .filter(([, sources]) => sources.length > 1)
    .map(([name, sources]) => ({ name, sources }));
}

/**
 * Lists skills declared by packages installed for each scope (the project root and its targets).
 * Same-named skills from different packages or versions are reported as conflicts for explicit selection.
 */
export async function buildSkillCatalog(projectRoot: string, scopes: string[]) {
  const skillsByKey = new Map<string, CatalogSkill>();
  const discoveries = new Map<string, Awaited<ReturnType<typeof discoverPackageSkills>>>();
  const problems: Array<{ package: string; message: string }> = [];
  const missingDependencies: Array<{ scope: string; name: string }> = [];

  for (const scope of [...new Set(scopes)]) {
    const scopeDirectory = join(projectRoot, scope);
    const manifest = await readPackageManifest(scopeDirectory);

    if (!manifest) {
      continue;
    }

    for (const dependency of readDependencyNames(manifest)) {
      const packageDirectory = findInstalledPackage(scopeDirectory, dependency, projectRoot);

      if (!packageDirectory) {
        missingDependencies.push({ scope, name: dependency });
        continue;
      }

      const isNewPackage = !discoveries.has(packageDirectory);
      const discovery = isNewPackage ? await discoverPackageSkills(packageDirectory) : discoveries.get(packageDirectory);

      if (isNewPackage) {
        discoveries.set(packageDirectory, discovery);
      }

      if (!discovery) {
        continue;
      }

      if (isNewPackage) {
        for (const message of discovery.problems) {
          problems.push({ package: `${discovery.source.name}@${discovery.source.version}`, message });
        }
      }

      for (const { path, ...skill } of discovery.skills) {
        const source = { package: discovery.source.name, version: discovery.source.version, path };
        const key = `${source.package}@${source.version}:${skill.name}`;
        const existing = skillsByKey.get(key);

        if (existing) {
          existing.scopes = [...new Set([...existing.scopes, scope])];
        } else {
          skillsByKey.set(key, { ...skill, source, scopes: [scope] });
        }
      }
    }
  }

  const skills = [...skillsByKey.values()].sort(
    (left, right) => left.name.localeCompare(right.name) || left.source.package.localeCompare(right.source.package),
  );

  return { skills, conflicts: findConflicts(skills), problems, missingDependencies };
}

export type SkillCatalog = Awaited<ReturnType<typeof buildSkillCatalog>>;
