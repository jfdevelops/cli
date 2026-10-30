import { afterEach, describe, expect, it } from 'vitest';
import { createFixture, type FixtureFiles } from '../testing/fixture.js';
import { detectProject } from './project.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

async function createProject(files: FixtureFiles) {
  const fixture = await createFixture(files);

  fixtures.push(fixture);

  return fixture.root;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('detectProject', () => {
  it('detects a single-package app', async () => {
    const root = await createProject({
      'package.json': { name: 'shop', private: true, packageManager: 'pnpm@10.28.1', dependencies: { next: '15.0.0' } },
      'pnpm-lock.yaml': '',
    });

    await expect(detectProject(root)).resolves.toMatchObject({
      name: 'shop',
      packageManager: { name: 'pnpm', version: '10.28.1' },
      workspace: undefined,
      targets: [{ path: '.', name: 'shop', kind: 'app' }],
      agentFiles: [],
      config: undefined,
      warnings: [],
    });
  });

  it('detects a pnpm workspace mixing apps and libraries', async () => {
    const root = await createProject({
      'package.json': { name: 'monorepo', private: true },
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'packages/*'\n  - '!packages/internal'\n",
      'apps/web/package.json': { name: 'web', private: true, dependencies: { '@tanstack/react-start': '1.0.0' } },
      'packages/ui/package.json': { name: '@monorepo/ui', exports: './src/index.ts' },
      'packages/internal/package.json': { name: 'internal', private: true },
      'packages/ui/node_modules/dep/package.json': { name: 'dep' },
      'docs/package.json': { name: 'docs' },
    });
    const project = await detectProject(root);

    expect(project.packageManager).toEqual({ name: 'pnpm', version: undefined, source: 'lockfile' });
    expect(project.workspace).toEqual({
      source: 'pnpm-workspace.yaml',
      patterns: ['apps/*', 'packages/*', '!packages/internal'],
      packagePaths: ['apps/web', 'packages/ui'],
    });
    expect(project.targets).toMatchObject([
      { path: 'apps/web', name: 'web', kind: 'app' },
      { path: 'packages/ui', name: '@monorepo/ui', kind: 'library' },
    ]);
  });

  it('reads package.json workspaces for other package managers', async () => {
    const root = await createProject({
      'package.json': { name: 'tools', private: true, workspaces: { packages: ['./libs/*/'] } },
      'yarn.lock': '',
      'pnpm-workspace.yaml': 'packages: []\n',
      'libs/core/package.json': { name: 'core', main: './index.js' },
    });
    const project = await detectProject(root);

    expect(project.workspace).toMatchObject({ source: 'package.json', packagePaths: ['libs/core'] });
    expect(project.warnings).toEqual(['Ignoring pnpm-workspace.yaml because the project uses yarn']);
  });

  it('reports existing agent files and configuration', async () => {
    const root = await createProject({
      'package.json': { name: 'adopted', version: '1.0.0' },
      'AGENTS.md': '# Agents\n',
      '.claude/skills/custom/SKILL.md': '---\nname: custom\n---\n',
      'jfdevelops.json': {
        schemaVersion: 1,
        generator: { package: '@jfdevelops/cli', version: '0.1.0' },
        project: { name: 'adopted', packageManager: 'npm' },
      },
    });
    const project = await detectProject(root);

    expect(project.agentFiles).toEqual(['AGENTS.md', '.claude/skills']);
    expect(project.config?.project.name).toBe('adopted');
  });

  it('returns the same result on repeated runs', async () => {
    const root = await createProject({
      'package.json': { name: 'stable', workspaces: ['packages/*'] },
      'package-lock.json': '{}',
      'packages/a/package.json': { name: 'a' },
    });

    expect(await detectProject(root)).toEqual(await detectProject(root));
  });

  it('rejects directories without a package manifest', async () => {
    const root = await createProject({ 'README.md': '# Empty\n' });

    await expect(detectProject(root)).rejects.toThrow('No package.json found');
  });

  it('rejects malformed manifests', async () => {
    const root = await createProject({ 'package.json': '{ "name": 1 }' });

    await expect(detectProject(root)).rejects.toMatchObject({ name: 'ManifestError' });
  });
});
