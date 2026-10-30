import { parseProjectConfig } from '../../config/read.js';
import { writeProjectConfig } from '../../config/write.js';
import type { PackageManagerName } from '../../detect/package-manager.js';
import { detectProject, type ProjectDetection } from '../../detect/project.js';
import { createInstructionEdits } from '../../instructions/edits.js';
import { applyChangePlan, type ApplyResult } from '../../plan/apply.js';
import { createChangePlan } from '../../plan/create.js';
import { PromptCancelledError, type Prompter } from '../../prompts/prompter.js';
import { buildSkillCatalog, type SkillCatalog } from '../../skills/catalog.js';
import { createSkillInstallFiles } from '../../skills/files.js';
import { createInitConfig } from './config.js';
import { describePlan, resolveConflicts } from './review.js';
import { findMissingSourceSkills, selectSkills } from './skills.js';
import { confirmTargets } from './targets.js';

export type InitOptions = { directory: string; version: string; prompter: Prompter };

export type InitStatus = 'complete' | 'incomplete' | 'unchanged' | 'cancelled' | 'failed';

const packageManagers: PackageManagerName[] = ['pnpm', 'npm', 'yarn', 'bun'];

async function choosePackageManager(project: ProjectDetection, prompter: Prompter) {
  if (project.packageManager) {

    return project.packageManager.name;
  }

  return prompter.select({
    message: 'Which package manager does this project use?',
    choices: packageManagers.map((name) => ({ value: name, label: name })),
  });
}

function reportCatalog(catalog: SkillCatalog, prompter: Prompter) {
  for (const problem of catalog.problems) {
    prompter.warn(`${problem.package}: ${problem.message}`);
  }

  if (catalog.missingDependencies.length > 0) {
    const names = [...new Set(catalog.missingDependencies.map((dependency) => dependency.name))];

    prompter.warn(`Not installed, so their skills cannot be discovered: ${names.join(', ')}. Install dependencies and run init again to include them.`);
  }

  if (catalog.skills.length === 0) {
    prompter.info('No installed packages declare jfdevelops skills.');
  }
}

function reportResult(result: ApplyResult, prompter: Prompter) {
  if (result.applied.length > 0) {
    prompter.success(`Applied ${result.applied.length} change${result.applied.length === 1 ? '' : 's'}.`);
  }

  if (result.skipped.length > 0) {
    prompter.info(`Kept unchanged: ${result.skipped.map((file) => file.path).join(', ')}`);
  }

  for (const file of result.failed) {
    prompter.error(`${file.path}: ${file.message}`);
  }
}

async function adoptProject({ directory, version, prompter }: InitOptions): Promise<InitStatus> {
  const project = await detectProject(directory);

  for (const warning of project.warnings) {
    prompter.warn(warning);
  }

  const packageManager = await choosePackageManager(project, prompter);
  const targets = await confirmTargets(project.targets, prompter);
  const catalog = await buildSkillCatalog(project.root, ['.', ...targets.map((target) => target.path)]);

  reportCatalog(catalog, prompter);

  const enabledSkills = project.config?.skills ?? [];
  const missingSourceSkills = findMissingSourceSkills(catalog, enabledSkills);

  for (const skill of missingSourceSkills) {
    prompter.warn(`${skill.name} is enabled but ${skill.source.package} is not installed; its files are left as they are.`);
  }

  const selectedSkills = await selectSkills(catalog, enabledSkills, prompter);
  const missingSourceNames = new Set(missingSourceSkills.map((skill) => skill.name));
  const ownerNames = new Set([...selectedSkills, ...enabledSkills].map((skill) => skill.name).filter((name) => !missingSourceNames.has(name)));
  const files = (await Promise.all(selectedSkills.map((skill) => createSkillInstallFiles(skill)))).flat();
  const plan = await createChangePlan({
    projectRoot: project.root,
    managedFiles: project.config?.managedFiles ?? [],
    files,
    edits: createInstructionEdits(
      [
        ...selectedSkills,
        ...missingSourceSkills.map((skill) => ({ name: skill.name, description: `${skill.source.package} is not installed` })),
      ],
      project.agentFiles,
    ),
    owners: [...ownerNames].map((name) => ({ type: 'skill' as const, name })),
  });
  const configOptions = { existing: project.config, version, name: project.name, packageManager, targets, selectedSkills, missingSourceSkills };
  const plannedConfig = parseProjectConfig(createInitConfig({ ...configOptions, managedFiles: plan.managedFiles }));
  const isConfigChanged = JSON.stringify(plannedConfig) !== JSON.stringify(project.config);

  if (!plan.hasChanges && !isConfigChanged) {
    prompter.outro('Already up to date. No changes needed.');

    return 'unchanged';
  }

  prompter.note(describePlan(plan, isConfigChanged).join('\n'), 'Planned changes');

  const resolutions = await resolveConflicts(plan, prompter);

  if (!(await prompter.confirm({ message: 'Apply these changes?', initialValue: true }))) {
    throw new PromptCancelledError('Declined');
  }

  const result = await applyChangePlan({ projectRoot: project.root, plan, resolutions });

  await writeProjectConfig(project.root, createInitConfig({ ...configOptions, managedFiles: result.managedFiles }));
  reportResult(result, prompter);

  if (!result.isComplete) {
    prompter.outro('Init finished with errors. Run it again to retry the failed files.');

    return 'incomplete';
  }

  prompter.outro('Project initialized.');

  return 'complete';
}

/**
 * Adopts an existing project: detects it, confirms targets and skills, previews every change and
 * conflict, then applies the approved plan and records it in jfdevelops.json. Nothing is written
 * before the final confirmation.
 */
export async function runInit(options: InitOptions): Promise<InitStatus> {
  const { prompter } = options;

  prompter.intro('jfdevelops init');

  try {

    return await adoptProject(options);
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      prompter.cancel('Init cancelled. No files were changed.');

      return 'cancelled';
    }

    prompter.error(error instanceof Error ? error.message : String(error));
    prompter.cancel('Init failed.');

    return 'failed';
  }
}
