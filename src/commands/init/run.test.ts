import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProjectConfig } from '../../config/read.js';
import { createFixture, type FixtureFiles } from '../../testing/fixture.js';
import { createScriptedPrompter, type Question, type Respond } from '../../testing/prompter.js';
import { createSkillPackage } from '../../testing/skill-package.js';
import { runInit } from './run.js';

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

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('runInit', () => {
  it('installs selected skills, links them from instructions, and records the setup', async () => {
    const projectRoot = await createProject(createProjectFiles());
    const { prompter, transcript } = createScriptedPrompter(answer(['build-forms']));

    await expect(runInit({ directory: projectRoot, version: '0.1.0', prompter })).resolves.toBe('complete');

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
      skills: [{ name: 'build-forms', required: false, source: { package: '@acme/forms', version: '1.0.0', path: './skills/build-forms' } }],
    });
    expect(config?.managedFiles.map((file) => file.path)).toEqual([
      '.agents/skills/build-forms/SKILL.md',
      '.claude/skills/build-forms/SKILL.md',
      '.cursor/skills/build-forms/SKILL.md',
      '.github/skills/build-forms/SKILL.md',
    ]);
    expect(transcript).toContain('outro: Project initialized.');

    const repeat = createScriptedPrompter(answer(['build-forms']));

    await expect(runInit({ directory: projectRoot, version: '0.1.0', prompter: repeat.prompter })).resolves.toBe('unchanged');
    expect(repeat.transcript).not.toContain('? Apply these changes?');
  });

  it('removes deselected skills and their instruction links on a later run', async () => {
    const projectRoot = await createProject(createProjectFiles());

    await runInit({ directory: projectRoot, version: '0.1.0', prompter: createScriptedPrompter(answer(['build-forms', 'validate-forms'])).prompter });
    await expect(
      runInit({ directory: projectRoot, version: '0.1.0', prompter: createScriptedPrompter(answer(['validate-forms'])).prompter }),
    ).resolves.toBe('complete');

    expect(existsSync(join(projectRoot, '.agents/skills/build-forms'))).toBe(false);
    expect(await readText(projectRoot, 'AGENTS.md')).not.toContain('build-forms');
    expect((await readProjectConfig(projectRoot))?.skills.map((skill) => skill.name)).toEqual(['validate-forms']);
  });

  it('writes nothing when cancelled or declined', async () => {
    const projectRoot = await createProject(createProjectFiles());
    const cancelled = createScriptedPrompter(answer([], (question) => (question.kind === 'multiselect' ? 'cancel' : undefined)));
    const declined = createScriptedPrompter(answer(['build-forms'], (question) => (question.kind === 'confirm' && question.message === 'Apply these changes?' ? false : undefined)));

    await expect(runInit({ directory: projectRoot, version: '0.1.0', prompter: cancelled.prompter })).resolves.toBe('cancelled');
    await expect(runInit({ directory: projectRoot, version: '0.1.0', prompter: declined.prompter })).resolves.toBe('cancelled');
    expect(declined.transcript).toContain('cancel: Init cancelled. No files were changed.');
    expect(existsSync(join(projectRoot, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(projectRoot, 'jfdevelops.json'))).toBe(false);
  });

  it('asks how to handle existing files and keeps them when chosen', async () => {
    const projectRoot = await createProject(createProjectFiles({ '.claude/skills/build-forms/SKILL.md': 'my own version\n' }));
    const { prompter, transcript } = createScriptedPrompter(answer(['build-forms']));

    await expect(runInit({ directory: projectRoot, version: '0.1.0', prompter })).resolves.toBe('complete');

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

    await expect(runInit({ directory: projectRoot, version: '0.1.0', prompter })).resolves.toBe('complete');
    expect(transcript).not.toContain('? Use these target types?');
    expect(await readProjectConfig(projectRoot)).toMatchObject({ project: { packageManager: 'npm' }, targets: [{ path: '.', kind: 'library' }], skills: [] });
  });

  it('reports detection errors without writing', async () => {
    const projectRoot = await createProject({ 'README.md': '# Empty\n' });
    const { prompter, transcript } = createScriptedPrompter(answer([]));

    await expect(runInit({ directory: projectRoot, version: '0.1.0', prompter })).resolves.toBe('failed');
    expect(transcript).toContain('cancel: Init failed.');
    expect(transcript.some((line) => line.startsWith('error: No package.json found'))).toBe(true);
  });

  it('keeps enabled skills whose source package is no longer installed', async () => {
    const projectRoot = await createProject(createProjectFiles());

    await runInit({ directory: projectRoot, version: '0.1.0', prompter: createScriptedPrompter(answer(['build-forms'])).prompter });
    await writeFile(join(projectRoot, 'package.json'), JSON.stringify({ name: 'shop', private: true, packageManager: 'pnpm@10.28.1' }));

    const { prompter, transcript } = createScriptedPrompter(answer([]));

    await expect(runInit({ directory: projectRoot, version: '0.1.0', prompter })).resolves.not.toBe('failed');
    expect(transcript).toContain('warn: build-forms is enabled but @acme/forms is not installed; its files are left as they are.');
    expect(existsSync(join(projectRoot, '.agents/skills/build-forms/SKILL.md'))).toBe(true);
    expect(await readText(projectRoot, 'AGENTS.md')).toContain('- [build-forms](.agents/skills/build-forms/SKILL.md): @acme/forms is not installed');
    expect((await readProjectConfig(projectRoot))?.skills.map((skill) => skill.name)).toEqual(['build-forms']);
  });
});
