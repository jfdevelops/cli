import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProjectConfig } from '../../config/read.js';
import { writeProjectConfig } from '../../config/write.js';
import { hashContent } from '../../plan/hash.js';
import { createFixture, type FixtureFiles } from '../../testing/fixture.js';
import { createScriptedPrompter } from '../../testing/prompter.js';
import { createWorkspaceFiles } from '../create/workspace.js';
import { createProjectUpdateFiles } from './files.js';
import { runUpdate } from './run.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

function createPrompter(shouldConfirm = true) {

  return createScriptedPrompter((question) => {
    if (question.kind === 'confirm') {

      return shouldConfirm;
    }

    if (question.kind === 'multiselect') {

      return question.initialValues ?? [];
    }

    if (question.kind === 'text') {

      return question.defaultValue ?? '';
    }

    return question.initialValue ?? question.choices[0]?.value ?? '';
  });
}

async function createProject(files: FixtureFiles = {}) {
  const fixture = await createFixture({ 'package.json': { name: 'shop', private: true, packageManager: 'pnpm@10.28.1' }, ...files });
  const config = await writeProjectConfig(fixture.root, {
    schemaVersion: 1,
    generator: { package: '@jfdevelops/cli', version: '0.1.0' },
    project: { name: 'shop', packageManager: 'pnpm' },
    targets: [{ path: '.', kind: 'app', options: {} }],
    addons: [],
    skills: [],
    managedFiles: [],
  });

  fixtures.push(fixture);

  return { ...fixture, config };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('runUpdate', () => {
  it('upgrades the CLI before handing the project to the installed release', async () => {
    const { root } = await createProject({ 'pnpm-workspace.yaml': 'packages:\n  - packages/*\n' });
    const actions: string[] = [];

    await expect(runUpdate({
      directory: root,
      version: '0.2.0',
      prompter: createPrompter().prompter,
      installPackage: async (options) => {
        expect(options).toMatchObject({ packageName: '@jfdevelops/cli@latest', isDevelopment: true, isWorkspaceRoot: true });
        actions.push('install');
      },
      runInstalledUpdate: async (directory) => {
        expect(directory).toBe(root);
        actions.push('refresh');
      },
    })).resolves.toBe('complete');
    expect(actions).toEqual(['install', 'refresh']);
  });

  it('runs the installed CLI executable with the project refresh flag', async () => {
    const { root } = await createProject({
      'node_modules/@jfdevelops/cli/package.json': { name: '@jfdevelops/cli', type: 'module' },
      'node_modules/@jfdevelops/cli/dist/cli.js': `import { writeFileSync } from 'node:fs';
writeFileSync('handoff.json', JSON.stringify(process.argv.slice(2)));
`,
    });

    await expect(runUpdate({ directory: root, version: '0.2.0', prompter: createPrompter().prompter, installPackage: async () => undefined })).resolves.toBe('complete');
    expect(JSON.parse(await readFile(join(root, 'handoff.json'), 'utf8'))).toEqual(['update', root, '--refresh-project']);
  });

  it('reports cancellation from the installed project refresh', async () => {
    const { root } = await createProject({
      'node_modules/@jfdevelops/cli/package.json': { name: '@jfdevelops/cli', type: 'module' },
      'node_modules/@jfdevelops/cli/dist/cli.js': 'process.exit(2);',
    });

    await expect(runUpdate({ directory: root, version: '0.2.0', prompter: createPrompter().prompter, installPackage: async () => undefined })).resolves.toBe('cancelled');
  });

  it('leaves the project unchanged when upgrading is declined', async () => {
    const { root } = await createProject();
    const actions: string[] = [];

    await expect(runUpdate({ directory: root, version: '0.2.0', prompter: createPrompter(false).prompter, installPackage: async () => void actions.push('install'), runInstalledUpdate: async () => void actions.push('refresh') })).resolves.toBe('cancelled');
    expect(actions).toEqual([]);
  });

  it('does not refresh the project after a failed CLI installation', async () => {
    const { root } = await createProject();
    const actions: string[] = [];

    await expect(runUpdate({ directory: root, version: '0.2.0', prompter: createPrompter().prompter, installPackage: async () => { throw new Error('offline'); }, runInstalledUpdate: async () => void actions.push('refresh') })).resolves.toBe('failed');
    expect(actions).toEqual([]);
  });

  it('refreshes an older workspace with CI and task configuration while preserving application files', async () => {
    const generated = createWorkspaceFiles({ projectName: 'shop', version: '0.1.0', formatter: 'prettier', packageManager: 'pnpm', packageManagerVersion: '10.28.1', layout: { appsDirectory: 'apps', packagesDirectory: 'packages', apps: [{ name: 'web', directory: 'apps/web' }], libraries: [] } });
    const oldFiles = generated.filter((file) => !file.path.startsWith('.github/') && !file.path.startsWith('scripts/') && !file.path.endsWith('vite.config.ts') && !file.path.includes('/test/'));
    const fixtureFiles = Object.fromEntries(oldFiles.map((file) => [file.path, String(file.content)]));
    const { root, config } = await createProject({ ...fixtureFiles, 'apps/web/src/index.ts': 'console.log("my application");\n', 'README.md': '# My own documentation\n' });

    await writeProjectConfig(root, { ...config, formatter: 'prettier', targets: [{ path: 'apps/web', kind: 'app', template: 'node-app', options: {} }], managedFiles: oldFiles.map((file) => ({ path: file.path, owner: file.owner, sha256: hashContent(file.content) })) });
    const installs: string[] = [];
    const status = await runUpdate({ directory: root, version: '0.2.0', isRefreshingProject: true, prompter: createPrompter().prompter, installPackage: async () => undefined, installDependency: async () => undefined, installProject: async (directory) => void installs.push(directory) });

    expect(status).toBe('complete');
    expect((await readProjectConfig(root))?.generator.version).toBe('0.2.0');
    expect(existsSync(join(root, '.github/workflows/ci.yml'))).toBe(true);
    expect(existsSync(join(root, 'scripts/run-affected.mjs'))).toBe(true);
    expect(existsSync(join(root, 'apps/web/vite.config.ts'))).toBe(true);
    expect(existsSync(join(root, 'apps/web/test/index.test.ts'))).toBe(true);
    expect(await readFile(join(root, 'apps/web/src/index.ts'), 'utf8')).toBe('console.log("my application");\n');
    expect(await readFile(join(root, 'README.md'), 'utf8')).toBe('# My own documentation\n');
    expect(installs).toEqual([root]);
  });
});

describe('createProjectUpdateFiles', () => {
  it('preserves adopted project tooling when no template is recorded', async () => {
    const { root, config } = await createProject();

    expect(await createProjectUpdateFiles(root, config, '0.2.0')).toEqual([]);
  });

  it('adds an exact package manager version to workspaces generated before it was recorded', async () => {
    const { root, config } = await createProject({
      'package.json': { name: 'shop' },
      'packages/core/package.json': { name: '@shop/core', version: '1.0.0' },
    });
    const files = await createProjectUpdateFiles(root, { ...config, formatter: 'prettier', targets: [{ path: 'packages/core', kind: 'library', template: 'typescript-library', options: {} }] }, '0.2.0', async () => '10.28.1');
    const manifest = JSON.parse(String(files.find((file) => file.path === 'package.json')?.content));

    expect(manifest.packageManager).toBe('pnpm@10.28.1');
  });

  it('refreshes library export paths when migrating workspace builds to Vite+', async () => {
    const { root, config } = await createProject({
      'package.json': { name: 'shop', packageManager: 'pnpm@10.28.1' },
      'packages/core/package.json': { name: '@shop/core', version: '3.0.0', scripts: { build: 'tsc', deploy: 'custom-deploy' }, exports: { '.': { import: './dist/index.js', types: './dist/index.d.ts' } } },
    });
    const files = await createProjectUpdateFiles(root, { ...config, formatter: 'prettier', targets: [{ path: 'packages/core', kind: 'library', template: 'typescript-library', options: {} }] }, '0.2.0');
    const manifest = JSON.parse(String(files.find((file) => file.path === 'packages/core/package.json')?.content));

    expect(manifest.scripts.build).toBeUndefined();
    expect(manifest.scripts.deploy).toBe('custom-deploy');
    expect(manifest).toMatchObject({ name: '@shop/core', version: '3.0.0', exports: { '.': { import: './dist/index.mjs', types: './dist/index.d.mts' } } });
  });

  it('preserves custom manifest fields and scripts while refreshing generated tooling', async () => {
    const { root, config } = await createProject({
      'package.json': { name: 'shop', version: '3.0.0', private: false, scripts: { deploy: 'my-deploy', build: 'old-build' }, dependencies: { example: '^1.0.0' }, devDependencies: { custom: '^2.0.0' }, customField: true },
      'src/index.ts': 'my code',
    });
    const files = await createProjectUpdateFiles(root, { ...config, formatter: 'prettier', targets: [{ path: '.', kind: 'app', template: 'node-app', options: {} }] }, '0.2.0');
    const manifest = JSON.parse(String(files.find((file) => file.path === 'package.json')?.content));

    expect(manifest).toMatchObject({ version: '3.0.0', private: false, customField: true, scripts: { deploy: 'my-deploy', build: 'tsc' }, dependencies: { example: '^1.0.0' }, devDependencies: { custom: '^2.0.0', '@jfdevelops/cli': '0.2.0' } });
    expect(files.some((file) => file.path === 'src/index.ts')).toBe(false);
  });
});
