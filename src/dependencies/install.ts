import type { PackageManagerName } from '../detect/package-manager.js';
import { runCommand } from '../process/run.js';

export type DependencyInstaller = (options: { directory: string; packageManager: PackageManagerName; packageName: string; version: string }) => Promise<void>;

export function describeDevelopmentDependency(packageManager: PackageManagerName, packageName: string, version: string) {
  const specifier = `${packageName}@${version}`;

  switch (packageManager) {
    case 'npm':

      return `npm install --save-dev --save-exact ${specifier}`;
    case 'pnpm':

      return `pnpm add --save-dev --save-exact ${specifier}`;
    case 'yarn':

      return `yarn add --dev --exact ${specifier}`;
    case 'bun':

      return `bun add --dev --exact ${specifier}`;
  }
}

function getArguments(packageManager: PackageManagerName, packageName: string, version: string) {
  const specifier = `${packageName}@${version}`;

  switch (packageManager) {
    case 'npm':

      return ['install', '--save-dev', '--save-exact', specifier];
    case 'pnpm':

      return ['add', '--save-dev', '--save-exact', specifier];
    case 'yarn':

      return ['add', '--dev', '--exact', specifier];
    case 'bun':

      return ['add', '--dev', '--exact', specifier];
  }
}

async function runPackageManager(directory: string, packageManager: PackageManagerName, arguments_: string[]) {
  await runCommand(packageManager, arguments_, { cwd: directory });
}

export const installDevelopmentDependency: DependencyInstaller = async ({ directory, packageManager, packageName, version }) => {
  await runPackageManager(directory, packageManager, getArguments(packageManager, packageName, version));
};

export type PackageInstaller = (options: { directory: string; packageManager: PackageManagerName; packageName: string; isDevelopment: boolean }) => Promise<void>;

function getPackageArguments(packageManager: PackageManagerName, packageName: string, isDevelopment: boolean) {
  const command = packageManager === 'npm' ? 'install' : 'add';
  const developmentFlag = packageManager === 'npm' || packageManager === 'pnpm' ? '--save-dev' : '--dev';

  return [command, ...(isDevelopment ? [developmentFlag] : []), packageName];
}

export function describePackageInstall(packageManager: PackageManagerName, packageName: string, isDevelopment: boolean) {

  return [packageManager, ...getPackageArguments(packageManager, packageName, isDevelopment)].join(' ');
}

// Adds the latest version of a package, as a development dependency when requested.
export const installPackage: PackageInstaller = async ({ directory, packageManager, packageName, isDevelopment }) => {
  await runPackageManager(directory, packageManager, getPackageArguments(packageManager, packageName, isDevelopment));
};
