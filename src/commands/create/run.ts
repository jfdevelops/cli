import { mkdir, readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { parseProjectConfig } from '../../config/read.js';
import { packageNameSchema } from '../../config/schema.js';
import { writeProjectConfig } from '../../config/write.js';
import { describeDevelopmentDependency, installDevelopmentDependency, type DependencyInstaller } from '../../dependencies/install.js';
import type { PackageManagerName } from '../../detect/package-manager.js';
import { createInstructionEdits } from '../../instructions/edits.js';
import { applyChangePlan } from '../../plan/apply.js';
import { createChangePlan } from '../../plan/create.js';
import { PromptCancelledError, type Prompter } from '../../prompts/prompter.js';
import { buildSkillCatalog } from '../../skills/catalog.js';
import { createSkillInstallFiles } from '../../skills/files.js';
import { findSharedSkillsPackage } from '../../skills/shared.js';
import { createInitConfig } from '../init/config.js';
import { describePlan, resolveConflicts } from '../review.js';
import { initializeProjectGit, verifyCreatedProject, type GitInitializer, type ProjectVerifier } from './lifecycle.js';
import { createTemplateFiles, projectTemplates, type ProjectKind } from './templates.js';

export type CreateOptions = {
  directory?: string;
  version: string;
  prompter: Prompter;
  installDependency?: DependencyInstaller;
  verifyProject?: ProjectVerifier;
  initializeGit?: GitInitializer;
};

export type CreateStatus = 'complete' | 'incomplete' | 'cancelled' | 'failed';

const packageManagers: PackageManagerName[] = ['pnpm', 'npm', 'yarn', 'bun'];

function getDefaultDirectory(projectName: string) {

  return `./${projectName.includes('/') ? projectName.slice(projectName.lastIndexOf('/') + 1) : projectName}`;
}

async function assertDestinationAvailable(directory: string) {
  try {
    const entries = await readdir(directory);

    if (entries.length > 0) {
      throw new Error(`Destination is not empty: ${directory}`);
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {

      return;
    }

    throw error;
  }
}

async function chooseProject(options: CreateOptions) {
  const { prompter } = options;
  const initialName = options.directory ? basename(resolve(options.directory)) : 'my-project';
  const projectName = (await prompter.text({ message: 'What is the package name?', initialValue: initialName })).trim();
  const nameResult = packageNameSchema.safeParse(projectName);

  if (!nameResult.success) {
    throw new Error(`Invalid package name: ${projectName}`);
  }

  const directoryInput = options.directory ?? (await prompter.text({ message: 'Where should the project be created?', initialValue: getDefaultDirectory(projectName) }));
  const directory = resolve(directoryInput);
  const kind = await prompter.select<ProjectKind>({
    message: 'What kind of project are you creating?',
    choices: [
      { value: 'app', label: 'App', hint: 'deployable application' },
      { value: 'library', label: 'Library', hint: 'published or shared package' },
    ],
  });
  const templates = projectTemplates.filter((template) => template.kind === kind);
  const templateName = await prompter.select({
    message: 'Which template should be used?',
    choices: templates.map((template) => ({ value: template.name, label: template.label, hint: template.description })),
  });
  const packageManager = await prompter.select<PackageManagerName>({
    message: 'Which package manager should be used?',
    choices: packageManagers.map((name) => ({ value: name, label: name })),
    initialValue: 'pnpm',
  });
  const formatter = await prompter.select({
    message: 'Which formatter should be used?',
    choices: [
      { value: 'prettier', label: 'Prettier', hint: 'widely supported and editor-friendly' },
      { value: 'biome', label: 'Biome', hint: 'fast formatter distributed as one binary' },
    ],
    initialValue: 'prettier',
  });
  const shouldInitializeGit = await prompter.confirm({ message: 'Initialize Git and create the foundation commit?', initialValue: true });

  return { projectName, directory, kind, templateName, packageManager, formatter, shouldInitializeGit };
}

async function createProject(options: CreateOptions): Promise<CreateStatus> {
  const {
    version,
    prompter,
    installDependency = installDevelopmentDependency,
    verifyProject = verifyCreatedProject,
    initializeGit = initializeProjectGit,
  } = options;
  const selection = await chooseProject(options);

  await assertDestinationAvailable(selection.directory);

  const catalog = await buildSkillCatalog(selection.directory, [], [{ directory: findSharedSkillsPackage(), scope: '.', required: true }]);
  const selectedSkills = catalog.skills;
  const templateFiles = createTemplateFiles(selection.projectName, selection.templateName, version, selection.formatter);
  const skillFiles = (await Promise.all(selectedSkills.map((skill) => createSkillInstallFiles(skill)))).flat();
  const owners = [
    { type: 'project' as const },
    ...selectedSkills.map((skill) => ({ type: 'skill' as const, name: skill.name })),
  ];
  const plan = await createChangePlan({
    projectRoot: selection.directory,
    files: [...templateFiles, ...skillFiles],
    edits: createInstructionEdits(selectedSkills, []),
    owners,
  });
  const configOptions = {
    existing: undefined,
    version,
    name: selection.projectName,
    packageManager: selection.packageManager,
    targets: [{ path: '.', kind: selection.kind, template: selection.templateName }],
    addons: [],
    formatter: selection.formatter,
    selectedSkills,
    missingSourceSkills: [],
  };
  const plannedConfig = parseProjectConfig(createInitConfig({ ...configOptions, managedFiles: plan.managedFiles }));
  const plannedChanges = describePlan(plan, true);

  plannedChanges.push(`Install dependencies: ${describeDevelopmentDependency(selection.packageManager, '@jfdevelops/cli', version)}`);
  plannedChanges.push(`Verify project: ${selection.packageManager} run format:check, then ${selection.packageManager} run build`);

  if (selection.shouldInitializeGit) {
    plannedChanges.push('Initialize Git on main and create chore(init): initialize project');
  }

  prompter.note(plannedChanges.join('\n'), 'Planned project');

  const resolutions = await resolveConflicts(plan, prompter);

  if (!(await prompter.confirm({ message: 'Create this project?', initialValue: true }))) {
    throw new PromptCancelledError('Declined');
  }

  await mkdir(selection.directory, { recursive: true });

  const result = await applyChangePlan({ projectRoot: selection.directory, plan, resolutions });
  let dependencyError: unknown;

  try {
    await installDependency({
      directory: selection.directory,
      packageManager: selection.packageManager,
      packageName: '@jfdevelops/cli',
      version,
    });
  } catch (error) {
    dependencyError = error;
    prompter.error(`Could not install project dependencies: ${error instanceof Error ? error.message : String(error)}`);
  }

  await writeProjectConfig(selection.directory, createInitConfig({ ...configOptions, managedFiles: result.managedFiles }));

  let verificationError: unknown;

  if (result.isComplete && !dependencyError) {
    try {
      await verifyProject({ directory: selection.directory, packageManager: selection.packageManager });

      if (selection.shouldInitializeGit) {
        await initializeGit(selection.directory);
      }
    } catch (error) {
      verificationError = error;
      prompter.error(`Could not verify or initialize the project: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!result.isComplete || dependencyError || verificationError) {
    prompter.outro('Project creation finished with errors. Resolve them before using the project.');

    return 'incomplete';
  }

  prompter.outro(`Created ${plannedConfig.project.name} in ${selection.directory}.`);

  return 'complete';
}

export async function runCreate(options: CreateOptions): Promise<CreateStatus> {
  const { prompter } = options;

  prompter.intro('jfdevelops create');

  try {

    return await createProject(options);
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      prompter.cancel('Project creation cancelled. No files were changed.');

      return 'cancelled';
    }

    prompter.error(error instanceof Error ? error.message : String(error));
    prompter.cancel('Project creation failed.');

    return 'failed';
  }
}
