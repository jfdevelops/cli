import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixture } from '../testing/fixture.js';
import { readProjectConfig } from './read.js';
import { writeProjectConfig } from './write.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

async function createProject() {
  const fixture = await createFixture({ 'jfdevelops.json': '{ "keep": "me" }\n' });

  fixtures.push(fixture);

  return fixture.root;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('writeProjectConfig', () => {
  it('writes formatted configuration that reads back identically', async () => {
    const projectRoot = await createProject();
    const written = await writeProjectConfig(projectRoot, {
      schemaVersion: 1,
      generator: { package: '@jfdevelops/cli', version: '0.1.0' },
      project: { name: 'example', packageManager: 'pnpm' },
    });

    expect(await readFile(join(projectRoot, 'jfdevelops.json'), 'utf8')).toBe(`${JSON.stringify(written, null, 2)}\n`);
    expect(await readProjectConfig(projectRoot)).toEqual(written);
    expect(await readdir(projectRoot)).toEqual(['jfdevelops.json']);
  });

  it('leaves the existing file untouched when the configuration is invalid', async () => {
    const projectRoot = await createProject();

    await expect(writeProjectConfig(projectRoot, { schemaVersion: 2 } as never)).rejects.toMatchObject({ name: 'ProjectConfigError' });
    expect(await readFile(join(projectRoot, 'jfdevelops.json'), 'utf8')).toBe('{ "keep": "me" }\n');
  });
});
