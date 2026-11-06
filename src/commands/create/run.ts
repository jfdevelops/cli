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
import { refreshManagedFiles } from '../../plan/refresh.js';
import { askValidText } from '../../prompts/ask-valid.js';
import { PromptCancelledError, type Prompter } from '../../prompts/prompter.js';
import { agentNames } from '../../skills/agents.js';
import { buildSkillCatalog } from '../../skills/catalog.js';
import { createSkillInstallFiles } from '../../skills/files.js';
import { findSharedSkillsPackage } from '../../skills/shared.js';
import { createInitConfig } from '../init/config.js';
import { chooseAgents } from '../agents.js';
import { listPlannedEntries, resolveConflicts } from '../review.js';
import { renderFileTree } from '../tree.js';
import {
  formatCreatedProject,
  hasGitIdentity,
  initializeProjectGit,
  isGitRemoteUrl,
  readPackageManagerVersion,
  verifyCreatedProject,
  type GitIdentityCheck,
  type GitInitializer,
  type PackageManagerVersionReader,
  type ProjectFormatter,
  type ProjectVerifier,
} from './lifecycle.js';
import { createTemplateFiles, projectTemplates, type ProjectKind } from './templates.js';
import { createWorkspaceFiles, createWorkspaceTargets } from './workspace.js';
import { chooseAppWorkspace, chooseLibraryWorkspace } from './workspace-prompt.js';

export type CreateOptions = {
  directory?: string;
  version: string;
  prompter: Prompter;
  installDependency?: DependencyInstaller;
  formatProject?: ProjectFormatter;
  verifyProject?: ProjectVerifier;
  initializeGit?: GitInitializer;
  checkGitIdentity?: GitIdentityCheck;
  readPackageManagerVersion?: PackageManagerVersionReader;
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

// A scoped package name such as @acme/site is a name, not a path: the project lives in ./site.
function parseProjectArgument(argument: string | undefined): { name?: string; directory?: string; suggestedName?: string } {
  if (!argument) {

    return {};
  }

  if (argument.startsWith('@') && packageNameSchema.safeParse(argument).success) {

    return { name: argument, directory: getDefaultDirectory(argument) };
  }

  // A plain name or "." uses the last path segment, so "." names the project after the current directory.
  const name = basename(resolve(argument));

  return { ...(packageNameSchema.safeParse(name).success ? { name } : {}), directory: argument, suggestedName: name };
}

async function chooseProject(options: CreateOptions) {
  const { prompter } = options;
  const argument = parseProjectArgument(options.directory);
  const projectName = argument.name ?? (await prompter.text({ message: 'What is the package name?', defaultValue: argument.suggestedName ?? 'my-project' })).trim();
  const nameResult = packageNameSchema.safeParse(projectName);

  if (!nameResult.success) {
    throw new Error(`Invalid package name: ${projectName}`);
  }

  const directoryInput = argument.directory ?? (await prompter.text({ message: 'Where should the project be created?', defaultValue: getDefaultDirectory(projectName) }));
  const directory = resolve(directoryInput);
  const kind = await prompter.select<ProjectKind>({
    message: 'What kind of project are you creating?',
    choices: [
      { value: 'app', label: 'App', hint: 'deployable application' },
      { value: 'library', label: 'Library', hint: 'published or shared package' },
    ],
  });
  const selectedOptions =
    kind === 'app'
      ? await prompter.multiselect({
          message: 'Which options should the project use?',
          choices: [{ value: 'monorepo', label: 'Monorepo', hint: 'a workspace with apps and libraries' }],
        })
      : [];
  const workspace =
    kind === 'app' ? (selectedOptions.includes('monorepo') ? await chooseAppWorkspace(prompter, projectName) : undefined) : await chooseLibraryWorkspace(prompter, projectName);
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
  const agents = await chooseAgents(prompter, [...agentNames]);
  const shouldInitializeGit = await prompter.confirm({ message: 'Initialize Git and create the foundation commit?', initialValue: true });

  return { projectName, directory, kind, workspace, templateName, packageManager, formatter, agents, shouldInitializeGit };
}

// An empty answer skips the remote; anything else must look like a Git remote URL.
async function chooseRemoteUrl(prompter: Prompter) {

  return askValidText(prompter, { message: 'Git remote URL (optional, press Enter to skip)', placeholder: 'git@github.com:owner/repo.git' }, (answer) => {
    if (answer === '') {

      return { value: undefined };
    }

    return isGitRemoteUrl(answer)
      ? { value: answer }
      : { error: `That is not a Git remote URL: ${answer}. Use an https://, ssh://, or git@host:path URL, or press Enter to skip.` };
  });
}

async function createProject(options: CreateOptions): Promise<CreateStatus> {
  const {
    version,
    prompter,
    installDependency = installDevelopmentDependency,
    formatProject = formatCreatedProject,
    verifyProject = verifyCreatedProject,
    initializeGit = initializeProjectGit,
    checkGitIdentity = hasGitIdentity,
    readPackageManagerVersion: readVersion = readPackageManagerVersion,
  } = options;
  const selection = await chooseProject(options);

  if (selection.shouldInitializeGit && !(await checkGitIdentity())) {
    prompter.warn('Git has no author name and email configured, so the foundation commit will be skipped. Set user.name and user.email, then commit the project yourself.');
    selection.shouldInitializeGit = false;
  }

  const remoteUrl = selection.shouldInitializeGit ? await chooseRemoteUrl(prompter) : undefined;

  await assertDestinationAvailable(selection.directory);

  const catalog = await buildSkillCatalog(selection.directory, [], [{ directory: findSharedSkillsPackage(), scope: '.', required: true }]);
  const selectedSkills = catalog.skills;
  const { workspace } = selection;
  const templateFiles = workspace
    ? createWorkspaceFiles({
        projectName: selection.projectName,
        version,
        formatter: selection.formatter,
        packageManager: selection.packageManager,
        packageManagerVersion: await readVersion(selection.packageManager),
        layout: workspace,
      })
    : createTemplateFiles(selection.projectName, selection.templateName, version, selection.formatter);
  const skillFiles = (await Promise.all(selectedSkills.map((skill) => createSkillInstallFiles(skill, selection.agents)))).flat();
  const owners = [
    { type: 'project' as const },
    ...selectedSkills.map((skill) => ({ type: 'skill' as const, name: skill.name })),
  ];
  const plan = await createChangePlan({
    projectRoot: selection.directory,
    files: [...templateFiles, ...skillFiles],
    edits: createInstructionEdits(selectedSkills, [], selection.agents),
    owners,
  });
  const configOptions = {
    existing: undefined,
    version,
    name: selection.projectName,
    packageManager: selection.packageManager,
    targets: workspace ? createWorkspaceTargets(workspace, selection.templateName) : [{ path: '.', kind: selection.kind, template: selection.templateName }],
    addons: [],
    agents: selection.agents,
    formatter: selection.formatter,
    selectedSkills,
    missingSourceSkills: [],
  };
  const plannedConfig = parseProjectConfig(createInitConfig({ ...configOptions, managedFiles: plan.managedFiles }));
  const plannedChanges: string[] = [];

  plannedChanges.push(`Install dependencies: ${describeDevelopmentDependency(selection.packageManager, '@jfdevelops/cli', version, Boolean(workspace))}`);
  plannedChanges.push(`Format and verify: ${selection.packageManager} run format, then ${workspace ? 'format:check, typecheck, test, and build' : 'format:check and build'}`);

  if (selection.shouldInitializeGit) {
    plannedChanges.push('Initialize Git on main and create chore(init): initialize project');

    if (remoteUrl) {
      plannedChanges.push(`Add Git remote origin: ${remoteUrl}`);
    }
  }

  const layoutNote = renderFileTree(basename(selection.directory), listPlannedEntries(plan, true));

  prompter.note(workspace ? `${layoutNote}\n\nPackages build on their own until you link them with workspace dependencies.` : layoutNote, 'Project layout');
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
      isWorkspaceRoot: Boolean(workspace),
    });
  } catch (error) {
    dependencyError = error;
    prompter.error(`Could not install project dependencies: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Installing rewrites package.json, so generated files are recorded as they are afterwards.
  let managedFiles = await refreshManagedFiles(selection.directory, result.managedFiles, (file) => file.owner.type === 'project');
  let verificationError: unknown;

  if (result.isComplete && !dependencyError) {
    try {
      await formatProject({ directory: selection.directory, packageManager: selection.packageManager });
      managedFiles = await refreshManagedFiles(selection.directory, managedFiles, (file) => file.owner.type === 'project');
    } catch (error) {
      verificationError = error;
      prompter.error(`Could not format the project: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await writeProjectConfig(selection.directory, createInitConfig({ ...configOptions, managedFiles }));

  if (result.isComplete && !dependencyError && !verificationError) {
    try {
      await verifyProject({ directory: selection.directory, packageManager: selection.packageManager, isWorkspace: Boolean(workspace) });

      if (selection.shouldInitializeGit) {
        await initializeGit(selection.directory, remoteUrl);
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
