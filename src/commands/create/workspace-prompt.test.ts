import { describe, expect, it } from 'vitest';
import { createScriptedPrompter, type Question } from '../../testing/prompter.js';
import { chooseWorkspace } from './workspace-prompt.js';

// Answers by message, in order; a message with no answers left accepts its default, as pressing Enter does.
function answerWith(answers: Record<string, string[]>) {
  const remaining = Object.fromEntries(Object.entries(answers).map(([message, values]) => [message, [...values]]));

  return (question: Question) => remaining[question.message]?.shift() ?? '';
}

const namespaceMessage = 'What namespace should package names use? (type none for bare names)';

describe('chooseWorkspace', () => {
  it('accepts every default for an unscoped project', async () => {
    const { prompter, transcript } = createScriptedPrompter(answerWith({}));

    await expect(chooseWorkspace(prompter, 'acme')).resolves.toEqual({
      appsDirectory: 'apps',
      packagesDirectory: 'packages',
      apps: [{ name: 'acme-web', directory: 'apps/web' }],
    });
    expect(transcript).toEqual([`? ${namespaceMessage}`, '? What should the app be called?', '? Where should apps live?', '? Where should libraries live?']);
  });

  it('defaults the namespace to the scope of a scoped project name', async () => {
    const defaults: Array<string | undefined> = [];
    const { prompter } = createScriptedPrompter((question) => {
      if (question.kind === 'text') {
        defaults.push(question.defaultValue);
      }

      return '';
    });

    await expect(chooseWorkspace(prompter, '@acme/site')).resolves.toMatchObject({ apps: [{ name: '@acme/web', directory: 'apps/web' }] });
    expect(defaults).toEqual(['@acme', 'web', 'apps', 'packages']);
  });

  it('applies a typed namespace, bare names, and custom directories', async () => {
    const { prompter } = createScriptedPrompter(answerWith({ [namespaceMessage]: ['none'], 'What should the app be called?': ['dashboard'], 'Where should apps live?': ['./services/'], 'Where should libraries live?': ['libs'] }));

    await expect(chooseWorkspace(prompter, 'acme')).resolves.toEqual({
      appsDirectory: 'services',
      packagesDirectory: 'libs',
      apps: [{ name: 'dashboard', directory: 'services/dashboard' }],
    });
  });

  it('keeps a full package name typed for the app and names its directory after the last segment', async () => {
    const { prompter } = createScriptedPrompter(answerWith({ 'What should the app be called?': ['@other/site'] }));

    await expect(chooseWorkspace(prompter, 'acme')).resolves.toMatchObject({ apps: [{ name: '@other/site', directory: 'apps/site' }] });
  });

  it('asks again after an invalid namespace, app name, or directory', async () => {
    const { prompter, transcript } = createScriptedPrompter(
      answerWith({
        [namespaceMessage]: ['Not A Namespace', 'acme'],
        'What should the app be called?': ['Bad Name', 'web'],
        'Where should apps live?': ['../outside', 'apps'],
      }),
    );

    await expect(chooseWorkspace(prompter, 'acme')).resolves.toMatchObject({ apps: [{ name: 'acme-web' }], appsDirectory: 'apps' });
    expect(transcript.filter((line) => line.startsWith('warn:'))).toEqual([
      'warn: Not A Namespace is not a namespace. Use a name like acme or @acme, or type none for bare package names.',
      'warn: acme-Bad Name is not a valid package name.',
      'warn: ../outside is not a project-relative directory such as apps.',
    ]);
  });

  it('rejects an app named like the workspace itself', async () => {
    const { prompter, transcript } = createScriptedPrompter(answerWith({ [namespaceMessage]: ['none'], 'What should the app be called?': ['acme', 'web'] }));

    await expect(chooseWorkspace(prompter, 'acme')).resolves.toMatchObject({ apps: [{ name: 'web' }] });
    expect(transcript.some((line) => line.startsWith('warn: acme is the name of the workspace itself'))).toBe(true);
  });
});
