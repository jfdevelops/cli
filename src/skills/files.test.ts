import { mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createChangePlan } from '../plan/create.js';
import { createFixture } from '../testing/fixture.js';
import { createSkillDocument } from '../testing/skill-package.js';
import { createSkillInstallFiles, readSkillFiles } from './files.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

async function createSkill() {
  const fixture = await createFixture({
    'skill/SKILL.md': createSkillDocument('jf-git'),
    'skill/references/commits.md': '# Commits\n',
    'project/package.json': { name: 'project' },
  });

  fixtures.push(fixture);

  return fixture.root;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('readSkillFiles', () => {
  it('reads nested resources with POSIX paths', async () => {
    const root = await createSkill();
    const files = await readSkillFiles(join(root, 'skill'));

    expect([...files.keys()]).toEqual(['SKILL.md', 'references/commits.md']);
    expect(files.get('references/commits.md')?.toString()).toBe('# Commits\n');
  });

  it('rejects linked resources', async () => {
    const root = await createSkill();

    await mkdir(join(root, 'elsewhere'));
    await symlink(join(root, 'elsewhere'), join(root, 'skill/linked'), 'junction');

    await expect(readSkillFiles(join(root, 'skill'))).rejects.toThrow('Unsupported skill resource: linked');
  });
});

describe('createSkillInstallFiles', () => {
  it('plans a copy of the skill for every agent directory', async () => {
    const root = await createSkill();
    const owner = { type: 'skill' as const, name: 'jf-git' };
    const files = await createSkillInstallFiles({ name: 'jf-git', directory: join(root, 'skill') }, ['.agents/skills', '.claude/skills']);
    const plan = await createChangePlan({ projectRoot: join(root, 'project'), owners: [owner], files });

    expect(plan.changes.map((change) => [change.path, change.action])).toEqual([
      ['.agents/skills/jf-git/SKILL.md', 'create'],
      ['.agents/skills/jf-git/references/commits.md', 'create'],
      ['.claude/skills/jf-git/SKILL.md', 'create'],
      ['.claude/skills/jf-git/references/commits.md', 'create'],
    ]);
    expect(plan.managedFiles.every((file) => file.owner.type === 'skill' && file.owner.name === 'jf-git')).toBe(true);
  });
});
