import type { PackageManagerName } from '../../detect/package-manager.js';
import { runCommand } from '../../process/run.js';

export type ProjectVerifier = (options: { directory: string; packageManager: PackageManagerName }) => Promise<void>;
export type GitInitializer = (directory: string) => Promise<void>;

export const verifyCreatedProject: ProjectVerifier = async ({ directory, packageManager }) => {
  await runCommand(packageManager, ['run', 'format:check'], { cwd: directory });
  await runCommand(packageManager, ['run', 'build'], { cwd: directory });
};

export const initializeProjectGit: GitInitializer = async (directory) => {
  await runCommand('git', ['init', '-b', 'main'], { cwd: directory });
  await runCommand('git', ['add', '--all'], { cwd: directory });
  await runCommand('git', ['commit', '-m', 'chore(init): initialize project'], { cwd: directory });
};
