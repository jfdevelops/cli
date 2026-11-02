import { spawn } from 'node:child_process';
import type { PackageManagerName } from '../detect/package-manager.js';

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

export const installDevelopmentDependency: DependencyInstaller = async ({ directory, packageManager, packageName, version }) => {
  await new Promise<void>((resolve, reject) => {
    const executable = process.platform === 'win32' ? `${packageManager}.cmd` : packageManager;
    const child = spawn(executable, getArguments(packageManager, packageName, version), {
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
