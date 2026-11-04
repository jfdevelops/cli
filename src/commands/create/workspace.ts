import type { PackageManagerName } from '../../detect/package-manager.js';
import type { DesiredFile } from '../../plan/create.js';
import { createFormattingFiles, createJsonFile, getFormattingManifest, projectOwner, typescriptVersion, appCompiler, appEntry, type FormatterName } from './templates.js';

export type WorkspaceApp = { name: string; directory: string };

export type WorkspaceLayout = {
  appsDirectory: string;
  packagesDirectory: string;
  apps: WorkspaceApp[];
};

type WorkspaceFileOptions = {
  projectName: string;
  version: string;
  formatter: FormatterName;
  packageManager: PackageManagerName;
  layout: WorkspaceLayout;
};

/**
 * A scoped namespace such as `@acme` gives `@acme/utils`; a plain one such as `acme` gives `acme-utils`.
 * A name typed with its own scope is kept as typed, and an empty namespace leaves the name bare.
 */
export function composePackageName(namespace: string, name: string) {
  if (name.startsWith('@') || namespace === '') {

    return name;
  }

  return namespace.startsWith('@') ? `${namespace}/${name}` : `${namespace}-${name}`;
}

// The directory is named after the last segment of the name that was typed, so `web` and `@acme/web` both live in `apps/web`.
export function getPackageDirectory(parent: string, typedName: string) {

  return `${parent}/${typedName.split('/').at(-1) ?? typedName}`;
}

export function getWorkspacePatterns(layout: WorkspaceLayout) {

  return [...new Set([`${layout.appsDirectory}/*`, `${layout.packagesDirectory}/*`])];
}

// Each command runs the build script of every package except the workspace root itself.
function getBuildScript(packageManager: PackageManagerName, rootName: string, layout: WorkspaceLayout) {
  switch (packageManager) {
    case 'pnpm':

      return 'pnpm -r run build';
    case 'npm':

      return 'npm run build --workspaces --if-present';
    case 'yarn':

      return `yarn workspaces foreach --all --exclude ${rootName} run build`;
    case 'bun':

      return `bun run ${getWorkspacePatterns(layout).map((pattern) => `--filter './${pattern}'`).join(' ')} build`;
  }
}

function createRootFiles({ projectName, version, formatter, packageManager, layout }: WorkspaceFileOptions): DesiredFile[] {
  const formatting = getFormattingManifest(formatter);
  const patterns = getWorkspacePatterns(layout);
  const manifest = {
    name: projectName,
    private: true,
    version: '0.0.0',
    type: 'module',
    ...(packageManager === 'pnpm' ? {} : { workspaces: patterns }),
    scripts: { build: getBuildScript(packageManager, projectName, layout), ...formatting.scripts },
    devDependencies: { '@jfdevelops/cli': version, typescript: typescriptVersion, ...formatting.devDependencies },
  };
  const appList = layout.apps.map((app) => `- \`${app.directory}\`: ${app.name}`).join('\n');

  return [
    { path: '.gitignore', owner: projectOwner, content: 'dist/\nnode_modules/\n' },
    {
      path: 'README.md',
      owner: projectOwner,
      content: `# ${projectName}\n\nWorkspace generated with @jfdevelops/cli.\n\n${appList}\n\nPackages build on their own until you link them with workspace dependencies.\n`,
    },
    ...createFormattingFiles(formatter),
    createJsonFile('package.json', manifest),
    ...(packageManager === 'pnpm'
      ? [{ path: 'pnpm-workspace.yaml', owner: projectOwner, content: `packages:\n${patterns.map((pattern) => `  - ${pattern}`).join('\n')}\n` }]
      : []),
  ];
}

function createAppFiles(app: WorkspaceApp): DesiredFile[] {
  const manifest = {
    name: app.name,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: { build: 'tsc', start: 'node dist/index.js' },
    devDependencies: { '@types/node': '^22.20.5', typescript: typescriptVersion },
  };

  return [
    { path: `${app.directory}/README.md`, owner: projectOwner, content: `# ${app.name}\n\nWorkspace app generated with @jfdevelops/cli.\n` },
    createJsonFile(`${app.directory}/package.json`, manifest),
    createJsonFile(`${app.directory}/tsconfig.json`, appCompiler),
    { path: `${app.directory}/src/index.ts`, owner: projectOwner, content: appEntry },
  ];
}

/**
 * Files for a workspace root and its packages. Formatting, linting, and the CLI dependency live at the root, so each
 * package only declares what it builds with.
 */
export function createWorkspaceFiles(options: WorkspaceFileOptions) {

  return [...createRootFiles(options), ...options.layout.apps.flatMap((app) => createAppFiles(app))];
}
