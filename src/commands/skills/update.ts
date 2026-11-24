import { join } from 'node:path';
import { readPackageManifest } from '../../detect/manifest.js';
import { describePackageInstall, installPackage, type PackageInstaller } from '../../dependencies/install.js';
import { PromptCancelledError, type Prompter } from '../../prompts/prompter.js';
import { openSharedSkillsFromMain, sharedSkillsPackageName, type OpenSharedSkills } from '../../skills/shared.js';
import { loadConfiguredProject } from './inspect.js';
import { runSkillsSync, type SkillsSyncStatus } from './sync.js';

type UpdateOptions = {
  directory: string;
  prompter: Prompter;
  skillNames?: string[];
  installPackage?: PackageInstaller;
  openSharedSkills?: OpenSharedSkills;
};

// Refresh source packages first, then use the normal managed-file review for the selected copies.
export async function runSkillsUpdate({
  directory,
  prompter,
  skillNames,
  installPackage: install = installPackage,
  openSharedSkills = openSharedSkillsFromMain,
}: UpdateOptions): Promise<SkillsSyncStatus> {
  prompter.intro('jfdevelops skills update');

  try {
    const loaded = await loadConfiguredProject(directory, [], openSharedSkills);
    const { project, config } = loaded;

    try {
      const selectedNames = skillNames?.length ? [...new Set(skillNames)] : undefined;
      const names = selectedNames ?? config.skills.map((skill) => skill.name);
      const unknown = names.filter((name) => !config.skills.some((skill) => skill.name === name));

      if (unknown.length > 0) {
        throw new Error(`Unknown enabled skills: ${unknown.join(', ')}`);
      }

      const packages = new Set(config.skills.filter((skill) => names.includes(skill.name)).map((skill) => skill.source.package));
      const installs: Parameters<PackageInstaller>[0][] = [];

      if (packages.has(sharedSkillsPackageName)) {
        prompter.info(`Shared convention skills refresh from ${sharedSkillsPackageName} main during sync.`);
        packages.delete(sharedSkillsPackageName);
      }

      for (const scope of [...new Set(['.', ...config.targets.map((target) => target.path)])]) {
        const scopeDirectory = join(project.root, scope);
        const manifest = await readPackageManifest(scopeDirectory);

        if (!manifest) {
          continue;
        }

        for (const packageName of packages) {
          const specifier = manifest.dependencies?.[packageName] ?? manifest.devDependencies?.[packageName] ?? manifest.optionalDependencies?.[packageName];

          if (!specifier) {
            continue;
          }

          if (/^(workspace:|file:|link:|portal:)/.test(specifier)) {
            prompter.info(`${packageName} in ${scope} uses a local source; syncing its installed skills without a registry update.`);
            continue;
          }

          if (manifest.optionalDependencies?.[packageName]) {
            throw new Error(`${packageName} is optional in ${scope}. Update it with your package manager, then run jfdevelops skills sync.`);
          }

          installs.push({
            directory: scopeDirectory,
            packageManager: config.project.packageManager,
            packageName: `${packageName}@latest`,
            isDevelopment: !manifest.dependencies?.[packageName],
            isWorkspaceRoot: scope === '.' && project.workspace?.source === 'pnpm-workspace.yaml',
          });
        }
      }

      if (installs.length > 0) {
        prompter.note(installs.map((options) => `${options.directory}: ${describePackageInstall(options.packageManager, options.packageName, options.isDevelopment, options.isWorkspaceRoot)}`).join('\n'), 'Update skill source packages');
        prompter.info('Updating a source package updates all of its code. Only the selected skill copies will be synchronized.');

        if (!(await prompter.confirm({ message: 'Update these source packages to their latest published versions?', initialValue: true }))) {
          throw new PromptCancelledError('Declined');
        }

        for (const options of installs) {
          await install(options);
        }
      }

      // A default update omits skillNames so sync can install newly required shared skills from main.
      const status = await runSkillsSync({
        directory,
        prompter,
        ...(selectedNames ? { skillNames: selectedNames } : {}),
        openSharedSkills,
      });

      if (status === 'cancelled' && installs.length > 0) {
        prompter.info('Source package upgrades remain installed, including manifest and lockfile changes.');
      }

      return status;
    } finally {
      if (loaded.ownsCheckout) {
        await loaded.checkout.close();
      }
    }
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      prompter.cancel('Update cancelled.');

      return 'cancelled';
    }

    prompter.error(error instanceof Error ? error.message : String(error));
    prompter.cancel('Update failed. Source packages may already have changed; rerun update to retry.');

    return 'failed';
  }
}
