import { mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createChangePlan } from '../plan/create.js';
import { createFixture } from '../testing/fixture.js';
import { createSkillDocument } from '../testing/skill-package.js';
import { createSkillInstallFiles, readSkillFiles } from './files.js';
import { parseSkillFrontmatter } from './frontmatter.js';

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
  it('plans one full copy and a stub for each agent with its own skill directory', async () => {
    const root = await createSkill();
    const owner = { type: 'skill' as const, name: 'jf-git' };
    const files = await createSkillInstallFiles({ name: 'jf-git', directory: join(root, 'skill') }, ['claude-code', 'codex']);
    const plan = await createChangePlan({ projectRoot: join(root, 'project'), owners: [owner], files });
    const stub = files.find((file) => file.path === '.claude/skills/jf-git/SKILL.md')?.content.toString();

    expect(plan.changes.map((change) => [change.path, change.action])).toEqual([
      ['.agents/skills/jf-git/SKILL.md', 'create'],
      ['.agents/skills/jf-git/references/commits.md', 'create'],
      ['.claude/skills/jf-git/SKILL.md', 'create'],
    ]);
    expect(plan.managedFiles.every((file) => file.owner.type === 'skill' && file.owner.name === 'jf-git')).toBe(true);
    expect(parseSkillFrontmatter(stub ?? '')).toEqual(parseSkillFrontmatter(createSkillDocument('jf-git')));
    expect(stub).toContain('Read and follow `.agents/skills/jf-git/SKILL.md`');
  });

  it.each([
    ['arguments', 'Fix issue $ARGUMENTS.\n'],
    ['positional arguments', 'Compare $0 with $1.\n'],
    ['skill directory variables', 'Run `${CLAUDE_SKILL_DIR}/scripts/render.sh`.\n'],
    ['inline command injection', '- Diff: !`git diff`\n'],
    ['block command injection', '```!\ngit status --short\n```\n'],
  ])('copies a skill using %s in full for Claude Code instead of a stub', async (_name, body) => {
    const fixture = await createFixture({
      'skill/SKILL.md': `${createSkillDocument('jf-git')}\n${body}`,
      'skill/scripts/render.sh': 'echo render\n',
    });

    fixtures.push(fixture);

    const files = await createSkillInstallFiles({ name: 'jf-git', directory: join(fixture.root, 'skill') }, ['claude-code']);

    expect(files.map((file) => file.path)).toEqual([
      '.agents/skills/jf-git/SKILL.md',
      '.agents/skills/jf-git/scripts/render.sh',
      '.claude/skills/jf-git/SKILL.md',
      '.claude/skills/jf-git/scripts/render.sh',
    ]);
    expect(files[2]?.content).toEqual(files[0]?.content);
  });

  it('copies a skill declaring named arguments in full for Claude Code', async () => {
    const fixture = await createFixture({ 'skill/SKILL.md': '---\nname: jf-git\ndescription: Use jf-git\narguments: [branch]\n---\n\nUse the branch.\n' });

    fixtures.push(fixture);

    const files = await createSkillInstallFiles({ name: 'jf-git', directory: join(fixture.root, 'skill') }, ['claude-code']);

    expect(files.map((file) => file.path)).toEqual(['.agents/skills/jf-git/SKILL.md', '.claude/skills/jf-git/SKILL.md']);
    expect(files[1]?.content).toEqual(files[0]?.content);
  });

  it('plans only the full copy when no selected agent needs a stub', async () => {
    const root = await createSkill();
    const files = await createSkillInstallFiles({ name: 'jf-git', directory: join(root, 'skill') }, ['cursor', 'copilot']);

    expect(files.map((file) => file.path)).toEqual(['.agents/skills/jf-git/SKILL.md', '.agents/skills/jf-git/references/commits.md']);
  });
});
