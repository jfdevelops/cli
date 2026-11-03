import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { glob } from 'tinyglobby';
import { afterEach, describe, expect, it } from 'vitest';
import { listPackedFiles } from '../../authoring/packed-files.js';
import { hashContent } from '../../plan/hash.js';
import { runCommand } from '../../process/run.js';
import { buildSkillCatalog } from '../../skills/catalog.js';
import { parseSkillFrontmatter } from '../../skills/frontmatter.js';
import { createFixture, type FixtureFiles } from '../../testing/fixture.js';
import { createScriptedPrompter, type Question, type Respond } from '../../testing/prompter.js';
import { createSkillDocument } from '../../testing/skill-package.js';
import { runCreateSkills, type CreateSkillsOptions } from './skills.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

// Approximates npm's packing: the `files` entries (or everything) plus package.json, never node_modules.
async function listFilesFromManifest(packageDirectory: string) {
  const manifest = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8')) as { files?: string[] };
  const patterns = manifest.files ? manifest.files.flatMap((entry) => [entry, `${entry}/**`]) : ['**'];

  return [...new Set([...(await glob(patterns, { cwd: packageDirectory, ignore: ['node_modules/**'] })), 'package.json'])];
}

// Accepts defaults and applies changes but scaffolds nothing, unless a handler overrides the question.
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

      return question.message === 'Apply these changes?';
    }

    if (question.kind === 'text') {

      return question.initialValue ?? '';
    }

    return question.initialValue ?? question.choices[0]?.value ?? '';
  };
}

function scaffoldAnswers(name: string, description: string, overrides: (question: Question) => ReturnType<Respond> | undefined = () => undefined) {

  return answer((question) => {
    const override = overrides(question);

    if (override !== undefined) {

      return override;
    }

    if (question.message === 'Scaffold a new skill?') {

      return true;
    }

    if (question.message === 'Skill name') {

      return name;
    }

    return question.message.startsWith('Describe when') ? description : undefined;
  });
}

function createLibraryFiles(extra: FixtureFiles = {}): FixtureFiles {

  return {
    'package.json': { name: '@acme/forms', version: '1.0.0', type: 'module', files: ['dist'], exports: './dist/index.js' },
    'dist/index.js': 'export {};\n',
    'skills/build-forms/SKILL.md': createSkillDocument('build-forms'),
    'skills/build-forms/references/fields.md': '# Fields\n',
    ...extra,
  };
}

async function createProject(files: FixtureFiles) {
  const fixture = await createFixture(files);

  fixtures.push(fixture);

  return fixture.root;
}

async function author(directory: string, respond: Respond, options: Partial<CreateSkillsOptions> = {}) {
  const { prompter, transcript } = createScriptedPrompter(respond);
  const status = await runCreateSkills({ directory, prompter, listPackedFiles: listFilesFromManifest, ...options });

  return { status, transcript };
}

async function readManifest(directory: string) {

  return JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as { files?: string[]; jfdevelops?: { skills: Array<{ name: string; path: string }> } };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('runCreateSkills', () => {
  it('registers existing skills and adds them to the published files', async () => {
    const root = await createProject(createLibraryFiles());
    const { status, transcript } = await author(root, answer());

    expect(status).toBe('complete');
    expect(transcript).toContain('? Register these existing skills?');
    expect(await readManifest(root)).toMatchObject({ files: ['dist', 'skills'], jfdevelops: { skills: [{ name: 'build-forms', path: './skills/build-forms' }] } });
    expect(await readFile(join(root, 'skills/build-forms/SKILL.md'), 'utf8')).toBe(createSkillDocument('build-forms'));
    expect(transcript.at(-1)).toBe('outro: @acme/forms publishes 1 skill: build-forms.');

    const repeat = await author(root, answer());

    expect(repeat.status).toBe('unchanged');
    expect(repeat.transcript).not.toContain('? Apply these changes?');
  });

  it('scaffolds and registers a new skill', async () => {
    const root = await createProject(createLibraryFiles());
    const description = 'Validate forms: rules and messages';
    const { status } = await author(root, scaffoldAnswers('validate-forms', description, (question) => (question.kind === 'multiselect' ? [] : undefined)));

    expect(status).toBe('complete');
    expect(parseSkillFrontmatter(await readFile(join(root, 'skills/validate-forms/SKILL.md'), 'utf8'))).toMatchObject({ name: 'validate-forms', description });
    expect((await readManifest(root)).jfdevelops?.skills.map((entry) => entry.name)).toEqual(['validate-forms']);
  });

  it('asks again for invalid or taken skill names', async () => {
    const root = await createProject(createLibraryFiles());
    const names = ['Not Valid', 'build-forms', 'good-name'];
    const { status, transcript } = await author(root, scaffoldAnswers('unused', 'Does things', (question) => (question.message === 'Skill name' ? names.shift() : undefined)));

    expect(status).toBe('complete');
    expect(transcript).toContain('warn: Use a lowercase kebab-case name of at most 64 characters.');
    expect(transcript).toContain('warn: build-forms is already used by an existing skill.');
    expect(existsSync(join(root, 'skills/good-name/SKILL.md'))).toBe(true);
  });

  it('registers or scaffolds an explicit path and rejects paths outside the package', async () => {
    const root = await createProject(createLibraryFiles());
    const registered = await author(root, answer(), { skillPath: 'skills/build-forms' });
    const scaffolded = await author(root, answer((question) => (question.kind === 'text' ? 'Sort tables' : undefined)), { skillPath: 'docs/sort-tables' });
    const outside = await author(root, answer(), { skillPath: '../elsewhere' });

    expect(registered.status).toBe('complete');
    expect(scaffolded.status).toBe('complete');
    expect((await readManifest(root)).jfdevelops?.skills.map((entry) => entry.path)).toEqual(['./skills/build-forms', './docs/sort-tables']);
    expect((await readManifest(root)).files).toEqual(['dist', 'skills', 'docs']);
    expect(outside.status).toBe('failed');
    expect(outside.transcript.some((line) => line.startsWith('error: ') && line.includes('is not inside the package.'))).toBe(true);
  });

  it('skips skills whose frontmatter does not match their directory', async () => {
    const root = await createProject(createLibraryFiles({ 'skills/renamed/SKILL.md': createSkillDocument('other-name') }));
    const { transcript } = await author(root, answer());

    expect(transcript).toContain('warn: ./skills/renamed/SKILL.md cannot be registered: frontmatter name other-name does not match directory renamed');
    expect((await readManifest(root)).jfdevelops?.skills.map((entry) => entry.name)).toEqual(['build-forms']);
  });

  it('reports names found in several directories instead of registering both', async () => {
    const root = await createProject(
      createLibraryFiles({
        'docs/build-forms/SKILL.md': createSkillDocument('build-forms'),
        'skills/validate-forms/SKILL.md': createSkillDocument('validate-forms'),
      }),
    );
    const { status, transcript } = await author(root, answer());

    expect(status).toBe('complete');
    expect(transcript).toContain('warn: build-forms appears in more than one directory (./docs/build-forms, ./skills/build-forms). Register one with --path.');
    expect((await readManifest(root)).jfdevelops?.skills).toEqual([{ name: 'validate-forms', path: './skills/validate-forms' }]);

    const explicit = await author(root, answer(), { skillPath: 'skills/build-forms' });
    const duplicate = await author(root, answer(), { skillPath: 'docs/build-forms' });

    expect(explicit.status).toBe('complete');
    expect(duplicate.transcript).toContain('error: build-forms is already registered at ./skills/build-forms.');
  });

  it('chooses the owning package in a workspace', async () => {
    const root = await createProject({
      'package.json': { name: 'monorepo', private: true },
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'packages/web/package.json': { name: 'web', private: true, dependencies: { next: '15.0.0' } },
      ...Object.fromEntries(Object.entries(createLibraryFiles()).map(([path, content]) => [`packages/forms/${path}`, content])),
      'packages/tables/package.json': { name: '@acme/tables', version: '1.0.0' },
    });
    const chosen = await author(root, answer((question) => (question.kind === 'select' ? 'packages/forms' : undefined)));
    const named = await author(root, scaffoldAnswers('sort-tables', 'Sort tables'), { packageName: '@acme/tables' });
    const app = await author(root, answer(), { packageName: 'missing' });

    expect(chosen.transcript).toContain('? Which package owns the skills?');
    expect((await readManifest(join(root, 'packages/forms'))).jfdevelops?.skills.map((entry) => entry.name)).toEqual(['build-forms']);
    expect(named.status).toBe('complete');
    expect(existsSync(join(root, 'packages/tables/skills/sort-tables/SKILL.md'))).toBe(true);
    expect(app.transcript).toContain(`error: No package named missing in ${root}.`);
  });

  it('resolves --path from the chosen package when run at the workspace root', async () => {
    const root = await createProject({
      'package.json': { name: 'monorepo', private: true },
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      ...Object.fromEntries(Object.entries(createLibraryFiles()).map(([path, content]) => [`packages/forms/${path}`, content])),
    });
    const relativeToPackage = await author(root, answer(), { packageName: '@acme/forms', skillPath: 'skills/build-forms' });
    const relativeToRoot = await author(root, answer((question) => (question.kind === 'text' ? 'Sort tables' : undefined)), {
      packageName: '@acme/forms',
      skillPath: 'packages/forms/docs/sort-tables',
    });

    expect(relativeToPackage.status).toBe('complete');
    expect(relativeToRoot.status).toBe('complete');
    expect((await readManifest(join(root, 'packages/forms'))).jfdevelops?.skills.map((entry) => entry.path)).toEqual(['./skills/build-forms', './docs/sort-tables']);
  });

  it('reports skills that the package would not publish', async () => {
    const root = await createProject(createLibraryFiles());
    const { status, transcript } = await author(root, answer(), { listPackedFiles: async () => ['package.json', 'dist/index.js', 'skills/build-forms/SKILL.md'] });

    expect(status).toBe('incomplete');
    expect(transcript).toContain('error: Not included in the published package: skills/build-forms/references/fields.md. Add their directory to the files field in package.json.');
  });

  it('ignores files that npm never publishes', async () => {
    const root = await createProject(createLibraryFiles({ 'skills/build-forms/.DS_Store': 'finder', 'skills/build-forms/references/._fields.md': 'resource fork' }));
    const packed = ['package.json', 'dist/index.js', 'skills/build-forms/SKILL.md', 'skills/build-forms/references/fields.md'];
    const { status, transcript } = await author(root, answer(), { listPackedFiles: async () => packed });

    expect(status).toBe('complete');
    expect(transcript.some((line) => line.includes('Not included in the published package'))).toBe(false);
  });

  it('writes nothing when declined', async () => {
    const root = await createProject(createLibraryFiles());
    const before = await readFile(join(root, 'package.json'), 'utf8');
    const { status } = await author(root, answer((question) => (question.message === 'Apply these changes?' ? false : undefined)));

    expect(status).toBe('cancelled');
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(before);
  });
});

describe('published skills', () => {
  it(
    'are discovered from an installed consumer dependency exactly as authored',
    async () => {
      const library = await createProject(createLibraryFiles());
      const consumer = await createProject({ 'package.json': { name: 'consumer', private: true } });
      const tarballs = await mkdtemp(join(tmpdir(), 'jfdevelops-tarball-'));

      fixtures.push({ remove: () => rm(tarballs, { recursive: true, force: true }) });

      expect((await author(library, answer(), { listPackedFiles })).status).toBe('complete');

      await runCommand('npm', ['pack', '--pack-destination', tarballs, '--ignore-scripts'], { cwd: library, captureOutput: true });

      const [tarball] = await readdir(tarballs);

      await runCommand('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', join(tarballs, tarball ?? '')], { cwd: consumer, captureOutput: true });

      const catalog = await buildSkillCatalog(consumer, ['.']);
      const [skill] = catalog.skills;

      expect(catalog.skills.map((entry) => `${entry.source.package}@${entry.source.version}:${entry.name}`)).toEqual(['@acme/forms@1.0.0:build-forms']);

      for (const file of ['SKILL.md', 'references/fields.md']) {
        const authored = await readFile(join(library, 'skills/build-forms', file));
        const installed = await readFile(join(skill?.directory ?? '', file));

        expect(hashContent(installed)).toBe(hashContent(authored));
      }

    },
    120_000,
  );
});
