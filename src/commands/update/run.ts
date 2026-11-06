import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { writeProjectConfig } from '../../config/write.js';
import { describePackageInstall, installPackage, type DependencyInstaller, type PackageInstaller } from '../../dependencies/install.js';
import { createChangePlan } from '../../plan/create.js';
import type { PackageManagerName } from '../../detect/package-manager.js';
import { runCommand } from '../../process/run.js';
import { PromptCancelledError, type Prompter } from '../../prompts/prompter.js';
import { findInstalledPackage } from '../../skills/installed.js';
import { confirmAndApply } from '../confirm-and-apply.js';
import { runInit } from '../init/run.js';
import { loadConfiguredProject } from '../skills/inspect.js';
import { runSkillsUpdate } from '../skills/update.js';
import type { SkillsSyncStatus } from '../skills/sync.js';
import type { PackageManagerVersionReader } from '../create/lifecycle.js';
import { createProjectUpdateFiles } from './files.js';

type UpdateOptions = {
  directory: string;
  version: string;
  prompter: Prompter;
  isRefreshingProject?: boolean;
  installPackage?: PackageInstaller;
  installDependency?: DependencyInstaller;
  readPackageManagerVersion?: PackageManagerVersionReader;
  installProject?: (directory: string, packageManager: PackageManagerName) => Promise<void>;
  runInstalledUpdate?: (root: string) => Promise<void>;
};

// Run the newly installed release so the refresh uses its templates and migrations, rather than this older process.
async function runInstalledUpdate(root: string) {
  const installed = findInstalledPackage(root, '@jfdevelops/cli', root);

  if (!installed) {
    throw new Error('The upgraded CLI was not found in this project. Reinstall @jfdevelops/cli and retry update.');
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [join(installed, 'dist/cli.js'), 'update', root, '--refresh-project'], { cwd: root, stdio: 'inherit', shell: false });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else if (code === 2) {
        reject(new PromptCancelledError('Project refresh declined.'));
      } else {
        reject(new Error(`The upgraded CLI could not finish the project update (exit ${code ?? 'unknown'}). Run jfdevelops update again to retry.`));
      }
    });
  });
}

async function installProject(directory: string, packageManager: PackageManagerName) {
  await runCommand(packageManager, ['install'], { cwd: directory });
}

async function refreshProject(options: UpdateOptions): Promise<SkillsSyncStatus> {
  const { directory, version, prompter } = options;
  const skillStatus = await runSkillsUpdate({ directory, prompter, ...(options.installPackage ? { installPackage: options.installPackage } : {}) });

  if (skillStatus !== 'complete' && skillStatus !== 'unchanged') {

    return skillStatus;
  }

  // Re-detect integrations and offer newly available required skills while preserving existing target metadata.
  const initStatus = await runInit({ directory, version, prompter, ...(options.installDependency ? { installDependency: options.installDependency } : {}) });

  if (initStatus !== 'complete' && initStatus !== 'unchanged') {

    return initStatus;
  }

  const { project, config } = await loadConfiguredProject(directory);
  const files = await createProjectUpdateFiles(project.root, config, version, options.readPackageManagerVersion);
  const desiredPaths = new Set(files.map((file) => file.path));
  const untouched = config.managedFiles.filter((file) => file.owner.type === 'project' && !desiredPaths.has(file.path));
  const plan = await createChangePlan({
    projectRoot: project.root,
    managedFiles: config.managedFiles.filter((file) => !untouched.includes(file)),
    files,
    owners: [{ type: 'project' }],
  });

  if (!plan.hasChanges) {
    prompter.outro('Project setup is up to date.');

    return 'unchanged';
  }

  const result = await confirmAndApply({ projectRoot: project.root, plan, prompter, isConfigChanged: true, extraSteps: ['Install dependencies after updating project tooling.'] });

  await writeProjectConfig(project.root, { ...config, managedFiles: [...result.managedFiles, ...untouched] });

  if (!result.isComplete) {

    return 'incomplete';
  }

  await (options.installProject ?? installProject)(project.root, config.project.packageManager);
  prompter.outro('Project tooling updated.');

  return 'complete';
}

export async function runUpdate(options: UpdateOptions): Promise<SkillsSyncStatus> {
  const { directory, prompter, installPackage: install = installPackage, runInstalledUpdate: runInstalled = runInstalledUpdate } = options;

  prompter.intro('jfdevelops update');

  try {
    if (options.isRefreshingProject) {

      return await refreshProject(options);
    }

    const { project, config } = await loadConfiguredProject(directory);
    const installOptions = {
      directory: project.root,
      packageManager: config.project.packageManager,
      packageName: '@jfdevelops/cli@latest',
      isDevelopment: !project.manifest.dependencies?.['@jfdevelops/cli'],
      isWorkspaceRoot: project.workspace?.source === 'pnpm-workspace.yaml',
    };

    prompter.note(describePackageInstall(installOptions.packageManager, installOptions.packageName, installOptions.isDevelopment, installOptions.isWorkspaceRoot), 'Upgrade CLI');
    prompter.info('The latest CLI will review skill, integration, and generated tooling updates. Package upgrades remain installed if a later review is declined.');

    if (!(await prompter.confirm({ message: 'Upgrade the CLI and review project updates?', initialValue: true }))) {
      throw new PromptCancelledError('Declined');
    }

    await install(installOptions);
    await runInstalled(project.root);
    prompter.outro('CLI and project update finished.');

    return 'complete';
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      prompter.cancel('Project update cancelled.');

      return 'cancelled';
    }

    prompter.error(error instanceof Error ? error.message : String(error));
    prompter.cancel('Project update failed. Applied package or file changes remain; rerun update to retry.');

    return 'failed';
  }
}
