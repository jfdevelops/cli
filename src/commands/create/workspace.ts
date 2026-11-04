import type { PackageManagerName } from '../../detect/package-manager.js';
import type { DesiredFile } from '../../plan/create.js';
import {
  appCompiler,
  appEntry,
  createFormattingFiles,
  createJsonFile,
  createWorkspacePackageFiles,
  getFormattingManifest,
  libraryTemplateName,
  projectOwner,
  typescriptVersion,
  type FormatterName,
} from './templates.js';

export type WorkspacePackage = { name: string; directory: string };

/**
 * A workspace with apps has both directories. A workspace of libraries alone has no apps directory, so
 * its definition only covers the libraries.
 */
export type WorkspaceLayout = {
  appsDirectory: string | undefined;
  packagesDirectory: string;
  apps: WorkspacePackage[];
  libraries: WorkspacePackage[];
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

// `add package` creates libraries in the directory of the first pattern, so the libraries directory comes first.
export function getWorkspacePatterns(layout: WorkspaceLayout) {
  const directories = [layout.packagesDirectory, layout.appsDirectory].filter((directory) => directory !== undefined);

  return [...new Set(directories.map((directory) => `${directory}/*`))];
}

/** One target per package for `jfdevelops.json`, using the template each package kind is created from. */
export function createWorkspaceTargets(layout: WorkspaceLayout, appTemplateName: string) {

  return [
    ...layout.apps.map((app) => ({ path: app.directory, kind: 'app' as const, template: appTemplateName })),
    ...layout.libraries.map((library) => ({ path: library.directory, kind: 'library' as const, template: libraryTemplateName })),
  ];
}

// Each command runs the build script of every registered workspace package, including ones added later, except the root itself.
function getBuildScript(packageManager: PackageManagerName, rootName: string) {
  switch (packageManager) {
    case 'pnpm':

      return 'pnpm -r run build';
    case 'npm':

      return 'npm run build --workspaces --if-present';
    case 'yarn':

      return `yarn workspaces foreach --all --exclude ${rootName} run build`;
    case 'bun':

      return "bun run --filter '*' build";
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
    scripts: { build: getBuildScript(packageManager, projectName), ...formatting.scripts },
    devDependencies: { '@jfdevelops/cli': version, typescript: typescriptVersion, ...formatting.devDependencies },
  };
  const packageList = [...layout.apps, ...layout.libraries].map((workspacePackage) => `- \`${workspacePackage.directory}\`: ${workspacePackage.name}`).join('\n');

  return [
    { path: '.gitignore', owner: projectOwner, content: 'dist/\nnode_modules/\n' },
    {
      path: 'README.md',
      owner: projectOwner,
      content: `# ${projectName}\n\nWorkspace generated with @jfdevelops/cli.\n\n${packageList}\n\nPackages build on their own until you link them with workspace dependencies.\n`,
    },
    ...createFormattingFiles(formatter),
    createJsonFile('package.json', manifest),
    ...(packageManager === 'pnpm'
      ? [{ path: 'pnpm-workspace.yaml', owner: projectOwner, content: `packages:\n${patterns.map((pattern) => `  - ${pattern}`).join('\n')}\n` }]
      : []),
  ];
}

function createAppFiles(app: WorkspacePackage): DesiredFile[] {
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

// Libraries next to apps are shared internally, so they are private; a workspace of only libraries is meant to publish them.
function createLibraryFiles(library: WorkspacePackage, isPrivate: boolean): DesiredFile[] {

  return createWorkspacePackageFiles(library.name, { isPrivate }).map((file) => ({ path: `${library.directory}/${file.path}`, owner: projectOwner, content: file.content }));
}

/**
 * Files for a workspace root and its packages. Formatting, linting, and the CLI dependency live at the root, so each
 * package only declares what it builds with.
 */
export function createWorkspaceFiles(options: WorkspaceFileOptions) {
  const { layout } = options;
  const hasApps = layout.apps.length > 0;

  return [...createRootFiles(options), ...layout.apps.flatMap((app) => createAppFiles(app)), ...layout.libraries.flatMap((library) => createLibraryFiles(library, hasApps))];
}
