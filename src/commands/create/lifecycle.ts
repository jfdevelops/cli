import { spawn } from 'node:child_process';
import type { PackageManagerName } from '../../detect/package-manager.js';

export type ProjectVerifier = (options: { directory: string; packageManager: PackageManagerName }) => Promise<void>;
export type GitInitializer = (directory: string) => Promise<void>;

function runCommand(command: string, arguments_: string[], directory: string) {

  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, arguments_, { cwd: directory, stdio: 'inherit' });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${arguments_.join(' ')} exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

export const verifyCreatedProject: ProjectVerifier = async ({ directory, packageManager }) => {
  const executable = process.platform === 'win32' ? `${packageManager}.cmd` : packageManager;

  await runCommand(executable, ['run', 'format:check'], directory);
  await runCommand(executable, ['run', 'build'], directory);
};

export const initializeProjectGit: GitInitializer = async (directory) => {
  await runCommand('git', ['init', '-b', 'main'], directory);
  await runCommand('git', ['add', '--all'], directory);
  await runCommand('git', ['commit', '-m', 'chore(init): initialize project'], directory);
};
