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

export const installDevelopmentDependency: DependencyInstaller = async ({ directory, packageManager, packageName, version, isWorkspaceRoot }) => {
  await new Promise<void>((resolve, reject) => {
    const executable = process.platform === 'win32' ? `${packageManager}.cmd` : packageManager;
    const child = spawn(executable, getArguments(packageManager, packageName, version, isWorkspaceRoot), {
      cwd: directory,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${packageManager} exited with code ${code ?? 'unknown'}`));
      }
    });
  });
};
