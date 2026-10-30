import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixture, type FixtureFiles } from '../testing/fixture.js';
import { createSkillPackage } from '../testing/skill-package.js';
import { buildSkillCatalog } from './catalog.js';
import { findInstalledPackage } from './installed.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

async function createProject(files: FixtureFiles) {
  const fixture = await createFixture(files);

  fixtures.push(fixture);

  return fixture.root;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('buildSkillCatalog', () => {
  it('collects skills per scope and reports same-named skills from different sources', async () => {
    const root = await createProject({
      'package.json': { name: 'monorepo', private: true, devDependencies: { '@jfdevelops/skills': '0.1.0' } },
      'apps/web/package.json': { name: 'web', dependencies: { '@acme/forms': '2.0.0', 'not-installed': '1.0.0' } },
      'packages/ui/package.json': { name: 'ui', dependencies: { '@acme/forms': '1.0.0', '@jfdevelops/skills': '0.1.0' } },
      ...createSkillPackage('node_modules/@jfdevelops/skills', { name: '@jfdevelops/skills', version: '0.1.0', skills: ['jf-git'] }),
      ...createSkillPackage('node_modules/@acme/forms', { name: '@acme/forms', version: '1.0.0', skills: ['build-forms'] }),
      ...createSkillPackage('apps/web/node_modules/@acme/forms', { name: '@acme/forms', version: '2.0.0', skills: ['build-forms'] }),
      'node_modules/plain/package.json': { name: 'plain', version: '1.0.0' },
    });
    const catalog = await buildSkillCatalog(root, ['.', 'apps/web', 'packages/ui']);

    expect(catalog.skills).toMatchObject([
      { name: 'build-forms', source: { package: '@acme/forms', version: '2.0.0', path: './skills/build-forms' }, scopes: ['apps/web'] },
      { name: 'build-forms', source: { package: '@acme/forms', version: '1.0.0' }, scopes: ['packages/ui'] },
      { name: 'jf-git', source: { package: '@jfdevelops/skills', version: '0.1.0' }, scopes: ['.', 'packages/ui'] },
    ]);
    expect(catalog.conflicts).toEqual([
      {
        name: 'build-forms',
        sources: [
          { package: '@acme/forms', version: '2.0.0' },
          { package: '@acme/forms', version: '1.0.0' },
        ],
      },
    ]);
    expect(catalog.missingDependencies).toEqual([{ scope: 'apps/web', name: 'not-installed' }]);
    expect(catalog.problems).toEqual([]);
  });

  it('attributes package problems to their source', async () => {
    const root = await createProject({
      'package.json': { name: 'app', dependencies: { broken: '1.0.0' } },
      'node_modules/broken/package.json': { name: 'broken', version: '1.0.0', jfdevelops: { skills: [] } },
    });
    const catalog = await buildSkillCatalog(root, ['.']);

    expect(catalog.skills).toEqual([]);
    expect(catalog.problems).toEqual([{ package: 'broken@1.0.0', message: expect.stringContaining('Invalid jfdevelops metadata') }]);
  });
});

describe('findInstalledPackage', () => {
  it('does not search above the project root', async () => {
    const root = await createProject({
      'node_modules/outer/package.json': { name: 'outer', version: '1.0.0' },
      'project/package.json': { name: 'project' },
    });

    const project = join(root, 'project');

    expect(findInstalledPackage(project, 'outer', project)).toBeUndefined();
    expect(findInstalledPackage(project, 'outer', root)).toBe(join(root, 'node_modules', 'outer'));
  });
});
