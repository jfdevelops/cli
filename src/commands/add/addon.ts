import { join } from 'node:path';
import { describePackageInstall, type PackageInstaller } from '../../dependencies/install.js';
import { PromptCancelledError, type Prompter } from '../../prompts/prompter.js';
import type { CatalogSkill } from '../../skills/catalog.js';
import { findAdditions, type ProjectAdditions } from './additions.js';
import { resolveAddon, type AddonDefinition } from './addons.js';
import { applyAdditions, type AddStatus } from './apply.js';

type AddAddonOptions = { directory: string; additions: ProjectAdditions; name: string; prompter: Prompter; installPackage: PackageInstaller };

function describeScope(scope: string) {

  return scope === '.' ? 'the project root' : scope;
}

async function installAddon({ additions, prompter, installPackage }: AddAddonOptions, addon: AddonDefinition) {
  const { project, config } = additions;
  const scopes = [...new Set(['.', ...config.targets.map((target) => target.path)])];
  const scope =
    scopes.length === 1
      ? '.'
      : await prompter.select({
          message: `Where should ${addon.package} be installed?`,
          choices: scopes.map((candidate) => ({ value: candidate, label: describeScope(candidate) })),
          initialValue: '.',
        });
  const command = describePackageInstall(config.project.packageManager, addon.package, addon.isDevelopment);

  if (!(await prompter.confirm({ message: `Install ${addon.package} in ${describeScope(scope)} with \`${command}\`?`, initialValue: true }))) {
    throw new PromptCancelledError('Declined');
  }

  await installPackage({
    directory: join(project.root, scope),
    packageManager: config.project.packageManager,
    packageName: addon.package,
    isDevelopment: addon.isDevelopment,
  });
}

async function chooseAddonSkills(skills: CatalogSkill[], prompter: Prompter) {
  if (skills.length === 0) {
    prompter.info('This addon does not provide jfdevelops skills.');

    return [];
  }

  const keys = await prompter.multiselect({
    message: 'Select the addon skills to install',
    choices: skills.map((skill) => ({ value: `${skill.source.version}:${skill.name}`, label: skill.name, hint: `${skill.source.package}@${skill.source.version}` })),
    initialValues: skills.map((skill) => `${skill.source.version}:${skill.name}`),
  });

  return skills.filter((skill) => keys.includes(`${skill.source.version}:${skill.name}`));
}

/**
 * Adopts an installed integration, or installs its package first after confirmation, then records the
 * addon and offers the skills its package provides. Addon-specific scaffolding is not generated.
 */
export async function addAddon(options: AddAddonOptions): Promise<AddStatus> {
  const { directory, additions, name, prompter } = options;

  if (additions.config.addons.some((addon) => addon.name === name)) {
    prompter.outro(`${name} is already enabled.`);

    return 'unchanged';
  }

  const addon = resolveAddon(name);

  if (!addon) {
    throw new Error(`Unsupported addon: ${name}. Supported: convex, portless, and individual @tanstack/* or @jfdevelops/* libraries.`);
  }

  const isInstalled = additions.integrations.some((integration) => integration.name === addon.name);

  if (!isInstalled) {
    await installAddon(options, addon);
  }

  try {
    const current = await findAdditions(directory, [addon.name]);
    const skills = await chooseAddonSkills(current.skills.filter((skill) => skill.source.package === addon.package), prompter);
    const status = await applyAdditions(current, { skills, addons: [...current.config.addons, { name: addon.name, options: {} }] }, prompter);

    if (status === 'complete') {
      prompter.outro(`Added ${addon.name}.`);
    }

    return status;
  } catch (error) {
    if (!isInstalled) {
      prompter.warn(`${addon.package} was installed, but the addon was not recorded. Run jfdevelops add addon ${addon.name} again to finish.`);
    }

    throw error;
  }
}
