import { compareStrings } from '../../compare.js';
import type { CatalogSkill } from '../../skills/catalog.js';
import { loadConfiguredProject } from '../skills/inspect.js';
import { knownAddons } from './addons.js';

export type AvailableAddon = { name: string; package: string; isInstalled: boolean; description: string };

/**
 * Lists what can be added to a configured project: skills from installed packages that are not yet
 * enabled (addon skills only once their addon is enabled), integrations that are installed but not
 * adopted or known and not installed, and whether workspace packages can be scaffolded.
 */
export async function findAdditions(directory: string, pendingAddons: string[] = []) {
  const configured = await loadConfiguredProject(directory, pendingAddons);
  const { project, config, integrations, catalog } = configured;
  const enabledSkills = new Set(config.skills.map((skill) => skill.name));
  const enabledAddons = new Set(config.addons.map((addon) => addon.name));
  const skills: CatalogSkill[] = catalog.skills.filter((skill) => !enabledSkills.has(skill.name));
  const installedAddons = integrations
    .filter((integration) => !enabledAddons.has(integration.name))
    .map((integration) => ({ name: integration.name, package: integration.package, isInstalled: true, description: 'installed, not adopted' }));
  const installableAddons = knownAddons
    .filter((addon) => !enabledAddons.has(addon.name) && !integrations.some((integration) => integration.name === addon.name))
    .map((addon) => ({ name: addon.name, package: addon.package, isInstalled: false, description: addon.description }));
  const addons: AvailableAddon[] = [...installedAddons, ...installableAddons].sort((left, right) => compareStrings(left.name, right.name));

  return { ...configured, skills, addons, canAddPackage: project.workspace !== undefined };
}

export type ProjectAdditions = Awaited<ReturnType<typeof findAdditions>>;

function describeScopes(scopes: string[]) {

  return scopes.map((scope) => (scope === '.' ? 'project root' : scope)).join(', ');
}

// Plain-text listing for `add --list`, grouped by kind.
export function formatAdditions(additions: ProjectAdditions) {
  const skills = additions.skills.map((skill) => `  ${skill.name} · ${skill.source.package}@${skill.source.version} · ${describeScopes(skill.scopes)}`);
  const addons = additions.addons.map((addon) => `  ${addon.name} · ${addon.isInstalled ? `${addon.package} installed, not adopted` : addon.description}`);
  const packages = additions.canAddPackage
    ? '  add package <name> scaffolds a TypeScript library in the workspace'
    : '  Unavailable: this project has no workspace';

  return [
    'Skills (add skill <name>):',
    ...(skills.length > 0 ? skills : ['  None available from installed packages']),
    '',
    'Addons (add addon <name>):',
    ...(addons.length > 0 ? addons : ['  None available']),
    '  Individual @tanstack/* and @jfdevelops/* libraries can also be added by package name',
    '',
    'Packages:',
    packages,
  ].join('\n');
}
