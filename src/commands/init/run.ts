import { parseProjectConfig } from '../../config/read.js';
import { writeProjectConfig } from '../../config/write.js';
import { describeDevelopmentDependency, installDevelopmentDependency, type DependencyInstaller } from '../../dependencies/install.js';
import { detectIntegrations } from '../../detect/integration.js';
import type { PackageManagerName } from '../../detect/package-manager.js';
import { detectProject, type ProjectDetection } from '../../detect/project.js';
import { createInstructionEdits } from '../../instructions/edits.js';
import { applyChangePlan } from '../../plan/apply.js';
import { createChangePlan } from '../../plan/create.js';
import { PromptCancelledError, type Prompter } from '../../prompts/prompter.js';
import { buildSkillCatalog, type SkillCatalog } from '../../skills/catalog.js';
import { createSkillInstallFiles } from '../../skills/files.js';
import { findSharedSkillsPackage } from '../../skills/shared.js';
import { describePlan, reportApplyResult, resolveConflicts } from '../review.js';
import { createInitConfig } from './config.js';
import { confirmIntegrations, filterAddonSkills } from './integrations.js';
import { findMissingSourceSkills, selectSkills } from './skills.js';
import { confirmTargets } from './targets.js';

export type InitOptions = { directory: string; version: string; prompter: Prompter; installDependency?: DependencyInstaller };

export type InitStatus = 'complete' | 'incomplete' | 'unchanged' | 'cancelled' | 'failed';

const packageManagers: PackageManagerName[] = ['pnpm', 'npm', 'yarn', 'bun'];

function hasCliDependency(project: ProjectDetection) {
  const { dependencies, devDependencies, optionalDependencies } = project.manifest;

  return '@jfdevelops/cli' in { ...dependencies, ...devDependencies, ...optionalDependencies };
}

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

async function adoptProject({ directory, version, prompter, installDependency = installDevelopmentDependency }: InitOptions): Promise<InitStatus> {
  const project = await detectProject(directory);

  for (const warning of project.warnings) {
    prompter.warn(warning);
  }

  const packageManager = await choosePackageManager(project, prompter);
  const targets = await confirmTargets(project.targets, prompter);
  const scopes = ['.', ...targets.map((target) => target.path)];
  const integrations = await detectIntegrations(project.root, scopes);
  const addons = await confirmIntegrations(integrations, project.config?.addons ?? [], prompter);
  const discoveredCatalog = await buildSkillCatalog(project.root, scopes, [{ directory: findSharedSkillsPackage(), scope: '.', required: true }]);
  const catalog = filterAddonSkills(discoveredCatalog, integrations, addons);

  reportCatalog(catalog, prompter);

  const enabledSkills = project.config?.skills ?? [];
  // Checked against every installed package, so skills of a deselected addon are removed rather than treated as missing.
  const missingSourceSkills = findMissingSourceSkills(discoveredCatalog, enabledSkills);

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
  const configOptions = { existing: project.config, version, name: project.name, packageManager, targets, addons, selectedSkills, missingSourceSkills };
  const plannedConfig = parseProjectConfig(createInitConfig({ ...configOptions, managedFiles: plan.managedFiles }));
  const isConfigChanged = JSON.stringify(plannedConfig) !== JSON.stringify(project.config);
  const needsCliDependency = !hasCliDependency(project);
  const isWorkspaceRoot = packageManager === 'pnpm' && project.workspace?.source === 'pnpm-workspace.yaml';

  if (!plan.hasChanges && !isConfigChanged && !needsCliDependency) {
    prompter.outro('Already up to date. No changes needed.');

    return 'unchanged';
  }

  const plannedChanges = describePlan(plan, isConfigChanged);

  if (needsCliDependency) {
    plannedChanges.push(`Install development dependency: ${describeDevelopmentDependency(packageManager, '@jfdevelops/cli', version, isWorkspaceRoot)}`);
  }

  prompter.note(plannedChanges.join('\n'), 'Planned changes');

  const resolutions = await resolveConflicts(plan, prompter);

  if (!(await prompter.confirm({ message: 'Apply these changes?', initialValue: true }))) {
    throw new PromptCancelledError('Declined');
  }

  const result = await applyChangePlan({ projectRoot: project.root, plan, resolutions });

  let dependencyError: unknown;

  if (needsCliDependency) {
    try {
      await installDependency({ directory: project.root, packageManager, packageName: '@jfdevelops/cli', version, isWorkspaceRoot });
    } catch (error) {
      dependencyError = error;
      prompter.error(`Could not install @jfdevelops/cli: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await writeProjectConfig(project.root, createInitConfig({ ...configOptions, managedFiles: result.managedFiles }));
  reportApplyResult(result, prompter);

  if (!result.isComplete || dependencyError) {
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
