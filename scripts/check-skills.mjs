import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(resolve(root, 'jfdevelops.json'), 'utf8'));
const required = ['jf-naming-conventions', 'jf-coding-conventions', 'jf-commit-conventions'];

assert.equal(config.schemaVersion, 1);
assert.deepEqual(config.skills.map((skill) => skill.name).sort(), [...required].sort());

for (const skill of config.skills) {
  assert.equal(skill.required, true);
  assert.equal(skill.source.package, '@jfdevelops/skills');
  assert.equal(skill.source.version, '0.1.0');
  assert.equal(skill.source.path, `./skills/${skill.name}`);

  for (const directory of ['.agents/skills', '.claude/skills', '.cursor/skills', '.github/skills']) {
    const content = await readFile(resolve(root, directory, skill.name, 'SKILL.md'), 'utf8');
    const digest = createHash('sha256').update(content).digest('hex');

    assert.equal(digest, skill.sha256, `Skill content differs: ${directory}/${skill.name}`);
  }

  const instructions = await readFile(resolve(root, 'AGENTS.md'), 'utf8');

  assert(instructions.includes(`.agents/skills/${skill.name}/SKILL.md`));
}

for (const path of ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md', '.cursor/rules/jfdevelops.mdc']) {
  assert((await readFile(resolve(root, path), 'utf8')).includes('AGENTS.md'));
}

console.log('Verified all three required conventions, provenance, and agent discovery copies.');
