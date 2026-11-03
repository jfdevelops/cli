import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProjectConfig } from '../../config/read.js';
import { createFixture, type FixtureFiles } from '../../testing/fixture.js';
import { createScriptedPrompter, type Question, type Respond } from '../../testing/prompter.js';
import { createSkillPackage } from '../../testing/skill-package.js';
import { runInit, type InitOptions } from './run.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

function createProjectFiles(extra: FixtureFiles = {}): FixtureFiles {

  return {
    'package.json': { name: 'shop', private: true, packageManager: 'pnpm@10.28.1', dependencies: { next: '15.0.0', '@acme/forms': '1.0.0' } },
    'CLAUDE.md': '# Claude\n\nProject notes.\n',
    ...createSkillPackage('node_modules/@acme/forms', { name: '@acme/forms', version: '1.0.0', skills: ['build-forms', 'validate-forms'] }),
    ...extra,
  };
}

async function createProject(files: FixtureFiles) {
  const fixture = await createFixture(files);

  fixtures.push(fixture);

  return fixture.root;
}

// Accepts defaults, selecting the given skill names, unless a handler overrides the question.
function answer(skills: string[], overrides: (question: Question) => ReturnType<Respond> | undefined = () => undefined): Respond {

  return (question) => {
    const override = overrides(question);

    if (override !== undefined) {

      return override;
    }

    if (question.kind === 'multiselect') {

      return question.choices.filter((choice) => skills.includes(choice.label)).map((choice) => choice.value);
    }

    if (question.kind === 'confirm') {

      return true;
    }

    return question.initialValue ?? question.choices[0]?.value ?? '';
  };
}

async function readText(projectRoot: string, path: string) {

  return readFile(join(projectRoot, path), 'utf8');
}

async function installTestDependency({ directory, packageName, version }: Parameters<NonNullable<InitOptions['installDependency']>>[0]) {
  const path = join(directory, 'package.json');
  const manifest = JSON.parse(await readFile(path, 'utf8')) as { devDependencies?: Record<string, string> };

  manifest.devDependencies = { ...manifest.devDependencies, [packageName]: version };
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function runTestInit(options: Omit<InitOptions, 'installDependency'>) {

  return runInit({ ...options, installDependency: installTestDependency });
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('runInit', () => {
  it('installs selected skills, links them from instructions, and records the setup', async () => {
    const projectRoot = await createProject(createProjectFiles());
    const { prompter, transcript } = createScriptedPrompter(answer(['build-forms']));

    await expect(runTestInit({ directory: projectRoot, version: '0.1.0', prompter })).resolves.toBe('complete');

    for (const directory of ['.agents/skills', '.claude/skills', '.cursor/skills', '.github/skills']) {
      expect(existsSync(join(projectRoot, directory, 'build-forms/SKILL.md'))).toBe(true);
      expect(existsSync(join(projectRoot, directory, 'validate-forms'))).toBe(false);
    }

    expect(await readText(projectRoot, 'AGENTS.md')).toContain('- [build-forms](.agents/skills/build-forms/SKILL.md): Use build-forms');
    expect(await readText(projectRoot, 'CLAUDE.md')).toMatch(/^# Claude\n\nProject notes\.\n\n<!-- jfdevelops:start -->\nRead AGENTS\.md/);

    const config = await readProjectConfig(projectRoot);

    expect(config).toMatchObject({
      generator: { package: '@jfdevelops/cli', version: '0.1.0' },
      project: { name: 'shop', packageManager: 'pnpm' },
      targets: [{ path: '.', kind: 'app', options: {} }],
      skills: [
        { name: 'build-forms', required: false, source: { package: '@acme/forms', version: '1.0.0', path: './skills/build-forms' } },
        { name: 'jf-coding-conventions', required: true, source: { package: '@jfdevelops/skills', version: '0.1.0' } },
        { name: 'jf-git', required: true, source: { package: '@jfdevelops/skills', version: '0.1.0' } },
        { name: 'jf-naming-conventions', required: true, source: { package: '@jfdevelops/skills', version: '0.1.0' } },
      ],
    });
    expect(config?.managedFiles.filter((file) => file.owner.type === 'skill' && file.owner.name === 'build-forms').map((file) => file.path)).toEqual([
      '.agents/skills/build-forms/SKILL.md',
      '.claude/skills/build-forms/SKILL.md',
      '.cursor/skills/build-forms/SKILL.md',
      '.github/skills/build-forms/SKILL.md',
    ]);
    expect(JSON.parse(await readText(projectRoot, 'package.json'))).toMatchObject({ devDependencies: { '@jfdevelops/cli': '0.1.0' } });
    expect(transcript).toContain('outro: Project initialized.');

    const repeat = createScriptedPrompter(answer(['build-forms']));

    await expect(runTestInit({ directory: projectRoot, version: '0.1.0', prompter: repeat.prompter })).resolves.toBe('unchanged');
    expect(repeat.transcript).not.toContain('? Apply these changes?');
  });

  it('removes deselected skills and their instruction links on a later run', async () => {
    const projectRoot = await createProject(createProjectFiles());

    await runTestInit({ directory: projectRoot, version: '0.1.0', prompter: createScriptedPrompter(answer(['build-forms', 'validate-forms'])).prompter });
    await expect(
      runTestInit({ directory: projectRoot, version: '0.1.0', prompter: createScriptedPrompter(answer(['validate-forms'])).prompter }),
    ).resolves.toBe('complete');

    expect(existsSync(join(projectRoot, '.agents/skills/build-forms'))).toBe(false);
    expect(await readText(projectRoot, 'AGENTS.md')).not.toContain('build-forms');
    expect((await readProjectConfig(projectRoot))?.skills.map((skill) => skill.name)).toEqual([
      'jf-coding-conventions',
      'jf-git',
      'jf-naming-conventions',
      'validate-forms',
    ]);
  });

  it('writes nothing when cancelled or declined', async () => {
    const projectRoot = await createProject(createProjectFiles());
    const cancelled = createScriptedPrompter(answer([], (question) => (question.kind === 'multiselect' ? 'cancel' : undefined)));
    const declined = createScriptedPrompter(answer(['build-forms'], (question) => (question.kind === 'confirm' && question.message === 'Apply these changes?' ? false : undefined)));

    await expect(runTestInit({ directory: projectRoot, version: '0.1.0', prompter: cancelled.prompter })).resolves.toBe('cancelled');
    await expect(runTestInit({ directory: projectRoot, version: '0.1.0', prompter: declined.prompter })).resolves.toBe('cancelled');
    expect(declined.transcript).toContain('cancel: Init cancelled. No files were changed.');
    expect(existsSync(join(projectRoot, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(projectRoot, 'jfdevelops.json'))).toBe(false);
  });

  it('asks how to handle existing files and keeps them when chosen', async () => {
    const projectRoot = await createProject(createProjectFiles({ '.claude/skills/build-forms/SKILL.md': 'my own version\n' }));
    const { prompter, transcript } = createScriptedPrompter(answer(['build-forms']));

    await expect(runTestInit({ directory: projectRoot, version: '0.1.0', prompter })).resolves.toBe('complete');

    expect(transcript).toContain('? How should .claude/skills/build-forms/SKILL.md be handled?');
    expect(transcript.find((line) => line.startsWith('note [.claude/skills/build-forms/SKILL.md already exists'))).toContain('-my own version');
    expect(await readText(projectRoot, '.claude/skills/build-forms/SKILL.md')).toBe('my own version\n');
    expect((await readProjectConfig(projectRoot))?.managedFiles.map((file) => file.path)).not.toContain('.claude/skills/build-forms/SKILL.md');
  });

  it('asks for the type of ambiguous targets and a missing package manager', async () => {
    const projectRoot = await createProject({
      'package.json': { name: 'tools', private: true, dependencies: { '@acme/forms': '1.0.0' } },
      ...createSkillPackage('node_modules/@acme/forms', { name: '@acme/forms', version: '1.0.0', skills: ['build-forms'] }),
    });
    const { prompter, transcript } = createScriptedPrompter(
      answer([], (question) => {
        if (question.message === 'Which package manager does this project use?') {

          return 'npm';
        }

        return question.message === 'Is tools an app or a library?' ? 'library' : undefined;
      }),
    );

    await expect(runTestInit({ directory: projectRoot, version: '0.1.0', prompter })).resolves.toBe('complete');
    expect(transcript).not.toContain('? Use these target types?');
    expect(await readProjectConfig(projectRoot)).toMatchObject({
      project: { packageManager: 'npm' },
      targets: [{ path: '.', kind: 'library' }],
      skills: [
        { name: 'jf-coding-conventions', required: true },
        { name: 'jf-git', required: true },
        { name: 'jf-naming-conventions', required: true },
      ],
    });
  });

  it('offers detected integrations independently and records only confirmed choices', async () => {
    const projectRoot = await createProject(
      createProjectFiles({
        'package.json': {
          name: 'shop',
          private: true,
          packageManager: 'pnpm@10.28.1',
          dependencies: { next: '15.0.0', convex: '1.0.0', '@tanstack/react-query': '5.0.0', '@acme/forms': '1.0.0' },
          devDependencies: { portless: '1.0.0' },
        },
      }),
    );
    const { prompter, transcript } = createScriptedPrompter(answer(['convex', '@tanstack/react-query']));

    await expect(runTestInit({ directory: projectRoot, version: '0.1.0', prompter })).resolves.toBe('complete');

    expect(transcript).toContain('? Which detected integrations should this project adopt?');
    expect((await readProjectConfig(projectRoot))?.addons).toEqual([
      { name: '@tanstack/react-query', options: {} },
      { name: 'convex', options: {} },
    ]);
  });

  it('removes the skills of an integration that is deselected later', async () => {
    const projectRoot = await createProject(
      createProjectFiles({
        'package.json': { name: 'shop', private: true, packageManager: 'pnpm@10.28.1', devDependencies: { portless: '1.0.0' } },
        ...createSkillPackage('node_modules/portless', { name: 'portless', version: '1.0.0', skills: ['portless-dev'] }),
      }),
    );

    await expect(runTestInit({ directory: projectRoot, version: '0.1.0', prompter: createScriptedPrompter(answer(['portless', 'portless-dev'])).prompter })).resolves.toBe(
      'complete',
    );
    expect(existsSync(join(projectRoot, '.agents/skills/portless-dev/SKILL.md'))).toBe(true);

    const { prompter, transcript } = createScriptedPrompter(answer([]));

    await expect(runTestInit({ directory: projectRoot, version: '0.1.0', prompter })).resolves.toBe('complete');
    expect(transcript.some((line) => line.includes('portless-dev is enabled but'))).toBe(false);
    expect(existsSync(join(projectRoot, '.agents/skills/portless-dev'))).toBe(false);
    expect(await readProjectConfig(projectRoot)).toMatchObject({ addons: [] });
    expect((await readProjectConfig(projectRoot))?.skills.map((skill) => skill.name)).not.toContain('portless-dev');
  });

  it('installs the CLI at a pnpm workspace root with --workspace-root', async () => {
    const projectRoot = await createProject(
      createProjectFiles({
        'package.json': { name: 'monorepo', private: true, packageManager: 'pnpm@10.28.1' },
        'pnpm-workspace.yaml': 'packages:\n  - apps/*\n  - packages/*\n',
        'packages/ui/package.json': { name: '@acme/ui', version: '1.0.0', exports: './index.js' },
      }),
    );
    const installs: unknown[] = [];
    const { prompter, transcript } = createScriptedPrompter(answer([]));

    await runInit({ directory: projectRoot, version: '0.1.0', prompter, installDependency: async (options) => void installs.push(options) });

    expect(installs).toEqual([expect.objectContaining({ packageManager: 'pnpm', isWorkspaceRoot: true })]);
    expect(transcript.find((line) => line.startsWith('note [Planned changes]'))).toContain(
      'Install development dependency: pnpm add --save-dev --save-exact --workspace-root @jfdevelops/cli@0.1.0',
    );
  });

  it('reports an incomplete result when the CLI development dependency cannot be installed', async () => {
    const projectRoot = await createProject(createProjectFiles());
    const { prompter, transcript } = createScriptedPrompter(answer([]));
    const installDependency = async () => {
      throw new Error('registry unavailable');
    };

    await expect(runInit({ directory: projectRoot, version: '0.1.0', prompter, installDependency })).resolves.toBe('incomplete');

    expect(transcript).toContain('error: Could not install @jfdevelops/cli: registry unavailable');
    expect(transcript).toContain('outro: Init finished with errors. Run it again to retry the failed files.');
    expect(existsSync(join(projectRoot, 'jfdevelops.json'))).toBe(true);
  });

  it('reports detection errors without writing', async () => {
    const projectRoot = await createProject({ 'README.md': '# Empty\n' });
    const { prompter, transcript } = createScriptedPrompter(answer([]));

    await expect(runTestInit({ directory: projectRoot, version: '0.1.0', prompter })).resolves.toBe('failed');
    expect(transcript).toContain('cancel: Init failed.');
    expect(transcript.some((line) => line.startsWith('error: No package.json found'))).toBe(true);
  });

  it('keeps enabled skills whose source package is no longer installed', async () => {
    const projectRoot = await createProject(createProjectFiles());

    await runTestInit({ directory: projectRoot, version: '0.1.0', prompter: createScriptedPrompter(answer(['build-forms'])).prompter });
    await writeFile(join(projectRoot, 'package.json'), JSON.stringify({ name: 'shop', private: true, packageManager: 'pnpm@10.28.1' }));

    const { prompter, transcript } = createScriptedPrompter(answer([]));

    await expect(runTestInit({ directory: projectRoot, version: '0.1.0', prompter })).resolves.not.toBe('failed');
    expect(transcript).toContain('warn: build-forms is enabled but @acme/forms is not installed; its files are left as they are.');
    expect(existsSync(join(projectRoot, '.agents/skills/build-forms/SKILL.md'))).toBe(true);
    expect(await readText(projectRoot, 'AGENTS.md')).toContain('- [build-forms](.agents/skills/build-forms/SKILL.md): @acme/forms is not installed');
    expect((await readProjectConfig(projectRoot))?.skills.map((skill) => skill.name)).toEqual([
      'build-forms',
      'jf-coding-conventions',
      'jf-git',
      'jf-naming-conventions',
    ]);
  });
});
