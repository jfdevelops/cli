import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProjectConfig } from '../../config/read.js';
import { runAdd } from '../add/run.js';
import { detectWorkspace } from '../../detect/workspace.js';
import { hashContent } from '../../plan/hash.js';
import { createFixture } from '../../testing/fixture.js';
import { createScriptedPrompter, type Question } from '../../testing/prompter.js';
import { runCreate, type CreateOptions } from './run.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

const remotePrompt = 'Git remote URL (optional, press Enter to skip)';

// `remoteUrls` are answers to the remote prompt in order; it skips the remote once they run out.
function answerProject(overrides: Partial<Record<Question['kind'], string | boolean | string[]>> = {}, remoteUrls: string[] = []) {
  const remaining = [...remoteUrls];

  return (question: Question) => {
    if (question.message === remotePrompt) {

      return remaining.shift() ?? '';
    }

    const override = overrides[question.kind];

    if (override !== undefined) {

      return override;
    }

    if (question.kind === 'text') {

      return question.defaultValue ?? 'my-project';
    }

    if (question.kind === 'confirm') {

      return true;
    }

    if (question.kind === 'multiselect') {

      return [];
    }

    if (question.message === 'What kind of project are you creating?') {

      return 'app';
    }

    if (question.message === 'Which template should be used?') {

      return question.choices[0]?.value ?? '';
    }

    return question.initialValue ?? question.choices[0]?.value ?? '';
  };
}

async function installTestDependency({ directory, packageName, version }: Parameters<NonNullable<CreateOptions['installDependency']>>[0]) {
  const path = join(directory, 'package.json');
  const manifest = JSON.parse(await readFile(path, 'utf8')) as { devDependencies?: Record<string, string> };

  manifest.devDependencies = { ...manifest.devDependencies, [packageName]: version };
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

const noopLifecycle = {
  installDependency: installTestDependency,
  formatProject: async () => undefined,
  verifyProject: async () => undefined,
  initializeGit: async () => undefined,
  checkGitIdentity: async () => true,
};

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('runCreate', () => {
  it('creates a reviewed app with required skills, configuration, and the CLI dependency', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'site');
    const { prompter, transcript } = createScriptedPrompter(answerProject({ text: 'site' }));
    const lifecycle: string[] = [];

    fixtures.push(fixture);

    await expect(
      runCreate({
        directory: destination,
        version: '0.1.0',
        prompter,
        installDependency: installTestDependency,
        formatProject: async () => undefined,
        verifyProject: async () => {
          lifecycle.push('verified');
        },
        initializeGit: async () => {
          lifecycle.push('git');
        },
        checkGitIdentity: async () => true,
      }),
    ).resolves.toBe('complete');

    expect(existsSync(join(destination, 'src/index.ts'))).toBe(true);
    expect(existsSync(join(destination, '.agents/skills/jf-git/SKILL.md'))).toBe(true);
    expect(JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'))).toMatchObject({
      name: 'site',
      private: true,
      devDependencies: { '@jfdevelops/cli': '0.1.0' },
    });
    expect(await readProjectConfig(destination)).toMatchObject({
      project: { name: 'site', packageManager: 'pnpm' },
      formatter: 'prettier',
      targets: [{ path: '.', kind: 'app', template: 'node-app' }],
      skills: [
        { name: 'jf-coding-conventions', required: true },
        { name: 'jf-git', required: true },
        { name: 'jf-naming-conventions', required: true },
      ],
    });
    expect(transcript.some((line) => line.includes('Install dependencies: pnpm add'))).toBe(true);
    expect(lifecycle).toEqual(['verified', 'git']);
    expect(transcript.at(-1)).toContain('outro: Created site in');

    const manifestRecord = (await readProjectConfig(destination))?.managedFiles.find((file) => file.path === 'package.json');

    expect(manifestRecord?.sha256).toBe(hashContent(await readFile(join(destination, 'package.json'))));
  });

  it('names the project from the argument without asking for a name or destination', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'site');
    const { prompter, transcript } = createScriptedPrompter(answerProject());

    fixtures.push(fixture);

    await runCreate({ directory: destination, version: '0.1.0', prompter, ...noopLifecycle });

    expect(transcript.some((line) => line.includes('package name'))).toBe(false);
    expect(transcript.some((line) => line.includes('Where should the project be created?'))).toBe(false);
    expect(JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'))).toMatchObject({ name: 'site' });
  });

  it('creates a scoped package in a directory named after its last segment', async () => {
    const fixture = await createFixture({});
    const previousDirectory = process.cwd();
    const { prompter } = createScriptedPrompter(answerProject());

    fixtures.push(fixture);
    process.chdir(fixture.root);

    try {
      await expect(runCreate({ directory: '@acme/site', version: '0.1.0', prompter, ...noopLifecycle })).resolves.toBe('complete');
    } finally {
      process.chdir(previousDirectory);
    }

    expect(JSON.parse(await readFile(join(fixture.root, 'site/package.json'), 'utf8'))).toMatchObject({ name: '@acme/site' });
    expect(existsSync(join(fixture.root, '@acme'))).toBe(false);
  });

  it('creates the project in the current directory when given a dot', async () => {
    const fixture = await createFixture({});
    const current = join(fixture.root, 'current-site');
    const previousDirectory = process.cwd();
    const { prompter } = createScriptedPrompter(answerProject());

    fixtures.push(fixture);
    await mkdir(current);
    process.chdir(current);

    try {
      await expect(runCreate({ directory: '.', version: '0.1.0', prompter, ...noopLifecycle })).resolves.toBe('complete');
    } finally {
      process.chdir(previousDirectory);
    }

    expect(JSON.parse(await readFile(join(current, 'package.json'), 'utf8'))).toMatchObject({ name: 'current-site' });
  });

  it('asks for a name when the directory name is not a valid package name', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'My Site');
    const { prompter, transcript } = createScriptedPrompter(answerProject({ text: 'my-site' }));

    fixtures.push(fixture);

    await runCreate({ directory: destination, version: '0.1.0', prompter, ...noopLifecycle });

    expect(transcript.some((line) => line.includes('package name'))).toBe(true);
    expect(JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'))).toMatchObject({ name: 'my-site' });
  });

  it('adds the pasted remote as origin after the foundation commit and lists it in the plan', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'site');
    const calls: Array<[string, string | undefined]> = [];
    const { prompter, transcript } = createScriptedPrompter(answerProject({}, ['git@github.com:acme/site.git']));

    fixtures.push(fixture);

    await expect(
      runCreate({
        directory: destination,
        version: '0.1.0',
        prompter,
        ...noopLifecycle,
        initializeGit: async (directory, remoteUrl) => {
          calls.push([directory, remoteUrl]);
        },
      }),
    ).resolves.toBe('complete');

    expect(calls).toEqual([[destination, 'git@github.com:acme/site.git']]);
    expect(transcript.find((line) => line.startsWith('note [Planned project]'))).toContain('Add Git remote origin: git@github.com:acme/site.git');
  });

  it('adds no remote when the prompt is skipped', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'site');
    const calls: Array<string | undefined> = [];
    const { prompter, transcript } = createScriptedPrompter(answerProject());

    fixtures.push(fixture);

    await runCreate({
      directory: destination,
      version: '0.1.0',
      prompter,
      ...noopLifecycle,
      initializeGit: async (_directory, remoteUrl) => {
        calls.push(remoteUrl);
      },
    });

    expect(calls).toEqual([undefined]);
    expect(transcript.find((line) => line.startsWith('note [Planned project]'))).not.toContain('remote');
  });

  it('asks again when the remote is not a Git URL', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'site');
    const calls: Array<string | undefined> = [];
    const { prompter, transcript } = createScriptedPrompter(answerProject({}, ['not a url', 'https://github.com/acme/site.git']));

    fixtures.push(fixture);

    await runCreate({
      directory: destination,
      version: '0.1.0',
      prompter,
      ...noopLifecycle,
      initializeGit: async (_directory, remoteUrl) => {
        calls.push(remoteUrl);
      },
    });

    expect(transcript.some((line) => line.startsWith('warn: That is not a Git remote URL: not a url.'))).toBe(true);
    expect(calls).toEqual(['https://github.com/acme/site.git']);
  });

  it('does not ask for a remote when Git is not initialized', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'site');
    const { prompter, transcript } = createScriptedPrompter(answerProject());

    fixtures.push(fixture);

    await runCreate({ directory: destination, version: '0.1.0', prompter, ...noopLifecycle, checkGitIdentity: async () => false });

    expect(transcript.some((line) => line.includes(remotePrompt))).toBe(false);
  });

  it('creates a monorepo with the app in apps, root tooling, and workspace targets', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'site');
    const workspaceRootFlags: Array<boolean | undefined> = [];
    const { prompter, transcript } = createScriptedPrompter(answerProject({ multiselect: ['monorepo'] }));

    fixtures.push(fixture);

    await expect(
      runCreate({
        directory: destination,
        version: '0.1.0',
        prompter,
        ...noopLifecycle,
        installDependency: async (installation) => {
          workspaceRootFlags.push(installation.isWorkspaceRoot);
          await installTestDependency(installation);
        },
      }),
    ).resolves.toBe('complete');

    const rootManifest = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8')) as Record<string, unknown>;
    const detected = await detectWorkspace(destination, {}, 'pnpm');

    expect(rootManifest).toMatchObject({ name: 'site', private: true, devDependencies: { '@jfdevelops/cli': '0.1.0' } });
    expect(JSON.parse(await readFile(join(destination, 'apps/web/package.json'), 'utf8'))).toMatchObject({ name: 'site-web', private: true });
    expect(existsSync(join(destination, 'apps/web/src/index.ts'))).toBe(true);
    expect(existsSync(join(destination, 'src'))).toBe(false);
    expect(existsSync(join(destination, '.agents/skills/jf-git/SKILL.md'))).toBe(true);
    expect(detected.workspace).toMatchObject({ source: 'pnpm-workspace.yaml', patterns: ['packages/*', 'apps/*'], packagePaths: ['apps/web'] });
    expect(await readProjectConfig(destination)).toMatchObject({
      project: { name: 'site', packageManager: 'pnpm' },
      targets: [{ path: 'apps/web', kind: 'app', template: 'node-app' }],
    });
    expect(workspaceRootFlags).toEqual([true]);
    expect(transcript.find((line) => line.startsWith('note [Planned project]'))).toContain('pnpm add --save-dev --save-exact --workspace-root @jfdevelops/cli@0.1.0');

    const layout = transcript.find((line) => line.startsWith('note [Project layout]')) ?? '';

    expect(layout).toContain('site/');
    expect(layout).toContain('├── apps/');
    expect(layout).toContain('(');
    expect(layout).toContain('Packages build on their own until you link them');
  });

  it.each([
    ['the default libraries directory', undefined, 'packages/utils'],
    ['a custom libraries directory', 'libs', 'libs/utils'],
  ])('lets add package default to %s of a created monorepo', async (_name, librariesDirectory, expected) => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'site');
    const respond = answerProject({ multiselect: ['monorepo'] });
    const { prompter } = createScriptedPrompter((question) => (librariesDirectory && question.message === 'Where should libraries live?' ? librariesDirectory : respond(question)));
    const defaults: Array<string | undefined> = [];
    const { prompter: addPrompter } = createScriptedPrompter((question) => {
      if (question.kind === 'text') {
        defaults.push(question.defaultValue);

        return question.defaultValue ?? '';
      }

      return question.kind === 'confirm' ? false : '';
    });

    fixtures.push(fixture);

    await expect(runCreate({ directory: destination, version: '0.1.0', prompter, ...noopLifecycle })).resolves.toBe('complete');
    await runAdd({ directory: destination, kind: 'package', name: 'utils', prompter: addPrompter });

    expect(defaults).toEqual([expected]);
  });

  it('shows the project layout for a single package too, without the workspace note', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'site');
    const { prompter, transcript } = createScriptedPrompter(answerProject());

    fixtures.push(fixture);

    await runCreate({ directory: destination, version: '0.1.0', prompter, ...noopLifecycle });

    const layout = transcript.find((line) => line.startsWith('note [Project layout]')) ?? '';

    expect(layout).toContain('├── src/');
    expect(layout).toContain('jfdevelops.json');
    expect(layout).not.toContain('workspace');
    expect(transcript.findIndex((line) => line.startsWith('note [Project layout]'))).toBeLessThan(transcript.findIndex((line) => line.startsWith('note [Planned project]')));
  });

  it('does not offer the monorepo option for a library', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'toolkit');
    const { prompter, transcript } = createScriptedPrompter((question) => {
      if (question.message === 'What kind of project are you creating?') {

        return 'library';
      }

      return answerProject({ multiselect: ['monorepo'] })(question);
    });

    fixtures.push(fixture);

    await expect(runCreate({ directory: destination, version: '0.1.0', prompter, ...noopLifecycle })).resolves.toBe('complete');

    expect(transcript.some((line) => line.includes('Which options should the project use?'))).toBe(false);
    expect(await readProjectConfig(destination)).toMatchObject({ targets: [{ path: '.', kind: 'library' }] });
  });

  it('skips the foundation commit when Git has no author identity', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'site');
    const lifecycle: string[] = [];
    const { prompter, transcript } = createScriptedPrompter(answerProject({ text: 'site' }));

    fixtures.push(fixture);

    await expect(
      runCreate({
        directory: destination,
        version: '0.1.0',
        prompter,
        installDependency: installTestDependency,
        formatProject: async () => undefined,
        verifyProject: async () => undefined,
        initializeGit: async () => {
          lifecycle.push('git');
        },
        checkGitIdentity: async () => false,
      }),
    ).resolves.toBe('complete');

    expect(lifecycle).toEqual([]);
    expect(transcript.some((line) => line.startsWith('warn: Git has no author name and email configured'))).toBe(true);
    expect(transcript.find((line) => line.startsWith('note [Planned project]'))).not.toContain('Initialize Git');
  });

  it('writes nothing when project creation is declined', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'site');
    const { prompter } = createScriptedPrompter((question) => {
      if (question.kind === 'confirm') {

        return false;
      }

      return answerProject({ text: 'site' })(question);
    });

    fixtures.push(fixture);

    await expect(
      runCreate({
        directory: destination,
        version: '0.1.0',
        prompter,
        installDependency: installTestDependency,
        formatProject: async () => undefined,
        verifyProject: async () => undefined,
        initializeGit: async () => undefined,
        checkGitIdentity: async () => true,
      }),
    ).resolves.toBe('cancelled');
    expect(existsSync(destination)).toBe(false);
  });

  it('refuses a non-empty destination before showing a project plan', async () => {
    const fixture = await createFixture({ 'site/keep.txt': 'mine' });
    const destination = join(fixture.root, 'site');
    const { prompter, transcript } = createScriptedPrompter(answerProject({ text: 'site' }));

    fixtures.push(fixture);

    await expect(
      runCreate({
        directory: destination,
        version: '0.1.0',
        prompter,
        installDependency: installTestDependency,
        formatProject: async () => undefined,
        verifyProject: async () => undefined,
        initializeGit: async () => undefined,
        checkGitIdentity: async () => true,
      }),
    ).resolves.toBe('failed');
    expect(transcript.some((line) => line.startsWith('error: Destination is not empty:'))).toBe(true);
    expect(await readFile(join(destination, 'keep.txt'), 'utf8')).toBe('mine');
  });
});
