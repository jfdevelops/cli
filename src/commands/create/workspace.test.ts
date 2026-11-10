import { describe, expect, it } from 'vitest';
import { composePackageName, createWorkspaceFiles, createWorkspaceTargets, getPackageDirectory, type WorkspaceLayout } from './workspace.js';

const layout: WorkspaceLayout = {
  appsDirectory: 'apps',
  packagesDirectory: 'packages',
  apps: [{ name: 'acme-web', directory: 'apps/web' }],
  libraries: [],
};

const libraryLayout: WorkspaceLayout = {
  appsDirectory: undefined,
  packagesDirectory: 'packages',
  apps: [],
  libraries: [
    { name: '@acme/core', directory: 'packages/core' },
    { name: '@acme/utils', directory: 'packages/utils' },
  ],
};

function readJson(files: ReturnType<typeof createWorkspaceFiles>, path: string) {

  const content = files.find((file) => file.path === path)?.content;

  return JSON.parse(typeof content === 'string' ? content : 'null') as Record<string, unknown>;
}

describe('composePackageName', () => {
  it.each([
    ['@acme', 'utils', '@acme/utils'],
    ['acme', 'web', 'acme-web'],
    ['', 'web', 'web'],
    ['acme', '@other/web', '@other/web'],
    ['@acme', '@other/web', '@other/web'],
  ])('joins namespace %j and %j as %j', (namespace, name, expected) => {
    expect(composePackageName(namespace, name)).toBe(expected);
  });
});

describe('getPackageDirectory', () => {
  it('uses the last segment of the package name', () => {
    expect(getPackageDirectory('apps', '@acme/web')).toBe('apps/web');
    expect(getPackageDirectory('services', 'acme-api')).toBe('services/acme-api');
  });
});

describe('createWorkspaceFiles', () => {
  it('defines a pnpm workspace in pnpm-workspace.yaml and keeps tooling at the private root', () => {
    const files = createWorkspaceFiles({ projectName: 'acme', version: '1.2.3', formatter: 'prettier', packageManager: 'pnpm', packageManagerVersion: '10.28.1', layout });
    const root = readJson(files, 'package.json');

    expect(files.find((file) => file.path === 'pnpm-workspace.yaml')?.content).toBe('packages:\n  - packages/*\n  - apps/*\n');
    expect(root).toMatchObject({
      name: 'acme',
      private: true,
      packageManager: 'pnpm@10.28.1',
      scripts: { build: 'vp run -r build', typecheck: 'vp run -r typecheck', test: 'vp run -r test', format: 'prettier --write . && eslint --fix .' },
      devDependencies: { '@jfdevelops/cli': '1.2.3', eslint: expect.any(String), prettier: expect.any(String), typescript: expect.any(String), 'vite-plus': expect.any(String) },
    });
    expect(root).not.toHaveProperty('workspaces');
    expect(files.map((file) => file.path)).toEqual(expect.arrayContaining(['eslint.config.js', '.prettierrc.json', '.gitignore', 'README.md']));
  });

  it.each(['npm', 'yarn', 'bun'] as const)('declares %s workspaces in package.json', (packageManager) => {
    const files = createWorkspaceFiles({ projectName: 'acme', version: '1.2.3', formatter: 'biome', packageManager, packageManagerVersion: '10.28.1', layout });

    expect(readJson(files, 'package.json')).toMatchObject({ packageManager: `${packageManager}@10.28.1`, workspaces: ['packages/*', 'apps/*'], scripts: { build: 'vp run -r build' } });
    expect(files.some((file) => file.path === 'pnpm-workspace.yaml')).toBe(false);
    expect(files.some((file) => file.path === 'biome.json')).toBe(true);
  });

  it('lists a shared directory once when apps and libraries live together', () => {
    const files = createWorkspaceFiles({
      projectName: 'acme',
      version: '1.2.3',
      formatter: 'prettier',
      packageManager: 'npm', packageManagerVersion: '10.28.1',
      layout: { ...layout, appsDirectory: 'packages' },
    });

    expect(readJson(files, 'package.json')).toMatchObject({ workspaces: ['packages/*'] });
  });

  it('creates private libraries beside apps and lists them in the workspace and README', () => {
    const files = createWorkspaceFiles({
      projectName: 'acme',
      version: '1.2.3',
      formatter: 'prettier',
      packageManager: 'pnpm', packageManagerVersion: '10.28.1',
      layout: { ...layout, libraries: [{ name: 'acme-utils', directory: 'packages/utils' }] },
    });
    const readme = files.find((file) => file.path === 'README.md')?.content;

    expect(readJson(files, 'packages/utils/package.json')).toMatchObject({ name: 'acme-utils', private: true, exports: expect.any(Object), devDependencies: { typescript: expect.any(String) } });
    expect(files.map((file) => file.path)).toEqual(expect.arrayContaining(['packages/utils/src/index.ts', 'packages/utils/tsconfig.json', 'packages/utils/README.md']));
    expect(files.find((file) => file.path === 'pnpm-workspace.yaml')?.content).toBe('packages:\n  - packages/*\n  - apps/*\n');
    expect(readme).toContain('- `apps/web`: acme-web');
    expect(readme).toContain('- `packages/utils`: acme-utils');
  });

  it('creates a workspace of publishable libraries that only covers the libraries directory', () => {
    const files = createWorkspaceFiles({ projectName: 'acme', version: '1.2.3', formatter: 'prettier', packageManager: 'pnpm', packageManagerVersion: '10.28.1', layout: libraryLayout });
    const core = readJson(files, 'packages/core/package.json');

    expect(files.find((file) => file.path === 'pnpm-workspace.yaml')?.content).toBe('packages:\n  - packages/*\n');
    expect(core).toMatchObject({ name: '@acme/core', files: ['dist'], exports: expect.any(Object) });
    expect(core).not.toHaveProperty('private');
    expect(readJson(files, 'package.json')).toMatchObject({ name: 'acme', private: true });
    expect(files.some((file) => file.path.startsWith('apps/'))).toBe(false);
    expect(files.every((file) => file.owner.type === 'project')).toBe(true);
  });

  it('creates each app as a private package that builds on its own', () => {
    const files = createWorkspaceFiles({ projectName: 'acme', version: '1.2.3', formatter: 'prettier', packageManager: 'pnpm', packageManagerVersion: '10.28.1', layout });

    expect(readJson(files, 'apps/web/package.json')).toMatchObject({
      name: 'acme-web',
      private: true,
      scripts: { start: 'node dist/index.js' },
      devDependencies: { typescript: expect.any(String), 'vite-plus': expect.any(String) },
    });
    expect(files.filter((file) => file.path.startsWith('apps/web/')).map((file) => file.path)).toEqual([
      'apps/web/README.md',
      'apps/web/package.json',
      'apps/web/tsconfig.json',
      'apps/web/tsconfig.build.json',
      'apps/web/vite.config.ts',
      'apps/web/src/index.ts',
      'apps/web/test/index.test.ts',
    ]);
    expect(files.every((file) => file.owner.type === 'project')).toBe(true);
  });
});

describe('workspace packages', () => {
  it('lays out each library with sources in src, tests in test, and cached Vite+ tasks', () => {
    const files = createWorkspaceFiles({ projectName: 'acme', version: '1.2.3', formatter: 'prettier', packageManager: 'pnpm', packageManagerVersion: '10.28.1', layout: libraryLayout });

    expect(files.filter((file) => file.path.startsWith('packages/core/')).map((file) => file.path)).toEqual([
      'packages/core/README.md',
      'packages/core/package.json',
      'packages/core/tsconfig.json',
      'packages/core/tsconfig.build.json',
      'packages/core/vite.config.ts',
      'packages/core/src/index.ts',
      'packages/core/test/index.test.ts',
    ]);
    expect(readJson(files, 'packages/core/package.json')).toMatchObject({
      exports: { '.': { types: './dist/index.d.mts', import: './dist/index.mjs' } },
      scripts: { prepack: 'vp pack' },
      devDependencies: { 'vite-plus': expect.any(String) },
    });

    const viteConfig = files.find((file) => file.path === 'packages/core/vite.config.ts')?.content;

    expect(viteConfig).toContain("build: { command: 'vp pack', dependsOn: [{ task: 'build', from: ['dependencies', 'devDependencies'] }] }");
    expect(viteConfig).toContain("test: { command: 'vp test run'");
    expect(viteConfig).toContain("tsconfig: 'tsconfig.build.json'");
    expect(readJson(files, 'packages/core/tsconfig.json')).toMatchObject({ compilerOptions: { noEmit: true }, include: ['src', 'test'] });
    expect(readJson(files, 'packages/core/tsconfig.build.json')).toMatchObject({ extends: './tsconfig.json', compilerOptions: { rootDir: 'src', declaration: true }, include: ['src'] });
    expect(files.find((file) => file.path === 'packages/core/test/index.test.ts')?.content).toContain("import { describe, expect, it } from 'vite-plus/test';");
  });
});

describe('affected-only CI', () => {
  it.each(['pnpm', 'npm', 'yarn', 'bun'] as const)('generates a %s workflow that runs tasks only in affected packages', (packageManager) => {
    const files = createWorkspaceFiles({ projectName: 'acme', version: '1.2.3', formatter: 'biome', packageManager, packageManagerVersion: '1.0.0', layout });
    const workflow = files.find((file) => file.path === '.github/workflows/ci.yml')?.content;

    expect(workflow).toContain('uses: voidzero-dev/setup-vp@v1.');
    expect(workflow).toContain('run: vp run format:check');
    expect(workflow).toContain('run: node scripts/run-affected.mjs typecheck test build');
    expect(workflow).toContain('BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}');
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).toContain('path: node_modules/.vite/task-cache');
    expect(files.find((file) => file.path === 'scripts/run-affected.mjs')?.content).toContain("['--filter', `...{${directory}}`]");
  });
});

describe('createWorkspaceTargets', () => {
  it('records each app and library with the template it is created from', () => {
    expect(createWorkspaceTargets({ ...layout, libraries: [{ name: 'acme-utils', directory: 'packages/utils' }] }, 'node-app')).toEqual([
      { path: 'apps/web', kind: 'app', template: 'node-app' },
      { path: 'packages/utils', kind: 'library', template: 'typescript-library' },
    ]);
    expect(createWorkspaceTargets(libraryLayout, 'typescript-library').map((target) => target.path)).toEqual(['packages/core', 'packages/utils']);
  });
});
