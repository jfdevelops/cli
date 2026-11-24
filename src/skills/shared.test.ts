import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixture } from '../testing/fixture.js';
import { createSkillPackage } from '../testing/skill-package.js';
import { buildSkillCatalog } from './catalog.js';
import { applySharedSkillsCheckout, sharedSkillsPackageName } from './shared.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('applySharedSkillsCheckout', () => {
  it('rewrites shared skill and conflict versions to the checkout revision', async () => {
    const fixture = await createFixture({
      'package.json': { name: 'app', dependencies: { '@acme/forms': '1.0.0' } },
      ...createSkillPackage('node_modules/@acme/forms', { name: '@acme/forms', version: '1.0.0', skills: ['jf-git'] }),
      ...createSkillPackage('shared', { name: '@jfdevelops/skills', version: '9.9.9', skills: ['jf-git'] }),
    });

    fixtures.push(fixture);

    const catalog = await buildSkillCatalog(fixture.root, ['.'], [{ directory: join(fixture.root, 'shared'), scope: '.', required: true }]);
    const applied = applySharedSkillsCheckout(catalog, { directory: join(fixture.root, 'shared'), revision: 'abc123', close: async () => undefined });

    expect(applied.skills).toMatchObject([
      { name: 'jf-git', source: { package: '@acme/forms', version: '1.0.0' } },
      { name: 'jf-git', required: true, source: { package: sharedSkillsPackageName, version: 'abc123' } },
    ]);
    expect(applied.conflicts).toEqual([
      {
        name: 'jf-git',
        sources: [
          { package: '@acme/forms', version: '1.0.0' },
          { package: sharedSkillsPackageName, version: 'abc123' },
        ],
      },
    ]);
  });
});
