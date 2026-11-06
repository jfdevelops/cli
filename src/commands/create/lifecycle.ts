import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import type { PackageManagerName } from '../../detect/package-manager.js';
import { runCommand } from '../../process/run.js';

// isWorkspace marks a workspace root, whose packages are also type checked and tested.
export type ProjectVerifier = (options: { directory: string; packageManager: PackageManagerName; isWorkspace?: boolean }) => Promise<void>;
export type ProjectFormatter = (options: { directory: string; packageManager: PackageManagerName }) => Promise<void>;
export type PackageManagerVersionReader = (packageManager: PackageManagerName) => Promise<string>;
export type GitInitializer = (directory: string, remoteUrl?: string) => Promise<void>;
export type GitIdentityCheck = () => Promise<boolean>;

const execFileAsync = promisify(execFile);

// Applies the selected formatter and style policy to the generated files once dependencies are installed.
export async function formatCreatedProject({ directory, packageManager }: Parameters<ProjectFormatter>[0]) {
  await runCommand(packageManager, ['run', 'format'], { cwd: directory });
}

export async function verifyCreatedProject({ directory, packageManager, isWorkspace = false }: Parameters<ProjectVerifier>[0]) {
  const scripts = isWorkspace ? ['format:check', 'typecheck', 'test', 'build'] : ['format:check', 'build'];

  for (const script of scripts) {
    await runCommand(packageManager, ['run', script], { cwd: directory });
  }
}

// The installed version, such as 10.28.1, recorded so Turborepo and CI use the package manager the project was created with.
// It is read from the home directory because pnpm and corepack switch versions inside a project that declares one.
export async function readPackageManagerVersion(packageManager: PackageManagerName) {
  const output = await runCommand(packageManager, ['--version'], { cwd: homedir(), captureOutput: true });
  const version = output.trim().match(/^\d+\.\d+\.\d+\S*$/)?.[0];

  if (!version) {
    throw new Error(`Could not read the ${packageManager} version from: ${output.trim()}`);
  }

  return version;
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

// https://host/path, ssh://host/path, or scp-style user@host:path. Starting with a letter or digit keeps a URL from being read as an option.
const gitRemoteUrlPattern = /^(?:https?:\/\/[^\s/]+\/\S+|ssh:\/\/[A-Za-z0-9][^\s/]*\/\S+|[A-Za-z0-9_][\w.-]*@[\w.-]+:\S+)$/;

export function isGitRemoteUrl(value: string) {

  return gitRemoteUrlPattern.test(value);
}

export async function initializeProjectGit(directory: string, remoteUrl?: string) {
  await runCommand('git', ['init', '-b', 'main'], { cwd: directory });
  await runCommand('git', ['add', '--all'], { cwd: directory });
  await runCommand('git', ['commit', '-m', 'chore(init): initialize project'], { cwd: directory });

  if (remoteUrl) {
    await runCommand('git', ['remote', 'add', 'origin', remoteUrl], { cwd: directory });
  }
}
