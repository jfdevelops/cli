import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import type { PackageManagerName } from '../../detect/package-manager.js';
import { runCommand } from '../../process/run.js';
import type { FormatterName } from './templates.js';

export type ProjectFormatOptions = {
  directory: string;
  packageManager: PackageManagerName;
  formatter: FormatterName;
  // Only these project-relative paths are formatted, so kept conflict files stay untouched.
  paths: string[];
};

// isWorkspace marks a workspace root, whose packages are also type checked and tested.
export type ProjectVerifier = (options: ProjectFormatOptions & { isWorkspace?: boolean }) => Promise<void>;
export type ProjectFormatter = (options: ProjectFormatOptions) => Promise<void>;
export type PackageManagerVersionReader = (packageManager: PackageManagerName) => Promise<string>;
export type GitInitializer = (directory: string, remoteUrl?: string) => Promise<void>;
export type GitIdentityCheck = () => Promise<boolean>;

const execFileAsync = promisify(execFile);

async function runFormatter(packageManager: PackageManagerName, formatter: FormatterName, paths: string[], directory: string, mode: 'write' | 'check') {
  const execArguments = packageManager === 'npm' ? ['exec', '--'] : ['exec'];

  if (formatter === 'biome') {
    await runCommand(packageManager, [...execArguments, 'biome', 'format', '--files-ignore-unknown=true', ...(mode === 'write' ? ['--write'] : []), ...paths], { cwd: directory });
  } else {
    await runCommand(packageManager, [...execArguments, 'prettier', '--ignore-unknown', mode === 'write' ? '--write' : '--check', ...paths], { cwd: directory });
  }

  await runCommand(packageManager, [...execArguments, 'eslint', ...(mode === 'write' ? ['--fix'] : []), ...paths], { cwd: directory });
}

// Applies the selected formatter and style policy only to the paths create wrote or overwrote.
export async function formatCreatedProject({ directory, packageManager, formatter, paths }: ProjectFormatOptions) {
  if (paths.length === 0) {

    return;
  }

  await runFormatter(packageManager, formatter, paths, directory, 'write');
}

export async function verifyCreatedProject({ directory, packageManager, formatter, paths, isWorkspace = false }: ProjectFormatOptions & { isWorkspace?: boolean }) {
  if (paths.length > 0) {
    await runFormatter(packageManager, formatter, paths, directory, 'check');
  }

  const scripts = isWorkspace ? ['typecheck', 'test', 'build'] : ['build'];

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
