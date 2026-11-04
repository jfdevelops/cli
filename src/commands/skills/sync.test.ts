import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProjectConfig } from '../../config/read.js';
import { createFixture, type FixtureFiles } from '../../testing/fixture.js';
import { createScriptedPrompter, type Question, type Respond } from '../../testing/prompter.js';
import { createSkillDocument, createSkillPackage } from '../../testing/skill-package.js';
import { runInit } from '../init/run.js';
import { runSkillsStatus } from './status.js';
import { runSkillsSync } from './sync.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];
const formsPackage = 'node_modules/@acme/forms';

// Accepts defaults and confirms, unless a handler overrides the question.
function answer(overrides: (question: Question) => ReturnType<Respond> | undefined = () => undefined): Respond {

  return (question) => {
    const override = overrides(question);

    if (override !== undefined) {

      return override;
    }

    if (question.kind === 'multiselect') {

      return question.initialValues ?? [];
    }

    if (question.kind === 'confirm') {

      return true;
    }

    if (question.kind === 'text') {

      return question.defaultValue ?? '';
    }

    return question.initialValue ?? question.choices[0]?.value ?? '';
  };
}

async function createInitializedProject(extra: FixtureFiles = {}) {
  const fixture = await createFixture({
    'package.json': { name: 'shop', private: true, packageManager: 'pnpm@10.28.1', dependencies: { next: '15.0.0', '@acme/forms': '1.0.0' } },
    ...createSkillPackage(formsPackage, { name: '@acme/forms', version: '1.0.0', skills: ['build-forms'] }),
    ...extra,
  });
  const { prompter } = createScriptedPrompter(
    answer((question) => (question.kind === 'multiselect' && question.message === 'Select skills to install' ? question.choices.map((choice) => choice.value) : undefined)),
  );

  fixtures.push(fixture);

  const status = await runInit({ directory: fixture.root, version: '0.1.0', prompter, installDependency: async () => undefined });

  expect(status).toBe('complete');

  return fixture.root;
}

async function upgradeForms(projectRoot: string, content = createSkillDocument('build-forms', 'Use build-forms v2')) {
  await writeFile(join(projectRoot, formsPackage, 'package.json'), JSON.stringify({
    name: '@acme/forms',
    version: '2.0.0',
    jfdevelops: { skills: [{ name: 'build-forms', path: './skills/build-forms' }] },
  }));
  await writeFile(join(projectRoot, formsPackage, 'skills/build-forms/SKILL.md'), content);
}

async function readText(projectRoot: string, path: string) {

  return readFile(join(projectRoot, path), 'utf8');
}

async function getStatus(projectRoot: string) {
  const { prompter, transcript } = createScriptedPrompter(answer());
  const status = await runSkillsStatus({ directory: projectRoot, prompter });

  return { status, transcript, table: transcript.find((line) => line.startsWith('note [Enabled skills]')) ?? '' };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('runSkillsStatus', () => {
  it('reports every enabled skill as current right after init', async () => {
    const projectRoot = await createInitializedProject();
    const { status, table, transcript } = await getStatus(projectRoot);

    expect(status).toBe('in-sync');
    expect(table).toMatch(/build-forms\s+current\s+@acme\/forms@1\.0\.0/);
    expect(table).toMatch(/jf-git\s+current\s+@jfdevelops\/skills@/);
    expect(transcript.at(-1)).toBe('outro: All skills are in sync.');
  });

  it('reports upgraded packages, edited copies, and removed sources', async () => {
    const projectRoot = await createInitializedProject();

    await upgradeForms(projectRoot);
    await writeFile(join(projectRoot, '.claude/skills/jf-git/SKILL.md'), 'my edits\n');

    const upgraded = await getStatus(projectRoot);

    expect(upgraded.status).toBe('out-of-sync');
    expect(upgraded.table).toMatch(/build-forms\s+outdated\s+@acme\/forms@2\.0\.0 · 1\.0\.0 → 2\.0\.0, 4 outdated files/);
    expect(upgraded.table).toMatch(/jf-git\s+modified\s+.* · 1 locally edited file/);

    await rm(join(projectRoot, formsPackage), { recursive: true });

    expect((await getStatus(projectRoot)).table).toMatch(/build-forms\s+missing-source\s+@acme\/forms@1\.0\.0 · @acme\/forms is not installed/);
  });

  it('fails clearly without a configuration', async () => {
    const fixture = await createFixture({ 'package.json': { name: 'bare' } });
    const { prompter, transcript } = createScriptedPrompter(answer());

    fixtures.push(fixture);

    await expect(runSkillsStatus({ directory: fixture.root, prompter })).resolves.toBe('failed');
    expect(transcript).toContain('error: No jfdevelops.json found. Run jfdevelops init first.');
  });
});

describe('runSkillsSync', () => {
  it('updates unchanged copies to the installed version and records it', async () => {
    const projectRoot = await createInitializedProject();

    await upgradeForms(projectRoot);

    const { prompter } = createScriptedPrompter(answer());

    await expect(runSkillsSync({ directory: projectRoot, prompter })).resolves.toBe('complete');
    expect(await readText(projectRoot, '.cursor/skills/build-forms/SKILL.md')).toContain('Use build-forms v2');
    expect(await readText(projectRoot, 'AGENTS.md')).toContain('): Use build-forms v2');
    expect((await readProjectConfig(projectRoot))?.skills.find((skill) => skill.name === 'build-forms')?.source.version).toBe('2.0.0');
    expect((await getStatus(projectRoot)).status).toBe('in-sync');

    const repeat = createScriptedPrompter(answer());

    await expect(runSkillsSync({ directory: projectRoot, prompter: repeat.prompter })).resolves.toBe('unchanged');
  });

  it('asks before replacing locally edited copies', async () => {
    const projectRoot = await createInitializedProject();

    await upgradeForms(projectRoot);
    await writeFile(join(projectRoot, '.claude/skills/build-forms/SKILL.md'), 'my edits\n');

    const { prompter, transcript } = createScriptedPrompter(answer());

    await expect(runSkillsSync({ directory: projectRoot, prompter })).resolves.toBe('complete');
    expect(transcript).toContain('? How should .claude/skills/build-forms/SKILL.md be handled?');
    expect(await readText(projectRoot, '.claude/skills/build-forms/SKILL.md')).toBe('my edits\n');
    expect(await readText(projectRoot, '.agents/skills/build-forms/SKILL.md')).toContain('Use build-forms v2');
    expect((await getStatus(projectRoot)).table).toMatch(/build-forms\s+modified/);
  });

  it('removes skills whose source package is gone when chosen', async () => {
    const projectRoot = await createInitializedProject();

    await rm(join(projectRoot, formsPackage), { recursive: true });

    const { prompter, transcript } = createScriptedPrompter(answer());

    await expect(runSkillsSync({ directory: projectRoot, prompter })).resolves.toBe('complete');
    expect(transcript).toContain('? These skills come from packages that are no longer installed. Which should be removed?');
    expect(existsSync(join(projectRoot, '.agents/skills/build-forms'))).toBe(false);
    expect(await readText(projectRoot, 'AGENTS.md')).not.toContain('build-forms');
    expect((await readProjectConfig(projectRoot))?.skills.map((skill) => skill.name)).not.toContain('build-forms');
  });

  it('keeps skills whose source package is gone when not chosen', async () => {
    const projectRoot = await createInitializedProject();

    await rm(join(projectRoot, formsPackage), { recursive: true });

    const { prompter } = createScriptedPrompter(answer((question) => (question.kind === 'multiselect' ? [] : undefined)));

    await expect(runSkillsSync({ directory: projectRoot, prompter })).resolves.toBe('complete');
    expect(existsSync(join(projectRoot, '.agents/skills/build-forms/SKILL.md'))).toBe(true);
    expect(await readText(projectRoot, 'AGENTS.md')).toContain('): @acme/forms is not installed');
    expect((await readProjectConfig(projectRoot))?.skills.map((skill) => skill.name)).toContain('build-forms');

    const repeat = createScriptedPrompter(answer((question) => (question.kind === 'multiselect' ? [] : undefined)));

    await expect(runSkillsSync({ directory: projectRoot, prompter: repeat.prompter })).resolves.toBe('unchanged');
  });

  it('asks which version to use when several are installed', async () => {
    const fixture = await createFixture({
      'package.json': { name: 'monorepo', private: true, packageManager: 'pnpm@10.28.1', dependencies: { '@acme/forms': '1.0.0' } },
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'packages/ui/package.json': { name: '@acme/ui', version: '0.0.0', exports: './src/index.ts', dependencies: { '@acme/forms': '2.0.0' } },
      ...createSkillPackage(formsPackage, { name: '@acme/forms', version: '1.0.0', skills: ['build-forms'] }),
    });
    const init = createScriptedPrompter(
      answer((question) => (question.kind === 'multiselect' && question.message === 'Select skills to install' ? question.choices.map((choice) => choice.value) : undefined)),
    );

    fixtures.push(fixture);
    await runInit({ directory: fixture.root, version: '0.1.0', prompter: init.prompter, installDependency: async () => undefined });
    await mkdir(join(fixture.root, 'packages/ui', formsPackage, 'skills/build-forms'), { recursive: true });
    await upgradeForms(join(fixture.root, 'packages/ui'));

    expect((await getStatus(fixture.root)).table).toMatch(/build-forms\s+ambiguous\s+.*more than one installed version \(1\.0\.0, 2\.0\.0\); run jfdevelops skills sync to choose/);

    const { prompter, transcript } = createScriptedPrompter(answer((question) => (question.kind === 'select' && question.message.startsWith('build-forms is installed') ? '2.0.0' : undefined)));

    await expect(runSkillsSync({ directory: fixture.root, prompter })).resolves.toBe('complete');
    expect(transcript).toContain('? build-forms is installed in more than one version. Which should be used?');
    expect(await readText(fixture.root, '.agents/skills/build-forms/SKILL.md')).toContain('Use build-forms v2');
    expect((await readProjectConfig(fixture.root))?.skills.find((skill) => skill.name === 'build-forms')?.source.version).toBe('2.0.0');
  });

  it('writes nothing when declined', async () => {
    const projectRoot = await createInitializedProject();
    const before = await readText(projectRoot, 'jfdevelops.json');

    await upgradeForms(projectRoot);

    const { prompter, transcript } = createScriptedPrompter(answer((question) => (question.kind === 'confirm' ? false : undefined)));

    await expect(runSkillsSync({ directory: projectRoot, prompter })).resolves.toBe('cancelled');
    expect(transcript.at(-1)).toBe('cancel: Sync cancelled. No files were changed.');
    expect(await readText(projectRoot, 'jfdevelops.json')).toBe(before);
    expect(await readText(projectRoot, '.agents/skills/build-forms/SKILL.md')).not.toContain('v2');
  });
});
