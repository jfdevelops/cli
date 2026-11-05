import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFixture } from '../../testing/fixture.js';
import { createScriptedPrompter } from '../../testing/prompter.js';
import { runSkillsOutdated } from './outdated.js';

const fixtures: Awaited<ReturnType<typeof createFixture>>[] = [];

async function createProject(files: Record<string, string>) {
  const fixture = await createFixture(files);

  fixtures.push(fixture);

  return fixture.root;
}

function createUpstream(files: Record<string, string> = { 'SKILL.md': 'current' }) {

  return vi.fn(async () => ({
    revision: 'abc123',
    skills: new Map([['jf-git', new Map(Object.entries(files).map(([path, content]) => [path, Buffer.from(content)]))]]),
  }));
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('runSkillsOutdated', () => {
  it('compares project copies directly without requiring jfdevelops.json or installed packages', async () => {
    const directory = await createProject({ '.agents/skills/jf-git/SKILL.md': 'current' });
    const { prompter, transcript } = createScriptedPrompter(() => { throw new Error('Must not prompt'); });

    await expect(runSkillsOutdated({ directory, prompter, loadUpstream: createUpstream() })).resolves.toBe('current');
    expect(transcript).toContain('note [Installed skills]: jf-git  current');
    expect(transcript).toContain('info: Compared with jfdevelops/skills main at abc123.');
  });

  it('detects edited, missing, and extra resources without modifying local files', async () => {
    const directory = await createProject({
      '.agents/skills/jf-git/SKILL.md': 'edited locally',
      '.agents/skills/jf-git/old.md': 'extra',
    });
    const { prompter, transcript } = createScriptedPrompter(() => false);
    const loadUpstream = createUpstream({ 'SKILL.md': 'current', 'references/branches.md': 'new reference' });

    await expect(runSkillsOutdated({ directory, prompter, loadUpstream })).resolves.toBe('outdated');
    expect(transcript.join('\n')).toContain('differs: SKILL.md, old.md, references/branches.md');
    expect(await readFile(join(directory, '.agents/skills/jf-git/SKILL.md'), 'utf8')).toBe('edited locally');
  });

  it('detects a change only in a bundled reference', async () => {
    const directory = await createProject({ '.agents/skills/jf-git/SKILL.md': 'current', '.agents/skills/jf-git/references/branches.md': 'old' });
    const { prompter } = createScriptedPrompter(() => false);

    await expect(runSkillsOutdated({ directory, prompter, loadUpstream: createUpstream({ 'SKILL.md': 'current', 'references/branches.md': 'new' }) })).resolves.toBe('outdated');
  });

  it('reports skills absent from upstream without calling them current', async () => {
    const directory = await createProject({ '.agents/skills/custom/SKILL.md': 'custom' });
    const { prompter, transcript } = createScriptedPrompter(() => false);

    await expect(runSkillsOutdated({ directory, prompter, loadUpstream: createUpstream() })).resolves.toBe('current');
    expect(transcript).toContain('info: Not present in upstream; not compared: custom.');
    expect(transcript).toContain('outro: No installed skills could be compared with upstream main.');
  });

  it('does not access the network when no skills are installed', async () => {
    const directory = await createProject({});
    const loadUpstream = createUpstream();
    const { prompter } = createScriptedPrompter(() => false);

    await expect(runSkillsOutdated({ directory, prompter, loadUpstream })).resolves.toBe('current');
    expect(loadUpstream).not.toHaveBeenCalled();
  });

  it('reports upstream access failure instead of claiming skills are current', async () => {
    const directory = await createProject({ '.agents/skills/jf-git/SKILL.md': 'current' });
    const { prompter, transcript } = createScriptedPrompter(() => false);
    const loadUpstream = vi.fn(async () => { throw new Error('network unavailable'); });

    await expect(runSkillsOutdated({ directory, prompter, loadUpstream })).resolves.toBe('failed');
    expect(transcript).toContain('error: network unavailable');
  });
});
