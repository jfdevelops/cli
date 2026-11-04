import { packageNameSchema, projectPathSchema } from '../../config/schema.js';
import { askValidText } from '../../prompts/ask-valid.js';
import type { Prompter } from '../../prompts/prompter.js';
import { composePackageName, getPackageDirectory, type WorkspaceLayout } from './workspace.js';

const defaultAppName = 'web';

// The last segment of a typed name becomes a directory, so it cannot be empty, `.`, `..`, or contain spaces.
const directoryNamePattern = /^[a-z0-9][a-z0-9._-]*$/;

// A scoped project name such as @acme/site shares its scope; a plain name is its own namespace.
function getDefaultNamespace(projectName: string) {

  return projectName.startsWith('@') ? (projectName.split('/')[0] ?? projectName) : projectName;
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

/**
 * Asks how a monorepo is laid out: the namespace for package names, the first app, and the directories that
 * apps and libraries live in. Every default is shown grey, so pressing Enter accepts it.
 */
export async function chooseWorkspace(prompter: Prompter, projectName: string): Promise<WorkspaceLayout> {
  const namespace = await askValidText(
    prompter,
    { message: 'What namespace should package names use? (type none for bare names)', defaultValue: getDefaultNamespace(projectName) },
    parseNamespace,
  );
  // The package name carries the namespace, but its directory is named after what was typed, so that must be a plain name.
  const app = await askValidText(prompter, { message: 'What should the app be called?', defaultValue: defaultAppName }, (answer) => {
    if (!directoryNamePattern.test(answer.split('/').at(-1) ?? '')) {

      return { error: answer === '' ? 'Enter an app name.' : `${answer} is not a valid app name.` };
    }

    const name = composePackageName(namespace, answer);

    if (!packageNameSchema.safeParse(name).success) {

      return { error: `${name} is not a valid package name.` };
    }

    if (name === projectName) {

      return { error: `${name} is the name of the workspace itself. Choose a different name for the app.` };
    }

    return { value: { name, typedName: answer } };
  });
  const appsDirectory = await askValidText(prompter, { message: 'Where should apps live?', defaultValue: 'apps' }, parseDirectory);
  const packagesDirectory = await askValidText(prompter, { message: 'Where should libraries live?', defaultValue: 'packages' }, parseDirectory);

  return { appsDirectory, packagesDirectory, apps: [{ name: app.name, directory: getPackageDirectory(appsDirectory, app.typedName) }] };
}
