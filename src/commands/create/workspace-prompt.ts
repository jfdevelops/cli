import { packageNameSchema, projectPathSchema } from '../../config/schema.js';
import { askValidText, type Validated } from '../../prompts/ask-valid.js';
import type { Prompter } from '../../prompts/prompter.js';
import { composePackageName, getPackageDirectory, type WorkspaceLayout, type WorkspacePackage } from './workspace.js';

const defaultAppName = 'web';
const defaultLibraryName = 'core';

// Names and directories already claimed in the workspace, including the workspace root's own name.
type Taken = { names: Set<string>; directories: Set<string> };

// The last segment of a typed name becomes a directory, so it cannot be empty, `.`, `..`, or contain spaces.
const directoryNamePattern = /^[a-z0-9][a-z0-9._-]*$/;

// A scoped project name such as @acme/site shares its scope; otherwise a library is scoped by the project name and an app is prefixed by it.
export function getDefaultNamespace(projectName: string, kind: 'app' | 'library') {
  if (projectName.startsWith('@')) {

    return projectName.split('/')[0] ?? projectName;
  }

  return kind === 'library' ? `@${projectName}` : projectName;
}

export function resolveNamespace(answer: string | undefined, projectName: string, kind: 'app' | 'library') {
  const parsed = parseNamespace(answer ?? getDefaultNamespace(projectName, kind));

  if ('error' in parsed) {
    throw new Error(parsed.error);
  }

  return parsed.value;
}

function resolveDirectory(answer: string | undefined, fallback: string) {
  const parsed = parseDirectory(answer ?? fallback);

  if ('error' in parsed) {
    throw new Error(parsed.error);
  }

  return parsed.value;
}

function resolveWorkspacePackage(name: string, namespace: string, parentDirectory: string, taken: Taken, label: 'app' | 'package') {
  const result = createPackageValidator(namespace, parentDirectory, taken, label)(name);

  if ('error' in result) {
    throw new Error(result.error);
  }

  return result.value;
}

function resolveLibraries(names: string[], namespace: string, directory: string, taken: Taken) {
  const libraries: WorkspacePackage[] = [];

  for (const name of names) {
    const library = resolveWorkspacePackage(name, namespace, directory, taken, 'package');

    libraries.push(library);
    claim(taken, library);
  }

  return libraries;
}

/** Builds an app monorepo layout from flags, using the same defaults as the interactive prompts. */
export function createAppWorkspaceFromFlags(options: {
  projectName: string;
  namespace?: string;
  appName?: string;
  appsDirectory?: string;
  packagesDirectory?: string;
  packages?: string[];
}): WorkspaceLayout {
  const taken: Taken = { names: new Set([options.projectName]), directories: new Set() };
  const namespace = resolveNamespace(options.namespace, options.projectName, 'app');
  const appName = options.appName ?? defaultAppName;
  const appsDirectory = resolveDirectory(options.appsDirectory, 'apps');
  const packagesDirectory = resolveDirectory(options.packagesDirectory, 'packages');
  const app = resolveWorkspacePackage(appName, namespace, appsDirectory, taken, 'app');

  claim(taken, app);

  return {
    appsDirectory,
    packagesDirectory,
    apps: [app],
    libraries: resolveLibraries(options.packages ?? [], namespace, packagesDirectory, taken),
  };
}

/** Builds a library-only workspace from flags. At least one package name is required. */
export function createLibraryWorkspaceFromFlags(options: {
  projectName: string;
  namespace?: string;
  packagesDirectory?: string;
  packages?: string[];
}): WorkspaceLayout {
  const packageNames = options.packages ?? [defaultLibraryName];
  const taken: Taken = { names: new Set([options.projectName]), directories: new Set() };
  const namespace = resolveNamespace(options.namespace, options.projectName, 'library');
  const packagesDirectory = resolveDirectory(options.packagesDirectory, 'packages');

  return {
    appsDirectory: undefined,
    packagesDirectory,
    apps: [],
    libraries: resolveLibraries(packageNames, namespace, packagesDirectory, taken),
  };
}

function parseNamespace(answer: string) {
  if (answer.toLowerCase() === 'none') {

    return { value: '' };
  }

  if (!/^@?[a-z0-9][a-z0-9._-]*$/.test(answer)) {

    return { error: `${answer} is not a namespace. Use a name like acme or @acme, or type none for bare package names.` };
  }

  return { value: answer };
}

function parseDirectory(answer: string) {
  const directory = answer.replace(/^\.\//, '').replace(/\/+$/, '');

  if (!projectPathSchema.safeParse(directory).success) {

    return { error: `${answer} is not a project-relative directory such as apps.` };
  }

  return { value: directory };
}

// The package name carries the namespace, but its directory is named after what was typed, so that must be a plain name.
function createPackageValidator(namespace: string, parentDirectory: string, taken: Taken, label: 'app' | 'package') {

  return (answer: string): Validated<WorkspacePackage> => {
    if (!directoryNamePattern.test(answer.split('/').at(-1) ?? '')) {

      return { error: answer === '' ? `Enter ${label === 'app' ? 'an app' : 'a package'} name.` : `${answer} is not a valid ${label} name.` };
    }

    const name = composePackageName(namespace, answer);
    const directory = getPackageDirectory(parentDirectory, answer);

    if (!packageNameSchema.safeParse(name).success) {

      return { error: `${name} is not a valid package name.` };
    }

    if (taken.names.has(name)) {

      return { error: `${name} is already used in this workspace. Choose a different name.` };
    }

    if (taken.directories.has(directory)) {

      return { error: `${directory} is already used in this workspace. Choose a different name.` };
    }

    return { value: { name, directory } };
  };
}

function claim(taken: Taken, workspacePackage: WorkspacePackage) {
  taken.names.add(workspacePackage.name);
  taken.directories.add(workspacePackage.directory);
}

function askNamespace(prompter: Prompter, projectName: string, kind: 'app' | 'library') {

  return askValidText(
    prompter,
    { message: 'What namespace should package names use? (type none for bare names)', defaultValue: getDefaultNamespace(projectName, kind) },
    parseNamespace,
  );
}

function askDirectory(prompter: Prompter, message: string, defaultValue: string) {

  return askValidText(prompter, { message, defaultValue }, parseDirectory);
}

/**
 * Collects libraries one at a time: ask for a name, show where it will be created, then offer another.
 * Only the first name has a default, so adding more always means typing a name.
 */
async function askLibraries(
  prompter: Prompter,
  { namespace, directory, taken, hasAgreed }: { namespace: string; directory: string; taken: Taken; hasAgreed: boolean },
) {
  const libraries: WorkspacePackage[] = [];
  let shouldAdd = hasAgreed || (await prompter.confirm({ message: 'Do you want to add a package?', initialValue: false }));

  while (shouldAdd) {
    const library = await askValidText(
      prompter,
      { message: 'What do you want to name this package?', ...(libraries.length === 0 ? { defaultValue: defaultLibraryName } : {}) },
      createPackageValidator(namespace, directory, taken, 'package'),
    );

    libraries.push(library);
    claim(taken, library);
    prompter.success(`Added ${library.directory} (${library.name})`);
    shouldAdd = await prompter.confirm({ message: 'Add another package?', initialValue: false });
  }

  return libraries;
}

/**
 * Asks how an app monorepo is laid out: the namespace for package names, the first app, the directories that apps and
 * libraries live in, and any libraries to add. Every default is shown grey, so pressing Enter accepts it.
 */
export async function chooseAppWorkspace(prompter: Prompter, projectName: string): Promise<WorkspaceLayout> {
  const taken: Taken = { names: new Set([projectName]), directories: new Set() };
  const namespace = await askNamespace(prompter, projectName, 'app');
  // The apps directory is asked after the app, so the app is placed once its directory is known.
  const appName = await askValidText(prompter, { message: 'What should the app be called?', defaultValue: defaultAppName }, (answer) => {
    const result = createPackageValidator(namespace, '', taken, 'app')(answer);

    return 'value' in result ? { value: { ...result.value, typedName: answer } } : result;
  });
  const appsDirectory = await askDirectory(prompter, 'Where should apps live?', 'apps');
  const packagesDirectory = await askDirectory(prompter, 'Where should libraries live?', 'packages');
  const app = { name: appName.name, directory: getPackageDirectory(appsDirectory, appName.typedName) };

  claim(taken, app);

  const libraries = await askLibraries(prompter, { namespace, directory: packagesDirectory, taken, hasAgreed: false });

  return { appsDirectory, packagesDirectory, apps: [app], libraries };
}

/**
 * Offers to add packages to a library project. Agreeing turns it into a workspace of libraries, so declining keeps the
 * single package; otherwise it asks for the namespace and libraries directory, then collects the libraries.
 */
export async function chooseLibraryWorkspace(prompter: Prompter, projectName: string): Promise<WorkspaceLayout | undefined> {
  if (!(await prompter.confirm({ message: 'Do you want to add a package? (this makes the project a workspace)', initialValue: false }))) {

    return undefined;
  }

  const taken: Taken = { names: new Set([projectName]), directories: new Set() };
  const namespace = await askNamespace(prompter, projectName, 'library');
  const packagesDirectory = await askDirectory(prompter, 'Where should libraries live?', 'packages');
  const libraries = await askLibraries(prompter, { namespace, directory: packagesDirectory, taken, hasAgreed: true });

  return { appsDirectory: undefined, packagesDirectory, apps: [], libraries };
}
