import { describe, expect, it } from 'vitest';
import { createScriptedPrompter, type Question } from '../../testing/prompter.js';
import { chooseAppWorkspace, chooseLibraryWorkspace } from './workspace-prompt.js';

const namespaceMessage = 'What namespace should package names use? (type none for bare names)';
const appMessage = 'What should the app be called?';
const addMessage = 'Do you want to add a package?';
const libraryAddMessage = 'Do you want to add a package? (this makes the project a workspace)';
const nameMessage = 'What do you want to name this package?';
const anotherMessage = 'Add another package?';

// Answers by message, in order; a message with no answers left accepts its default, as pressing Enter does.
function answerWith(answers: Record<string, Array<string | boolean>>) {
  const remaining = Object.fromEntries(Object.entries(answers).map(([message, values]) => [message, [...values]]));

  return (question: Question) => remaining[question.message]?.shift() ?? (question.kind === 'confirm' ? false : '');
}

function warnings(transcript: string[]) {

  return transcript.filter((line) => line.startsWith('warn:'));
}

describe('chooseAppWorkspace', () => {
  it('accepts every default for an unscoped project and adds no libraries', async () => {
    const { prompter, transcript } = createScriptedPrompter(answerWith({}));

    await expect(chooseAppWorkspace(prompter, 'acme')).resolves.toEqual({
      appsDirectory: 'apps',
      packagesDirectory: 'packages',
      apps: [{ name: 'acme-web', directory: 'apps/web' }],
      libraries: [],
    });
    expect(transcript).toEqual([`? ${namespaceMessage}`, `? ${appMessage}`, '? Where should apps live?', '? Where should libraries live?', `? ${addMessage}`]);
  });

  it('defaults the namespace to the scope of a scoped project name', async () => {
    const defaults: Array<string | undefined> = [];
    const { prompter } = createScriptedPrompter((question) => {
      if (question.kind === 'text') {
        defaults.push(question.defaultValue);
      }

      return question.kind === 'confirm' ? false : '';
    });

    await expect(chooseAppWorkspace(prompter, '@acme/site')).resolves.toMatchObject({ apps: [{ name: '@acme/web', directory: 'apps/web' }] });
    expect(defaults).toEqual(['@acme', 'web', 'apps', 'packages']);
  });

  it('applies a typed namespace, bare names, and custom directories', async () => {
    const { prompter } = createScriptedPrompter(
      answerWith({ [namespaceMessage]: ['none'], [appMessage]: ['dashboard'], 'Where should apps live?': ['./services/'], 'Where should libraries live?': ['libs'] }),
    );

    await expect(chooseAppWorkspace(prompter, 'acme')).resolves.toMatchObject({
      appsDirectory: 'services',
      packagesDirectory: 'libs',
      apps: [{ name: 'dashboard', directory: 'services/dashboard' }],
    });
  });

  it('keeps a full package name typed for the app and names its directory after the last segment', async () => {
    const { prompter } = createScriptedPrompter(answerWith({ [appMessage]: ['@other/site'] }));

    await expect(chooseAppWorkspace(prompter, 'acme')).resolves.toMatchObject({ apps: [{ name: '@other/site', directory: 'apps/site' }] });
  });

  it('asks for libraries one at a time, naming each from the namespace and showing where it goes', async () => {
    const defaults: Array<string | undefined> = [];
    const respond = answerWith({ [addMessage]: [true], [nameMessage]: ['utils', 'ui'], [anotherMessage]: [true, false] });
    const { prompter, transcript } = createScriptedPrompter((question) => {
      if (question.kind === 'text' && question.message === nameMessage) {
        defaults.push(question.defaultValue);
      }

      return respond(question);
    });

    await expect(chooseAppWorkspace(prompter, 'acme')).resolves.toMatchObject({
      libraries: [
        { name: 'acme-utils', directory: 'packages/utils' },
        { name: 'acme-ui', directory: 'packages/ui' },
      ],
    });
    expect(defaults).toEqual(['core', undefined]);
    expect(transcript.filter((line) => line.startsWith('success:'))).toEqual(['success: Added packages/utils (acme-utils)', 'success: Added packages/ui (acme-ui)']);
  });

  it('names the first library core when its default is accepted', async () => {
    const { prompter } = createScriptedPrompter(answerWith({ [addMessage]: [true] }));

    await expect(chooseAppWorkspace(prompter, 'acme')).resolves.toMatchObject({ libraries: [{ name: 'acme-core', directory: 'packages/core' }] });
  });

  it('asks again after an invalid namespace, app name, or directory', async () => {
    const { prompter, transcript } = createScriptedPrompter(
      answerWith({ [namespaceMessage]: ['Not A Namespace', 'acme'], [appMessage]: ['Bad Name', 'web'], 'Where should apps live?': ['../outside', 'apps'] }),
    );

    await expect(chooseAppWorkspace(prompter, 'acme')).resolves.toMatchObject({ apps: [{ name: 'acme-web' }], appsDirectory: 'apps' });
    expect(warnings(transcript)).toEqual([
      'warn: Not A Namespace is not a namespace. Use a name like acme or @acme, or type none for bare package names.',
      'warn: acme-Bad Name is not a valid package name.',
      'warn: ../outside is not a project-relative directory such as apps.',
    ]);
  });

  it('asks again for an app named like the workspace itself', async () => {
    const { prompter, transcript } = createScriptedPrompter(answerWith({ [namespaceMessage]: ['none'], [appMessage]: ['acme', 'web'] }));

    await expect(chooseAppWorkspace(prompter, 'acme')).resolves.toMatchObject({ apps: [{ name: 'web' }] });
    expect(warnings(transcript)).toEqual(['warn: acme is already used in this workspace. Choose a different name.']);
  });

  it('asks again for a library named like the app, in a directory the app uses, or repeating a library', async () => {
    const { prompter, transcript } = createScriptedPrompter(
      answerWith({
        'Where should apps live?': ['shared'],
        'Where should libraries live?': ['shared'],
        [addMessage]: [true],
        // acme-web is the app's name, shared/web is its directory, and acme-utils is the first library once it is added.
        [nameMessage]: ['web', '@other/web', 'utils', 'utils', 'ui'],
        [anotherMessage]: [true, false],
      }),
    );

    const layout = await chooseAppWorkspace(prompter, 'acme');

    expect(layout.libraries.map((library) => library.name)).toEqual(['acme-utils', 'acme-ui']);
    expect(warnings(transcript)).toEqual([
      'warn: acme-web is already used in this workspace. Choose a different name.',
      'warn: shared/web is already used in this workspace. Choose a different name.',
      'warn: acme-utils is already used in this workspace. Choose a different name.',
    ]);
  });

  it('asks again when a library after the first is left empty', async () => {
    const { prompter, transcript } = createScriptedPrompter(answerWith({ [addMessage]: [true], [nameMessage]: ['utils', '', 'ui'], [anotherMessage]: [true, false] }));

    const layout = await chooseAppWorkspace(prompter, 'acme');

    expect(layout.libraries.map((library) => library.name)).toEqual(['acme-utils', 'acme-ui']);
    expect(warnings(transcript)).toEqual(['warn: Enter a package name.']);
  });
});

describe('chooseLibraryWorkspace', () => {
  it('keeps a single package when declined, without asking anything else', async () => {
    const { prompter, transcript } = createScriptedPrompter(answerWith({}));

    await expect(chooseLibraryWorkspace(prompter, 'acme')).resolves.toBeUndefined();
    expect(transcript).toEqual([`? ${libraryAddMessage}`]);
  });

  it('makes a workspace of scoped libraries named in a loop with no apps directory', async () => {
    const { prompter, transcript } = createScriptedPrompter(
      answerWith({ [libraryAddMessage]: [true], [nameMessage]: ['', 'utils'], [anotherMessage]: [true, false] }),
    );

    await expect(chooseLibraryWorkspace(prompter, 'acme')).resolves.toEqual({
      appsDirectory: undefined,
      packagesDirectory: 'packages',
      apps: [],
      libraries: [
        { name: '@acme/core', directory: 'packages/core' },
        { name: '@acme/utils', directory: 'packages/utils' },
      ],
    });
    expect(transcript.slice(0, 6)).toEqual([
      `? ${libraryAddMessage}`,
      `? ${namespaceMessage}`,
      '? Where should libraries live?',
      `? ${nameMessage}`,
      'success: Added packages/core (@acme/core)',
      `? ${anotherMessage}`,
    ]);
    expect(transcript.some((line) => line.includes('Where should apps live?'))).toBe(false);
  });

  it('defaults the namespace to the scope of a scoped project name', async () => {
    const defaults: Array<string | undefined> = [];
    const respond = answerWith({ [libraryAddMessage]: [true] });
    const { prompter } = createScriptedPrompter((question) => {
      if (question.kind === 'text' && question.message === namespaceMessage) {
        defaults.push(question.defaultValue);
      }

      return respond(question);
    });

    await expect(chooseLibraryWorkspace(prompter, '@acme/kit')).resolves.toMatchObject({ libraries: [{ name: '@acme/core' }] });
    expect(defaults).toEqual(['@acme']);
  });

  it('asks again for a library named like the workspace itself', async () => {
    const { prompter, transcript } = createScriptedPrompter(answerWith({ [libraryAddMessage]: [true], [namespaceMessage]: ['none'], [nameMessage]: ['core', 'utils'] }));

    await expect(chooseLibraryWorkspace(prompter, 'core')).resolves.toMatchObject({ libraries: [{ name: 'utils' }] });
    expect(warnings(transcript)).toEqual(['warn: core is already used in this workspace. Choose a different name.']);
  });
});
