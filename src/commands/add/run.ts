import { installPackage as defaultInstallPackage, type PackageInstaller } from '../../dependencies/install.js';
import { PromptCancelledError, type Prompter } from '../../prompts/prompter.js';
import { findAdditions, formatAdditions, type ProjectAdditions } from './additions.js';
import { addAddon } from './addon.js';
import { applyAdditions, type AddStatus } from './apply.js';
import { addPackage } from './package.js';
import { addSkill, chooseSkills } from './skill.js';

export type AdditionKind = 'skill' | 'addon' | 'package';

export type AddOptions = {
  directory: string;
  prompter: Prompter;
  kind?: AdditionKind;
  name?: string;
  installPackage?: PackageInstaller;
};

// Lets the user pick a kind of addition and then the item, offering only kinds that are available.
async function browseAdditions(options: AddOptions, additions: ProjectAdditions): Promise<AddStatus> {
  const { prompter } = options;
  const choices = [
    ...(additions.skills.length > 0 ? [{ value: 'skill' as const, label: 'Skills', hint: 'from installed packages' }] : []),
    ...(additions.addons.length > 0 ? [{ value: 'addon' as const, label: 'Addons', hint: 'integrations and their skills' }] : []),
    ...(additions.canAddPackage ? [{ value: 'package' as const, label: 'Workspace package', hint: 'TypeScript library' }] : []),
  ];

  if (choices.length === 0) {
    prompter.outro('Nothing is available to add.');

    return 'unchanged';
  }

  const kind = await prompter.select({ message: 'What would you like to add?', choices });

  if (kind === 'skill') {
    const skills = await chooseSkills(additions, prompter);
    const status = await applyAdditions(additions, { skills }, prompter);

    if (status === 'complete') {
      prompter.outro(`Enabled ${skills.map((skill) => skill.name).join(', ')}.`);
    }

    return status;
  }

  if (kind === 'addon') {
    const name = await prompter.select({
      message: 'Which addon should be added?',
      choices: additions.addons.map((addon) => ({ value: addon.name, label: addon.name, hint: addon.isInstalled ? 'installed, not adopted' : addon.description })),
    });

    return addAddon({ ...options, additions, name, installPackage: options.installPackage ?? defaultInstallPackage });
  }

  return addPackage(additions, await prompter.text({ message: 'Package name', placeholder: '@scope/name' }), prompter);
}

async function addToProject(options: AddOptions): Promise<AddStatus> {
  const { directory, prompter, kind, name } = options;
  const additions = await findAdditions(directory);

  if (kind && name) {
    switch (kind) {
      case 'skill':

        return addSkill(additions, name, prompter);
      case 'addon':

        return addAddon({ directory, additions, name, prompter, installPackage: options.installPackage ?? defaultInstallPackage });
      case 'package':

        return addPackage(additions, name, prompter);
    }
  }

  return browseAdditions(options, additions);
}

/**
 * Adds a skill, addon, or workspace package to a configured project, or browses what is available.
 * Every change is previewed and confirmed before anything is written.
 */
export async function runAdd(options: AddOptions): Promise<AddStatus> {
  const { prompter, kind } = options;

  prompter.intro(kind ? `jfdevelops add ${kind}` : 'jfdevelops add');

  try {

    return await addToProject(options);
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      prompter.cancel('Add cancelled. No project files were changed.');

      return 'cancelled';
    }

    prompter.error(error instanceof Error ? error.message : String(error));
    prompter.cancel('Add failed.');

    return 'failed';
  }
}

/** Lists compatible additions without changing anything. */
export async function runAddList({ directory, prompter }: { directory: string; prompter: Prompter }) {
  prompter.intro('jfdevelops add --list');

  try {
    prompter.note(formatAdditions(await findAdditions(directory)), 'Available additions');
    prompter.outro('Run jfdevelops add to choose interactively.');

    return 'complete' as const;
  } catch (error) {
    prompter.error(error instanceof Error ? error.message : String(error));
    prompter.cancel('Could not list additions.');

    return 'failed' as const;
  }
}
