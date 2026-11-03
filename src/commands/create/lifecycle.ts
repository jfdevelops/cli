import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { PackageManagerName } from '../../detect/package-manager.js';

export type ProjectVerifier = (options: { directory: string; packageManager: PackageManagerName }) => Promise<void>;
export type GitInitializer = (directory: string) => Promise<void>;
export type GitIdentityCheck = () => Promise<boolean>;

const execFileAsync = promisify(execFile);

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

export async function verifyCreatedProject({ directory, packageManager }: Parameters<ProjectVerifier>[0]) {
  const executable = process.platform === 'win32' ? `${packageManager}.cmd` : packageManager;

  await runCommand(executable, ['run', 'format:check'], directory);
  await runCommand(executable, ['run', 'build'], directory);
}

// Resolves the author and committer the way the foundation commit will, including environment variables.
export async function hasGitIdentity() {
  try {
    await Promise.all(['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT'].map((variable) => execFileAsync('git', ['var', variable])));

    return true;
  } catch {

    return false;
  }
}

export async function initializeProjectGit(directory: string) {
  await runCommand('git', ['init', '-b', 'main'], directory);
  await runCommand('git', ['add', '--all'], directory);
  await runCommand('git', ['commit', '-m', 'chore(init): initialize project'], directory);
}
