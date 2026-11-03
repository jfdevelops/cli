import { afterEach, describe, expect, it } from 'vitest';
import { createFixture } from '../testing/fixture.js';
import { detectIntegrations } from './integration.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('detectIntegrations', () => {
  it('detects supported integrations independently and records every scope', async () => {
    const fixture = await createFixture({
      'package.json': { devDependencies: { portless: '1.0.0', '@jfdevelops/cli': '0.1.0' } },
      'apps/web/package.json': { dependencies: { convex: '1.0.0', '@tanstack/react-query': '5.0.0', react: '19.0.0' } },
      'packages/table/package.json': { optionalDependencies: { '@tanstack/react-query': '5.0.0', '@jfdevelops/table': '1.0.0' } },
    });

    fixtures.push(fixture);

    await expect(detectIntegrations(fixture.root, ['.', 'apps/web', 'packages/table'])).resolves.toEqual([
      { name: '@jfdevelops/table', package: '@jfdevelops/table', scopes: ['packages/table'] },
      { name: '@tanstack/react-query', package: '@tanstack/react-query', scopes: ['apps/web', 'packages/table'] },
      { name: 'convex', package: 'convex', scopes: ['apps/web'] },
      { name: 'portless', package: 'portless', scopes: ['.'] },
    ]);
  });
});
