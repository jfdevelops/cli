import { spawn } from 'node:child_process';
import type { PackageManagerName } from '../detect/package-manager.js';

// isWorkspaceRoot marks a pnpm workspace root, where pnpm refuses to add dependencies without --workspace-root.
export type DependencyInstaller = (options: {
  directory: string;
  packageManager: PackageManagerName;
  packageName: string;
  version: string;
  isWorkspaceRoot?: boolean;
}) => Promise<void>;

export function describeDevelopmentDependency(packageManager: PackageManagerName, packageName: string, version: string, isWorkspaceRoot = false) {

  return [packageManager, ...getArguments(packageManager, packageName, version, isWorkspaceRoot)].join(' ');
}

function getArguments(packageManager: PackageManagerName, packageName: string, version: string, isWorkspaceRoot = false) {
  const specifier = `${packageName}@${version}`;

  switch (packageManager) {
    case 'npm':

      return ['install', '--save-dev', '--save-exact', specifier];
    case 'pnpm':

      return ['add', '--save-dev', '--save-exact', ...(isWorkspaceRoot ? ['--workspace-root'] : []), specifier];
    case 'yarn':

      return ['add', '--dev', '--exact', specifier];
    case 'bun':

      return ['add', '--dev', '--exact', specifier];
  }
}

function runPackageManager(directory: string, packageManager: PackageManagerName, arguments_: string[]) {

  return new Promise<void>((resolve, reject) => {
    const executable = process.platform === 'win32' ? `${packageManager}.cmd` : packageManager;
    const child = spawn(executable, arguments_, { cwd: directory, stdio: 'inherit' });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${packageManager} exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

export const installDevelopmentDependency: DependencyInstaller = async ({ directory, packageManager, packageName, version, isWorkspaceRoot }) => {
  await runPackageManager(directory, packageManager, getArguments(packageManager, packageName, version, isWorkspaceRoot));
};

export type PackageInstaller = (options: {
  directory: string;
  packageManager: PackageManagerName;
  packageName: string;
  isDevelopment: boolean;
  isWorkspaceRoot?: boolean;
}) => Promise<void>;

function getPackageArguments(packageManager: PackageManagerName, packageName: string, isDevelopment: boolean, isWorkspaceRoot = false) {
  const command = packageManager === 'npm' ? 'install' : 'add';
  const developmentFlag = packageManager === 'npm' || packageManager === 'pnpm' ? '--save-dev' : '--dev';
  const workspaceFlag = packageManager === 'pnpm' && isWorkspaceRoot ? ['--workspace-root'] : [];

  return [command, ...(isDevelopment ? [developmentFlag] : []), ...workspaceFlag, packageName];
}

export function describePackageInstall(packageManager: PackageManagerName, packageName: string, isDevelopment: boolean, isWorkspaceRoot = false) {

  return [packageManager, ...getPackageArguments(packageManager, packageName, isDevelopment, isWorkspaceRoot)].join(' ');
}

// Adds the latest version of a package, as a development dependency when requested.
export const installPackage: PackageInstaller = async ({ directory, packageManager, packageName, isDevelopment, isWorkspaceRoot }) => {
  await runPackageManager(directory, packageManager, getPackageArguments(packageManager, packageName, isDevelopment, isWorkspaceRoot));
};
