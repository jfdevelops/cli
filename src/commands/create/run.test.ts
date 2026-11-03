import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProjectConfig } from '../../config/read.js';
import { hashContent } from '../../plan/hash.js';
import { createFixture } from '../../testing/fixture.js';
import { createScriptedPrompter, type Question } from '../../testing/prompter.js';
import { runCreate, type CreateOptions } from './run.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

function answerProject(overrides: Partial<Record<Question['kind'], string | boolean>> = {}) {

  return (question: Question) => {
    const override = overrides[question.kind];

    if (override !== undefined) {

      return override;
    }

    if (question.kind === 'text') {

      return question.initialValue ?? 'my-project';
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
