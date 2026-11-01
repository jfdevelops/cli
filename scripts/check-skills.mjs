import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(resolve(root, 'jfdevelops.json'), 'utf8'));
const required = ['jf-naming-conventions', 'jf-coding-conventions', 'jf-git'];

async function collectPaths(directory, prefix = '') {
  const paths = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;

    assert(!entry.isSymbolicLink(), `Unexpected skill symlink: ${path}`);

    if (entry.isDirectory()) {
      paths.push(...await collectPaths(resolve(directory, entry.name), path));
    } else {
      assert(entry.isFile(), `Unexpected skill resource: ${path}`);
      paths.push(path);
    }
  }

  return paths.sort();
}

function sha256(content) {

  return createHash('sha256').update(content).digest('hex');
}

// Matches @jfdevelops/skills: the skill digest hashes `<file hash>  <path>` lines
// for every resource, sorted by path code units.
function skillDigest(files) {
  const manifest = Object.keys(files)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((path) => `${files[path]}  ${path}\n`)
    .join('');

  return sha256(manifest);
}

assert.equal(config.schemaVersion, 1);
assert.deepEqual(config.skills.map((skill) => skill.name).sort(), [...required].sort());

for (const skill of config.skills) {
  assert.equal(skill.required, true);
  assert.equal(skill.source.package, '@jfdevelops/skills');
  assert.equal(skill.source.version, '0.1.0');
  assert.equal(skill.source.path, `./skills/${skill.name}`);
  assert.equal(skill.sha256, skillDigest(skill.files), `Skill digest differs: ${skill.name}`);

  for (const directory of ['.agents/skills', '.claude/skills', '.cursor/skills', '.github/skills']) {
    assert.deepEqual(await collectPaths(resolve(root, directory, skill.name)), Object.keys(skill.files).sort());

    for (const [path, expected] of Object.entries(skill.files)) {
      const content = await readFile(resolve(root, directory, skill.name, path));
      assert.equal(sha256(content), expected, `Skill content differs: ${directory}/${skill.name}/${path}`);
    }
  }

  const instructions = await readFile(resolve(root, 'AGENTS.md'), 'utf8');

  assert(instructions.includes(`.agents/skills/${skill.name}/SKILL.md`));
}

for (const directory of ['.agents/skills', '.claude/skills', '.cursor/skills', '.github/skills']) {
  const names = await readdir(resolve(root, directory));

  assert(!names.includes('jf-git-workflow') && !names.includes('jf-commit-conventions'), 'Retired Git skills must be removed');
}

for (const path of ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md', '.cursor/rules/jfdevelops.mdc']) {
  assert((await readFile(resolve(root, path), 'utf8')).includes('AGENTS.md'));
}

console.log('Verified all required conventions, provenance, and agent discovery copies.');
