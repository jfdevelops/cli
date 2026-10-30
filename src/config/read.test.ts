import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectConfigError, parseProjectConfig, readProjectConfig } from './read.js';

const validConfig = {
  schemaVersion: 1,
  generator: { package: '@jfdevelops/cli', version: '0.1.0' },
  project: { name: 'example', packageManager: 'pnpm' },
};

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'jfdevelops-config-'));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe('parseProjectConfig', () => {
  it('reports every validation issue with its location', () => {
    expect(() => parseProjectConfig({ ...validConfig, project: { name: '' } })).toThrowError(
      expect.objectContaining({
        name: 'ProjectConfigError',
        message: expect.stringMatching(/project\.name[\s\S]*project\.packageManager/),
      }),
    );
  });
});

describe('readProjectConfig', () => {
  it('returns undefined when the project has no configuration', async () => {
    await expect(readProjectConfig(projectRoot)).resolves.toBeUndefined();
  });

  it('reads and validates the configuration file', async () => {
    await writeFile(join(projectRoot, 'jfdevelops.json'), JSON.stringify(validConfig));

    await expect(readProjectConfig(projectRoot)).resolves.toMatchObject({ project: { name: 'example' }, skills: [] });
  });

  it('rejects malformed JSON', async () => {
    await writeFile(join(projectRoot, 'jfdevelops.json'), '{');

    await expect(readProjectConfig(projectRoot)).rejects.toBeInstanceOf(ProjectConfigError);
  });
});
