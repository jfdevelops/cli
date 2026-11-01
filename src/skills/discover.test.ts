import { mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixture, type FixtureFiles } from '../testing/fixture.js';
import { createSkillDocument, createSkillPackage } from '../testing/skill-package.js';
import { discoverPackageSkills } from './discover.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

async function createPackage(files: FixtureFiles) {
  const fixture = await createFixture(files);

  fixtures.push(fixture);

  return fixture.root;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('discoverPackageSkills', () => {
  it('lists declared skills with their source package and version', async () => {
    const root = await createPackage(createSkillPackage('.', { name: '@acme/forms', version: '2.1.0', skills: ['build-forms', 'validate-forms'] }));
    const discovery = await discoverPackageSkills(root);

    expect(discovery).toMatchObject({
      source: { name: '@acme/forms', version: '2.1.0' },
      skills: [
        { name: 'build-forms', description: 'Use build-forms', path: './skills/build-forms' },
        { name: 'validate-forms', description: 'Use validate-forms', path: './skills/validate-forms' },
      ],
      problems: [],
    });
    expect(discovery?.skills[0]?.directory).toMatch(/build-forms$/);
  });

  it('ignores packages without jfdevelops metadata', async () => {
    const root = await createPackage({ 'package.json': { name: 'left-pad', version: '1.0.0' } });

    await expect(discoverPackageSkills(root)).resolves.toBeUndefined();
  });

  it('reports invalid metadata without listing skills', async () => {
    const root = await createPackage({
      'package.json': { name: 'bad', version: '1.0.0', jfdevelops: { skills: [{ name: 'escape', path: '../escape' }] } },
    });
    const discovery = await discoverPackageSkills(root);

    expect(discovery?.skills).toEqual([]);
    expect(discovery?.problems).toEqual([expect.stringContaining('Expected a ./-prefixed package path')]);
  });

  it('reports invalid entries while keeping valid ones', async () => {
    const root = await createPackage({
      'package.json': {
        name: 'mixed',
        version: '1.0.0',
        jfdevelops: {
          skills: [
            { name: 'good', path: './skills/good' },
            { name: 'missing', path: './skills/missing' },
            { name: 'renamed', path: './skills/other' },
            { name: 'mislabeled', path: './skills/mislabeled' },
            { name: 'good', path: './skills/again' },
          ],
        },
      },
      'skills/good/SKILL.md': createSkillDocument('good'),
      'skills/other/SKILL.md': createSkillDocument('renamed'),
      'skills/mislabeled/SKILL.md': createSkillDocument('something-else'),
    });
    const discovery = await discoverPackageSkills(root);

    expect(discovery?.skills.map((skill) => skill.name)).toEqual(['good']);
    expect(discovery?.problems).toEqual([
      'Skill missing: SKILL.md or its directory is missing',
      'Skill renamed: directory name other does not match',
      'Skill mislabeled: frontmatter name something-else does not match',
      'Skill good: duplicate registration',
    ]);
  });

  it('rejects skill directories linked from outside the package', async () => {
    const root = await createPackage({
      'outside/escape/SKILL.md': createSkillDocument('escape'),
      'package/package.json': { name: 'linked', version: '1.0.0', jfdevelops: { skills: [{ name: 'escape', path: './skills/escape' }] } },
    });

    await mkdir(join(root, 'package/skills'));
    await symlink(join(root, 'outside/escape'), join(root, 'package/skills/escape'), 'junction');

    await expect(discoverPackageSkills(join(root, 'package'))).resolves.toMatchObject({
      skills: [],
      problems: ['Skill escape: path resolves outside the package'],
    });
  });
});
