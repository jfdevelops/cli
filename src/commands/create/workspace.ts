import type { PackageManagerName } from '../../detect/package-manager.js';
import type { DesiredFile } from '../../plan/create.js';
import { createCiFiles } from './ci.js';
import {
  createFormattingFiles,
  createJsonFile,
  createWorkspaceAppFiles,
  createWorkspacePackageFiles,
  getFormattingManifest,
  libraryTemplateName,
  projectOwner,
  typescriptVersion,
  vitePlusVersion,
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
  // Recorded as packageManager, so Vite+ and CI use the version the project was created with.
  packageManagerVersion: string;
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

function createRootFiles({ projectName, version, formatter, packageManager, packageManagerVersion, layout }: WorkspaceFileOptions): DesiredFile[] {
  const formatting = getFormattingManifest(formatter);
  const patterns = getWorkspacePatterns(layout);
  const manifest = {
    name: projectName,
    private: true,
    version: '0.0.0',
    type: 'module',
    packageManager: `${packageManager}@${packageManagerVersion}`,
    ...(packageManager === 'pnpm' ? {} : { workspaces: patterns }),
    scripts: { build: 'vp run -r build', typecheck: 'vp run -r typecheck', test: 'vp run -r test', ...formatting.scripts },
    devDependencies: { '@jfdevelops/cli': version, typescript: typescriptVersion, 'vite-plus': vitePlusVersion, ...formatting.devDependencies },
  };
  const packageList = [...layout.apps, ...layout.libraries].map((workspacePackage) => `- \`${workspacePackage.directory}\`: ${workspacePackage.name}`).join('\n');

  return [
    { path: '.gitignore', owner: projectOwner, content: 'dist/\nnode_modules/\n' },
    {
      path: 'README.md',
      owner: projectOwner,
      content: `# ${projectName}\n\nWorkspace generated with @jfdevelops/cli.\n\n${packageList}\n\nPackages build on their own until you link them with workspace dependencies.\n\nCI checks only the packages a change affects and the packages that depend on them.\n`,
    },
    ...createFormattingFiles(formatter),
    createJsonFile('package.json', manifest),
    ...createCiFiles(),
    ...(packageManager === 'pnpm'
      ? [{ path: 'pnpm-workspace.yaml', owner: projectOwner, content: `packages:\n${patterns.map((pattern) => `  - ${pattern}`).join('\n')}\n` }]
      : []),
  ];
}

function createAppFiles(app: WorkspacePackage): DesiredFile[] {

  return createWorkspaceAppFiles(app.name).map((file) => ({ path: `${app.directory}/${file.path}`, owner: projectOwner, content: file.content }));
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
