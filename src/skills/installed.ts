import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// Follows Node's node_modules lookup from a package directory up to the project root.
export function findInstalledPackage(fromDirectory: string, packageName: string, projectRoot: string) {
  const root = resolve(projectRoot);
  let directory = resolve(fromDirectory);

  while (true) {
    const candidate = join(directory, 'node_modules', ...packageName.split('/'));

    if (existsSync(join(candidate, 'package.json'))) {

      return candidate;
    }

    const parent = dirname(directory);
    const isAtRoot = directory === root || parent === directory || relative(root, directory).startsWith('..');

    if (isAtRoot) {

      return undefined;
    }

    directory = parent;
  }
}
