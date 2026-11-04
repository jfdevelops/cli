import { describe, expect, it } from 'vitest';
import { composePackageName, createWorkspaceFiles, getPackageDirectory, type WorkspaceLayout } from './workspace.js';

const layout: WorkspaceLayout = {
  appsDirectory: 'apps',
  packagesDirectory: 'packages',
  apps: [{ name: 'acme-web', directory: 'apps/web' }],
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
    const files = createWorkspaceFiles({ projectName: 'acme', version: '1.2.3', formatter: 'prettier', packageManager: 'pnpm', layout });
    const root = readJson(files, 'package.json');

    expect(files.find((file) => file.path === 'pnpm-workspace.yaml')?.content).toBe('packages:\n  - packages/*\n  - apps/*\n');
    expect(root).toMatchObject({
      name: 'acme',
      private: true,
      scripts: { build: 'pnpm -r run build', format: 'prettier --write . && eslint --fix .' },
      devDependencies: { '@jfdevelops/cli': '1.2.3', eslint: expect.any(String), prettier: expect.any(String), typescript: expect.any(String) },
    });
    expect(root).not.toHaveProperty('workspaces');
    expect(files.map((file) => file.path)).toEqual(expect.arrayContaining(['eslint.config.js', '.prettierrc.json', '.gitignore', 'README.md']));
  });

  it.each([
    ['npm', 'npm run build --workspaces --if-present'],
    ['yarn', 'yarn workspaces foreach --all --exclude acme run build'],
    ['bun', "bun run --filter '*' build"],
  ] as const)('declares %s workspaces in package.json', (packageManager, build) => {
    const files = createWorkspaceFiles({ projectName: 'acme', version: '1.2.3', formatter: 'biome', packageManager, layout });

    expect(readJson(files, 'package.json')).toMatchObject({ workspaces: ['packages/*', 'apps/*'], scripts: { build } });
    expect(files.some((file) => file.path === 'pnpm-workspace.yaml')).toBe(false);
    expect(files.some((file) => file.path === 'biome.json')).toBe(true);
  });

  it('lists a shared directory once when apps and libraries live together', () => {
    const files = createWorkspaceFiles({
      projectName: 'acme',
      version: '1.2.3',
      formatter: 'prettier',
      packageManager: 'npm',
      layout: { ...layout, appsDirectory: 'packages' },
    });

    expect(readJson(files, 'package.json')).toMatchObject({ workspaces: ['packages/*'] });
  });

  it('creates each app as a private package that builds on its own', () => {
    const files = createWorkspaceFiles({ projectName: 'acme', version: '1.2.3', formatter: 'prettier', packageManager: 'pnpm', layout });

    expect(readJson(files, 'apps/web/package.json')).toMatchObject({
      name: 'acme-web',
      private: true,
      scripts: { build: 'tsc' },
      devDependencies: { typescript: expect.any(String) },
    });
    expect(files.map((file) => file.path)).toEqual(expect.arrayContaining(['apps/web/tsconfig.json', 'apps/web/src/index.ts', 'apps/web/README.md']));
    expect(files.every((file) => file.owner.type === 'project')).toBe(true);
  });
});
