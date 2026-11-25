import type { PackageManagerName } from '../detect/package-manager.js';
import { runCommand } from '../process/run.js';

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

async function runPackageManager(directory: string, packageManager: PackageManagerName, arguments_: string[]) {
  await runCommand(packageManager, arguments_, { cwd: directory });
}

export async function installDevelopmentDependency({ directory, packageManager, packageName, version, isWorkspaceRoot }: Parameters<DependencyInstaller>[0]) {
  await runPackageManager(directory, packageManager, getArguments(packageManager, packageName, version, isWorkspaceRoot));
}

export type PackageInstaller = (options: {
  directory: string;
  packageManager: PackageManagerName;
  packageName: string;
  isDevelopment: boolean;
  isWorkspaceRoot?: boolean;
  /** Saves the exact resolved version instead of the package manager's default range. */
  isExact?: boolean;
}) => Promise<void>;

function getPackageArguments(packageManager: PackageManagerName, packageName: string, isDevelopment: boolean, isWorkspaceRoot = false, isExact = false) {
  const command = packageManager === 'npm' ? 'install' : 'add';
  const usesSaveFlags = packageManager === 'npm' || packageManager === 'pnpm';
  const developmentFlag = usesSaveFlags ? '--save-dev' : '--dev';
  const exactFlag = usesSaveFlags ? '--save-exact' : '--exact';
  const workspaceFlag = packageManager === 'pnpm' && isWorkspaceRoot ? ['--workspace-root'] : [];

  return [command, ...(isDevelopment ? [developmentFlag] : []), ...(isExact ? [exactFlag] : []), ...workspaceFlag, packageName];
}

export function describePackageInstall(packageManager: PackageManagerName, packageName: string, isDevelopment: boolean, isWorkspaceRoot = false, isExact = false) {

  return [packageManager, ...getPackageArguments(packageManager, packageName, isDevelopment, isWorkspaceRoot, isExact)].join(' ');
}

/** Whether a manifest specifier pins one exact version, such as `1.2.3`, rather than a range. */
export function isExactVersion(specifier: string | undefined) {

  return specifier !== undefined && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(specifier);
}

// Adds the latest version of a package, as a development dependency when requested.
export async function installPackage({ directory, packageManager, packageName, isDevelopment, isWorkspaceRoot, isExact }: Parameters<PackageInstaller>[0]) {
  await runPackageManager(directory, packageManager, getPackageArguments(packageManager, packageName, isDevelopment, isWorkspaceRoot, isExact));
}
