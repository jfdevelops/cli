import { describe, expect, it } from 'vitest';
import { projectConfigSchema } from './schema.js';

const digest = 'a'.repeat(64);

function createConfig(overrides: Record<string, unknown> = {}) {

  return {
    schemaVersion: 1,
    generator: { package: '@jfdevelops/cli', version: '0.1.0' },
    project: { name: 'example', packageManager: 'pnpm' },
    targets: [{ path: '.', kind: 'app', template: 'tanstack-start', options: { router: 'file' } }],
    addons: [{ name: 'portless' }],
    skills: [
      {
        name: 'jf-git',
        required: true,
        source: { package: '@jfdevelops/skills', version: '0.1.0', path: './skills/jf-git' },
      },
    ],
    managedFiles: [
      { path: '.agents/skills/jf-git/SKILL.md', owner: { type: 'skill', name: 'jf-git' }, sha256: digest },
      { path: 'portless.config.ts', owner: { type: 'addon', name: 'portless' }, sha256: digest },
      { path: 'jfdevelops.json', owner: { type: 'project' }, sha256: digest },
    ],
    ...overrides,
  };
}

function collectMessages(input: unknown) {
  const result = projectConfigSchema.safeParse(input);

  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('projectConfigSchema', () => {
  it('accepts a complete configuration', () => {
    expect(collectMessages(createConfig())).toEqual([]);
  });

  it('defaults omitted collections and options', () => {
    const config = projectConfigSchema.parse({
      schemaVersion: 1,
      generator: { package: '@jfdevelops/cli', version: '0.1.0' },
      project: { name: 'example', packageManager: 'npm' },
      addons: [{ name: 'convex' }],
    });

    expect(config).toMatchObject({ targets: [], skills: [], managedFiles: [], addons: [{ name: 'convex', options: {} }] });
  });

  it('rejects other schema versions and unknown fields', () => {
    expect(collectMessages(createConfig({ schemaVersion: 2 }))).not.toEqual([]);
    expect(collectMessages(createConfig({ secrets: { token: 'x' } }))).not.toEqual([]);
  });

  it.each(['/etc/passwd', '../outside', 'a/../b', 'a//b', 'a/', './a', 'C:/a', 'a\\b', ''])(
    'rejects the unsafe managed file path %j',
    (path) => {
      const managedFiles = [{ path, owner: { type: 'project' }, sha256: digest }];

      expect(collectMessages(createConfig({ managedFiles }))).toContain('Expected a project-relative POSIX path');
    },
  );

  it('rejects malformed digests and skill names', () => {
    const managedFiles = [{ path: 'a.md', owner: { type: 'project' }, sha256: 'ABC' }];
    const skills = [{ name: 'Not_Kebab', required: false, source: { package: 'x', version: '1.0.0', path: './x' } }];

    expect(collectMessages(createConfig({ managedFiles, skills }))).toEqual(
      expect.arrayContaining(['Expected a lowercase hex SHA-256 digest', 'Expected a lowercase kebab-case name']),
    );
  });

  it('rejects duplicate entries', () => {
    const config = createConfig();
    const duplicated = createConfig({
      targets: [...config.targets, ...config.targets],
      skills: [...config.skills, ...config.skills],
      managedFiles: [...config.managedFiles, config.managedFiles[2]],
    });

    expect(collectMessages(duplicated)).toEqual([
      'Duplicate entry: .',
      'Duplicate entry: jf-git',
      'Duplicate entry: jfdevelops.json',
    ]);
  });

  it('rejects managed files owned by skills or addons that are not enabled', () => {
    expect(collectMessages(createConfig({ skills: [], addons: [] }))).toEqual([
      'Owner skill is not enabled: jf-git',
      'Owner addon is not enabled: portless',
    ]);
  });
});
