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

const agentsPrompt = 'Which coding agents should load the skills?';

const remotePrompt = 'Git remote URL (optional, press Enter to skip)';

const addPackageMessages = ['Do you want to add a package?', 'Do you want to add a package? (this makes the project a workspace)'];

// `remoteUrls` answer the remote prompt in order, skipping the remote once they run out. `libraryNames` are the packages
// to add, in order; an empty string accepts the default name, and none means no packages are added.
function answerProject(overrides: Partial<Record<Question['kind'], string | boolean | string[]>> = {}, remoteUrls: string[] = [], libraryNames: string[] = []) {
  const remaining = [...remoteUrls];
  const names = [...libraryNames];

  return (question: Question) => {
    if (question.message === remotePrompt) {

      return remaining.shift() ?? '';
    }

    if (addPackageMessages.includes(question.message) || question.message === 'Add another package?') {

      return names.length > 0;
    }

    if (question.message === 'What do you want to name this package?') {

      return names.shift() ?? '';
    }

    if (question.kind === 'multiselect' && question.message === agentsPrompt) {

      return question.initialValues ?? [];
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
  it('creates an app from flags without prompting', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'site');
    const { prompter, transcript } = createScriptedPrompter(() => 'cancel');

    fixtures.push(fixture);

    await expect(
      runCreate({
        directory: destination,
        version: '0.1.0',
        prompter,
        answers: { kind: 'app' },
        nonInteractive: { conflicts: 'keep' },
        installDependency: installTestDependency,
        formatProject: async () => undefined,
        verifyProject: async () => undefined,
        initializeGit: async () => undefined,
        checkGitIdentity: async () => true,
      }),
    ).resolves.toBe('complete');

    expect(existsSync(join(destination, 'src/index.ts'))).toBe(true);
    expect(await readProjectConfig(destination)).toMatchObject({
      project: { name: 'site', packageManager: 'pnpm' },
      formatter: 'prettier',
      targets: [{ path: '.', kind: 'app', template: 'node-app' }],
    });
    expect(transcript.some((line) => line.startsWith('? '))).toBe(false);
    expect(transcript.at(-1)).toContain('outro: Created site in');
  });

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

  it('adds libraries to an app monorepo as private packages in packages', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'site');
    const { prompter, transcript } = createScriptedPrompter(answerProject({ multiselect: ['monorepo'] }, [], ['utils', 'ui']));

    fixtures.push(fixture);

    await expect(runCreate({ directory: destination, version: '0.1.0', prompter, ...noopLifecycle })).resolves.toBe('complete');

    const detected = await detectWorkspace(destination, {}, 'pnpm');

    expect(JSON.parse(await readFile(join(destination, 'packages/utils/package.json'), 'utf8'))).toMatchObject({ name: 'site-utils', private: true });
    expect(existsSync(join(destination, 'packages/ui/src/index.ts'))).toBe(true);
    expect(detected.workspace?.packagePaths).toEqual(['apps/web', 'packages/ui', 'packages/utils']);
    expect((await readProjectConfig(destination))?.targets.map((target) => [target.path, target.kind, target.template])).toEqual([
      ['apps/web', 'app', 'node-app'],
      ['packages/utils', 'library', 'typescript-library'],
      ['packages/ui', 'library', 'typescript-library'],
    ]);
    expect(transcript).toContain('success: Added packages/utils (site-utils)');
    expect(transcript.find((line) => line.startsWith('note [Project layout]'))).toContain('packages/');
  });

  it('turns a library into a workspace of publishable libraries when packages are added', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'kit');
    // One answerer for the whole conversation keeps track of which package names are left to give.
    const respond = answerProject({}, [], ['', 'utils']);
    const { prompter } = createScriptedPrompter((question) => (question.message === 'What kind of project are you creating?' ? 'library' : respond(question)));

    fixtures.push(fixture);

    await expect(runCreate({ directory: destination, version: '0.1.0', prompter, ...noopLifecycle })).resolves.toBe('complete');

    const detected = await detectWorkspace(destination, {}, 'pnpm');
    const core = JSON.parse(await readFile(join(destination, 'packages/core/package.json'), 'utf8')) as Record<string, unknown>;

    expect(core).toMatchObject({ name: '@kit/core', files: ['dist'] });
    expect(core).not.toHaveProperty('private');
    expect(JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'))).toMatchObject({ name: 'kit', private: true });
    expect(existsSync(join(destination, 'src'))).toBe(false);
    expect(existsSync(join(destination, 'apps'))).toBe(false);
    expect(detected.workspace).toMatchObject({ patterns: ['packages/*'], packagePaths: ['packages/core', 'packages/utils'] });
    expect(await readProjectConfig(destination)).toMatchObject({
      project: { name: 'kit' },
      targets: [
        { path: 'packages/core', kind: 'library', template: 'typescript-library' },
        { path: 'packages/utils', kind: 'library', template: 'typescript-library' },
      ],
    });
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

  it('creates a project in a non-empty destination and keeps the files that are already there', async () => {
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
    ).resolves.toBe('complete');
    expect(transcript.some((line) => line.startsWith('error:'))).toBe(false);
    expect(await readFile(join(destination, 'keep.txt'), 'utf8')).toBe('mine');
    expect(existsSync(join(destination, 'package.json'))).toBe(true);
  });

  it('asks before replacing a conflicting file in the destination', async () => {
    const fixture = await createFixture({ 'site/package.json': '{"name":"mine"}\n' });
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
    ).resolves.toBe('complete');
    expect(transcript.find((line) => line.startsWith('note [Planned project]'))).toContain('existing file in the destination differ');
    expect(transcript.find((line) => line.startsWith('note [Project layout]'))).toContain('package.json [conflict]');
    // The dependency installer rewrites package.json, so the kept file is checked by content rather than bytes.
    expect(JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'))).toMatchObject({ name: 'mine' });
  });

  it('does not initialize Git when the destination is already a repository', async () => {
    const fixture = await createFixture({ 'site/.git/HEAD': 'ref: refs/heads/main\n' });
    const destination = join(fixture.root, 'site');
    const { prompter, transcript } = createScriptedPrompter(answerProject({ text: 'site' }));
    const initialized: string[] = [];

    fixtures.push(fixture);

    await expect(
      runCreate({
        directory: destination,
        version: '0.1.0',
        prompter,
        installDependency: installTestDependency,
        formatProject: async () => undefined,
        verifyProject: async () => undefined,
        initializeGit: async (directory) => void initialized.push(directory),
        checkGitIdentity: async () => true,
      }),
    ).resolves.toBe('complete');
    expect(initialized).toEqual([]);
    expect(transcript.some((line) => line.startsWith('warn: The destination is already a Git repository'))).toBe(true);
  });
});
