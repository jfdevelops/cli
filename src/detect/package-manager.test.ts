import { afterEach, describe, expect, it } from 'vitest';
import { createFixture, type FixtureFiles } from '../testing/fixture.js';
import { detectPackageManager } from './package-manager.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

async function detect(files: FixtureFiles, packageManager?: string) {
  const fixture = await createFixture(files);

  fixtures.push(fixture);

  return detectPackageManager(fixture.root, packageManager ? { packageManager } : {});
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('detectPackageManager', () => {
  it('prefers the packageManager field and strips its integrity hash', async () => {
    const result = await detect({ 'pnpm-lock.yaml': '' }, 'pnpm@10.28.1+sha512.abc');

    expect(result).toEqual({
      packageManager: { name: 'pnpm', version: '10.28.1', source: 'packageManager' },
      lockfiles: ['pnpm-lock.yaml'],
      warnings: [],
    });
  });

  it('warns when lockfiles disagree with the packageManager field', async () => {
    const result = await detect({ 'package-lock.json': '{}' }, 'yarn@4.5.0');

    expect(result.packageManager?.name).toBe('yarn');
    expect(result.warnings).toEqual(['Lockfiles do not match packageManager yarn: package-lock.json']);
  });

  it.each([
    ['pnpm-lock.yaml', 'pnpm'],
    ['package-lock.json', 'npm'],
    ['npm-shrinkwrap.json', 'npm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
  ])('falls back to %s', async (lockfile, name) => {
    const result = await detect({ [lockfile]: '' });

    expect(result.packageManager).toEqual({ name, version: undefined, source: 'lockfile' });
  });

  it('reports ambiguity instead of choosing between lockfiles', async () => {
    const result = await detect({ 'yarn.lock': '', 'package-lock.json': '{}' });

    expect(result.packageManager).toBeUndefined();
    expect(result.warnings).toEqual(['Lockfiles from multiple package managers: package-lock.json, yarn.lock']);
  });

  it('ignores an unrecognized packageManager field', async () => {
    const result = await detect({}, 'deno@2.0.0');

    expect(result.packageManager).toBeUndefined();
    expect(result.warnings).toEqual(['Ignoring unrecognized packageManager field: deno@2.0.0']);
  });
});
