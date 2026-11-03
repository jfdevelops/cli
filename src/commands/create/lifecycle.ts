import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PackageManagerName } from '../../detect/package-manager.js';
import { runCommand } from '../../process/run.js';

export type ProjectVerifier = (options: { directory: string; packageManager: PackageManagerName }) => Promise<void>;
export type GitInitializer = (directory: string) => Promise<void>;
export type GitIdentityCheck = () => Promise<boolean>;

const execFileAsync = promisify(execFile);

export async function verifyCreatedProject({ directory, packageManager }: Parameters<ProjectVerifier>[0]) {
  await runCommand(packageManager, ['run', 'format:check'], { cwd: directory });
  await runCommand(packageManager, ['run', 'build'], { cwd: directory });
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
  await runCommand('git', ['init', '-b', 'main'], { cwd: directory });
  await runCommand('git', ['add', '--all'], { cwd: directory });
  await runCommand('git', ['commit', '-m', 'chore(init): initialize project'], { cwd: directory });
}
