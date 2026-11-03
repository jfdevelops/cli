import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProjectConfig } from '../../config/read.js';
import type { PackageInstaller } from '../../dependencies/install.js';
import { createFixture, type FixtureFiles } from '../../testing/fixture.js';
import { createScriptedPrompter, type Question, type Respond } from '../../testing/prompter.js';
import { createSkillDocument, createSkillPackage } from '../../testing/skill-package.js';
import { runInit } from '../init/run.js';
import { runSkillsStatus } from '../skills/status.js';
import { runAdd, runAddList } from './run.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

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

      return question.initialValue ?? '';
    }

    return question.initialValue ?? question.choices[0]?.value ?? '';
  };
}

// Creates a project and runs init, enabling only the listed optional skills.
async function createInitializedProject(files: FixtureFiles, enabledSkills: string[]) {
  const fixture = await createFixture(files);
  const { prompter } = createScriptedPrompter(
    answer((question) => {
      if (question.kind === 'multiselect' && question.message === 'Select skills to install') {

        return question.choices.filter((choice) => enabledSkills.includes(choice.label)).map((choice) => choice.value);
      }

      return question.kind === 'multiselect' ? [] : undefined;
    }),
  );

  fixtures.push(fixture);

  await expect(runInit({ directory: fixture.root, version: '0.1.0', prompter, installDependency: async () => undefined })).resolves.toBe('complete');

  return fixture.root;
}

function createAppFiles(extra: FixtureFiles = {}): FixtureFiles {

  return {
    'package.json': { name: 'shop', private: true, packageManager: 'pnpm@10.28.1', dependencies: { next: '15.0.0', '@acme/forms': '1.0.0' } },
    ...createSkillPackage('node_modules/@acme/forms', { name: '@acme/forms', version: '1.0.0', skills: ['build-forms', 'validate-forms'] }),
    ...extra,
  };
}

function createWorkspaceFiles(): FixtureFiles {

  return {
    'package.json': { name: 'monorepo', private: true, packageManager: 'pnpm@10.28.1' },
    'pnpm-workspace.yaml': '# Workspace packages\npackages:\n  - packages/*\n',
    'packages/ui/package.json': { name: '@acme/ui', version: '0.0.0', exports: './src/index.ts' },
  };
}

async function readText(projectRoot: string, path: string) {

  return readFile(join(projectRoot, path), 'utf8');
}

async function add(projectRoot: string, options: { kind?: 'skill' | 'addon' | 'package'; name?: string; installPackage?: PackageInstaller }, respond = answer()) {
  const { prompter, transcript } = createScriptedPrompter(respond);
  const status = await runAdd({ directory: projectRoot, prompter, ...options });

  return { status, transcript };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('runAddList', () => {
  it('lists skills, addons, and package availability without changing anything', async () => {
    const projectRoot = await createInitializedProject(createAppFiles(), ['build-forms']);
    const before = await readText(projectRoot, 'jfdevelops.json');
    const { prompter, transcript } = createScriptedPrompter(answer());

    await expect(runAddList({ directory: projectRoot, prompter })).resolves.toBe('complete');

    const listing = transcript.find((line) => line.startsWith('note [Available additions]')) ?? '';

    expect(listing).toContain('validate-forms · @acme/forms@1.0.0 · project root');
    expect(listing).not.toContain('build-forms');
    expect(listing).toContain('convex · Convex backend');
    expect(listing).toContain('Unavailable: this project has no workspace');
    expect(await readText(projectRoot, 'jfdevelops.json')).toBe(before);
  });
});

describe('add skill', () => {
  it('enables one skill and lists it in AGENTS.md', async () => {
    const projectRoot = await createInitializedProject(createAppFiles(), ['build-forms']);
    const { status, transcript } = await add(projectRoot, { kind: 'skill', name: 'validate-forms' });

    expect(status).toBe('complete');
    expect(transcript.at(-1)).toBe('outro: Enabled validate-forms.');
    expect(existsSync(join(projectRoot, '.claude/skills/validate-forms/SKILL.md'))).toBe(true);
    expect(await readText(projectRoot, 'AGENTS.md')).toMatch(/build-forms[\s\S]*validate-forms/);
    expect((await readProjectConfig(projectRoot))?.skills.map((skill) => skill.name)).toContain('validate-forms');

    const status2 = createScriptedPrompter(answer());

    await expect(runSkillsStatus({ directory: projectRoot, prompter: status2.prompter })).resolves.toBe('in-sync');
  });

  it('reports skills that are already enabled or unavailable', async () => {
    const projectRoot = await createInitializedProject(createAppFiles(), ['build-forms']);
    const enabled = await add(projectRoot, { kind: 'skill', name: 'build-forms' });
    const unknown = await add(projectRoot, { kind: 'skill', name: 'missing-skill' });

    expect(enabled.status).toBe('unchanged');
    expect(enabled.transcript.at(-1)).toBe('outro: build-forms is already enabled. Run jfdevelops skills sync to update it.');
    expect(unknown.status).toBe('failed');
    expect(unknown.transcript).toContain('error: No installed package provides a skill named missing-skill. Available: validate-forms.');
  });

  it('asks which source to use when several packages provide the skill', async () => {
    const projectRoot = await createInitializedProject(
      createAppFiles({
        'package.json': { name: 'shop', private: true, packageManager: 'pnpm@10.28.1', dependencies: { '@acme/forms': '1.0.0', '@other/forms': '3.0.0' } },
        ...createSkillPackage('node_modules/@other/forms', { name: '@other/forms', version: '3.0.0', skills: ['validate-forms'] }),
      }),
      [],
    );
    const { status, transcript } = await add(
      projectRoot,
      { kind: 'skill', name: 'validate-forms' },
      answer((question) => (question.kind === 'select' ? '@other/forms@3.0.0' : undefined)),
    );

    expect(status).toBe('complete');
    expect(transcript).toContain('? validate-forms is provided by more than one package or version. Which should be installed?');
    expect((await readProjectConfig(projectRoot))?.skills.find((skill) => skill.name === 'validate-forms')?.source.package).toBe('@other/forms');
  });

  it('writes nothing when declined', async () => {
    const projectRoot = await createInitializedProject(createAppFiles(), ['build-forms']);
    const before = await readText(projectRoot, 'jfdevelops.json');
    const { status, transcript } = await add(projectRoot, { kind: 'skill', name: 'validate-forms' }, answer((question) => (question.kind === 'confirm' ? false : undefined)));

    expect(status).toBe('cancelled');
    expect(transcript.at(-1)).toBe('cancel: Add cancelled. No project files were changed.');
    expect(await readText(projectRoot, 'jfdevelops.json')).toBe(before);
    expect(existsSync(join(projectRoot, '.agents/skills/validate-forms'))).toBe(false);
  });
});

describe('add addon', () => {
  // Stands in for the package manager: installs a package that ships one skill.
  const installConvex: PackageInstaller = async ({ directory, packageName, isDevelopment }) => {
    const manifestPath = join(directory, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, Record<string, string>>;
    const field = isDevelopment ? 'devDependencies' : 'dependencies';

    manifest[field] = { ...manifest[field], [packageName]: '1.20.0' };
    await writeFile(manifestPath, JSON.stringify(manifest));
    await mkdir(join(directory, 'node_modules', packageName, 'skills/convex-functions'), { recursive: true });
    await writeFile(
      join(directory, 'node_modules', packageName, 'package.json'),
      JSON.stringify({ name: packageName, version: '1.20.0', jfdevelops: { skills: [{ name: 'convex-functions', path: './skills/convex-functions' }] } }),
    );
    await writeFile(join(directory, 'node_modules', packageName, 'skills/convex-functions/SKILL.md'), createSkillDocument('convex-functions'));
  };

  it('installs a missing addon after confirmation and offers its skills', async () => {
    const projectRoot = await createInitializedProject(createAppFiles(), ['build-forms']);
    const { status, transcript } = await add(projectRoot, { kind: 'addon', name: 'convex', installPackage: installConvex });

    expect(status).toBe('complete');
    expect(transcript).toContain('? Install convex in the project root with `pnpm add convex`?');
    expect(transcript).toContain('? Select the addon skills to install');
    expect(existsSync(join(projectRoot, '.agents/skills/convex-functions/SKILL.md'))).toBe(true);
    expect(await readProjectConfig(projectRoot)).toMatchObject({ addons: [{ name: 'convex', options: {} }] });
  });

  it('adopts an installed integration without reinstalling it', async () => {
    const projectRoot = await createInitializedProject(
      createAppFiles({
        'package.json': { name: 'shop', private: true, packageManager: 'pnpm@10.28.1', devDependencies: { portless: '0.4.0' } },
        ...createSkillPackage('node_modules/portless', { name: 'portless', version: '0.4.0', skills: ['portless-dev'] }),
      }),
      [],
    );
    const listing = createScriptedPrompter(answer());

    await runAddList({ directory: projectRoot, prompter: listing.prompter });
    expect(listing.transcript.join('\n')).not.toContain('portless-dev');

    const { status, transcript } = await add(projectRoot, { kind: 'addon', name: 'portless', installPackage: () => Promise.reject(new Error('should not install')) });

    expect(status).toBe('complete');
    expect(transcript.some((line) => line.startsWith('? Install'))).toBe(false);
    expect((await readProjectConfig(projectRoot))?.skills.map((skill) => skill.name)).toContain('portless-dev');
  });

  it('rejects unsupported addons', async () => {
    const projectRoot = await createInitializedProject(createAppFiles(), []);
    const { status, transcript } = await add(projectRoot, { kind: 'addon', name: 'left-pad' });

    expect(status).toBe('failed');
    expect(transcript).toContain('error: Unsupported addon: left-pad. Supported: convex, portless, and individual @tanstack/* or @jfdevelops/* libraries.');
  });

  it('asks which version to use when the addon is installed in several versions', async () => {
    const projectRoot = await createInitializedProject(
      {
        'package.json': { name: 'monorepo', private: true, packageManager: 'pnpm@10.28.1', devDependencies: { portless: '1.0.0' } },
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'packages/ui/package.json': { name: '@acme/ui', version: '1.0.0', exports: './index.js', devDependencies: { portless: '2.0.0' } },
        ...createSkillPackage('node_modules/portless', { name: 'portless', version: '1.0.0', skills: ['portless-dev'] }),
        ...createSkillPackage('packages/ui/node_modules/portless', { name: 'portless', version: '2.0.0', skills: ['portless-dev'] }),
      },
      [],
    );
    const { status, transcript } = await add(
      projectRoot,
      { kind: 'addon', name: 'portless' },
      answer((question) => (question.kind === 'select' && question.message.startsWith('portless-dev is provided') ? 'portless@2.0.0' : undefined)),
    );

    expect(status).toBe('complete');
    expect(transcript).toContain('? portless-dev is provided by more than one package or version. Which should be installed?');
    expect((await readProjectConfig(projectRoot))?.skills.find((skill) => skill.name === 'portless-dev')?.source.version).toBe('2.0.0');
  });

  it('says the package stays installed when cancelled after installing it', async () => {
    const projectRoot = await createInitializedProject(createAppFiles(), []);
    const { status, transcript } = await add(
      projectRoot,
      { kind: 'addon', name: 'convex', installPackage: installConvex },
      answer((question) => (question.message === 'Apply these changes?' ? false : undefined)),
    );

    expect(status).toBe('cancelled');
    expect(transcript.at(-1)).toBe(
      'cancel: Add cancelled. convex was installed, but the addon was not recorded. Run jfdevelops add addon convex again to finish, or uninstall the package.',
    );
    expect(transcript).not.toContain('cancel: Add cancelled. No project files were changed.');
  });

  it('installs at a pnpm workspace root with --workspace-root', async () => {
    const projectRoot = await createInitializedProject(createWorkspaceFiles(), []);
    const installs: unknown[] = [];
    const { transcript } = await add(projectRoot, {
      kind: 'addon',
      name: 'convex',
      installPackage: async (options) => {
        installs.push(options);
        await installConvex(options);
      },
    });

    expect(transcript).toContain('? Install convex in the project root with `pnpm add --workspace-root convex`?');
    expect(installs).toEqual([expect.objectContaining({ isWorkspaceRoot: true })]);
  });
});

describe('add package', () => {
  it('scaffolds a library inside an existing workspace pattern', async () => {
    const projectRoot = await createInitializedProject(createWorkspaceFiles(), []);
    const workspaceBefore = await readText(projectRoot, 'pnpm-workspace.yaml');
    const { status, transcript } = await add(projectRoot, { kind: 'package', name: '@acme/utils' });

    expect(status).toBe('complete');
    expect(transcript.at(-1)).toBe('outro: Created @acme/utils in packages/utils. Run pnpm install to link it into the workspace.');
    expect(JSON.parse(await readText(projectRoot, 'packages/utils/package.json'))).toMatchObject({ name: '@acme/utils', type: 'module' });
    expect(existsSync(join(projectRoot, 'packages/utils/src/index.ts'))).toBe(true);
    expect(await readText(projectRoot, 'pnpm-workspace.yaml')).toBe(workspaceBefore);
    expect((await readProjectConfig(projectRoot))?.targets).toContainEqual({ path: 'packages/utils', kind: 'library', template: 'typescript-library', options: {} });
  });

  it('registers directories outside the workspace patterns', async () => {
    const projectRoot = await createInitializedProject(createWorkspaceFiles(), []);
    const { status } = await add(projectRoot, { kind: 'package', name: 'tools' }, answer((question) => (question.kind === 'text' ? 'libs/tools' : undefined)));

    expect(status).toBe('complete');
    expect(await readText(projectRoot, 'pnpm-workspace.yaml')).toBe('# Workspace packages\npackages:\n  - packages/*\n  - libs/tools\n');
  });

  it('refuses occupied directories and projects without a workspace', async () => {
    const workspaceRoot = await createInitializedProject(createWorkspaceFiles(), []);
    const occupied = await add(workspaceRoot, { kind: 'package', name: 'ui' });
    const appRoot = await createInitializedProject(createAppFiles(), []);
    const noWorkspace = await add(appRoot, { kind: 'package', name: 'utils' });

    expect(occupied.transcript).toContain('error: packages/ui already exists and is not empty.');
    expect(noWorkspace.transcript).toContain('error: add package needs a workspace defined in pnpm-workspace.yaml or package.json workspaces.');
  });

  it('does not record a package whose scaffold failed, so it can be retried', async () => {
    const projectRoot = await createInitializedProject(createWorkspaceFiles(), []);
    // A file appearing between the preview and applying makes that write fail.
    const { status, transcript } = await add(
      projectRoot,
      { kind: 'package', name: '@acme/utils' },
      answer((question) => {
        if (question.message === 'Apply these changes?') {
          mkdirSync(join(projectRoot, 'packages/utils'), { recursive: true });
          writeFileSync(join(projectRoot, 'packages/utils/package.json'), '{}\n');

          return true;
        }

        return undefined;
      }),
    );

    expect(status).toBe('incomplete');
    expect(transcript.at(-1)).toBe('outro: Finished with errors. Remove what was created in packages/utils, then run jfdevelops add package @acme/utils again.');
    expect((await readProjectConfig(projectRoot))?.targets.map((target) => target.path)).not.toContain('packages/utils');
  });
});

describe('failed skill additions', () => {
  it('point to skills sync to finish the remaining files', async () => {
    const projectRoot = await createInitializedProject(createAppFiles(), ['build-forms']);
    const { status, transcript } = await add(
      projectRoot,
      { kind: 'skill', name: 'validate-forms' },
      answer((question) => {
        if (question.message === 'Apply these changes?') {
          mkdirSync(join(projectRoot, '.cursor/skills/validate-forms'), { recursive: true });
          writeFileSync(join(projectRoot, '.cursor/skills/validate-forms/SKILL.md'), 'mine\n');

          return true;
        }

        return undefined;
      }),
    );

    expect(status).toBe('incomplete');
    expect(transcript.at(-1)).toBe('outro: Finished with errors. Run jfdevelops skills sync to install the remaining skill files.');
  });
});

describe('browsing additions', () => {
  it('offers available kinds and adds the chosen skills', async () => {
    const projectRoot = await createInitializedProject(createAppFiles(), []);
    const { status, transcript } = await add(
      projectRoot,
      {},
      answer((question) => {
        if (question.message === 'What would you like to add?') {

          return 'skill';
        }

        return question.kind === 'multiselect' ? ['validate-forms'] : undefined;
      }),
    );

    expect(status).toBe('complete');
    expect(transcript).toContain('outro: Enabled validate-forms.');
    expect((await readProjectConfig(projectRoot))?.skills.map((skill) => skill.name)).toContain('validate-forms');
  });
});
