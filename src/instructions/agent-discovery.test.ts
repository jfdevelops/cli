import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runInit } from '../commands/init/run.js';
import { readProjectConfig } from '../config/read.js';
import { hashContent } from '../plan/hash.js';
import { agentSkillDirectories } from '../skills/agent-directories.js';
import { readSkillFiles } from '../skills/files.js';
import { parseSkillFrontmatter } from '../skills/frontmatter.js';
import { createFixture } from '../testing/fixture.js';
import { createScriptedPrompter } from '../testing/prompter.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

// Native discovery itself depends on each agent; this verifies the files every supported adapter reads.
describe('agent discovery adapters', () => {
  it('give every agent identical, discoverable skills reachable from its instructions', async () => {
    const fixture = await createFixture({
      'package.json': { name: 'shop', private: true, packageManager: 'pnpm@10.28.1' },
      'CLAUDE.md': '# Claude\n',
      'GEMINI.md': '# Gemini\n',
      '.github/copilot-instructions.md': '# Copilot\n',
    });
    const { prompter, transcript } = createScriptedPrompter((question) => {
      if (question.kind === 'multiselect') {

        return [];
      }

      if (question.kind === 'confirm') {

        return true;
      }

      if (question.kind === 'text') {

        return question.defaultValue ?? '';
      }

      return question.initialValue ?? (question.kind === 'select' ? (question.choices[0]?.value ?? '') : '');
    });

    fixtures.push(fixture);

    const status = await runInit({ directory: fixture.root, version: '0.1.0', prompter, installDependency: async () => undefined });

    expect(status, transcript.join('\n')).toBe('complete');

    const config = await readProjectConfig(fixture.root);
    const skillNames = config?.skills.map((skill) => skill.name) ?? [];

    expect(skillNames).toEqual(['jf-coding-conventions', 'jf-git', 'jf-naming-conventions']);

    for (const name of skillNames) {
      const [reference, ...others] = await Promise.all(agentSkillDirectories.map((directory) => readSkillFiles(join(fixture.root, directory, name))));
      const referenceHashes = [...(reference ?? new Map()).entries()].map(([path, content]) => [path, hashContent(content)]);

      for (const copy of others) {
        expect([...copy.entries()].map(([path, content]) => [path, hashContent(content)])).toEqual(referenceHashes);
      }

      expect(parseSkillFrontmatter(reference?.get('SKILL.md')?.toString('utf8') ?? '').name).toBe(name);
    }

    const instructions = await readFile(join(fixture.root, 'AGENTS.md'), 'utf8');
    const links = [...instructions.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1] ?? '');

    expect(links.sort()).toEqual(skillNames.map((name) => `.agents/skills/${name}/SKILL.md`));
    expect(links.every((link) => existsSync(join(fixture.root, link)))).toBe(true);

    for (const pointer of ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md']) {
      expect(await readFile(join(fixture.root, pointer), 'utf8')).toContain('Read AGENTS.md');
    }
  });
});
