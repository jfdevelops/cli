import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const skillsPackageRoot = dirname(require.resolve('@jfdevelops/skills/package.json'));
const skillsManifest = JSON.parse(await readFile(resolve(skillsPackageRoot, 'package.json'), 'utf8'));
const packageManifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const config = JSON.parse(await readFile(resolve(root, 'jfdevelops.json'), 'utf8'));
const required = skillsManifest.jfdevelops.skills.map((skill) => skill.name).sort();
const dependencyVersion = packageManifest.dependencies['@jfdevelops/skills'];

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

assert.equal(skillsManifest.name, '@jfdevelops/skills');
assert.equal(dependencyVersion, skillsManifest.version, `package.json depends on @jfdevelops/skills@${dependencyVersion} but node_modules has ${skillsManifest.version}`);

for (const skill of skillsManifest.jfdevelops.skills) {
  assert.equal(skill.path, `./skills/${skill.name}`);
}

assert.equal(config.schemaVersion, 1);
assert.deepEqual(config.skills.map((skill) => skill.name).sort(), required);

for (const skill of config.skills) {
  assert.equal(skill.required, true);
  assert.equal(skill.source.package, '@jfdevelops/skills');
  assert.equal(skill.source.version, skillsManifest.version);
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
  assert.deepEqual([...names].sort(), required);
}

for (const path of ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md', '.cursor/rules/jfdevelops.mdc']) {
  assert((await readFile(resolve(root, path), 'utf8')).includes('AGENTS.md'));
}

const siblingManifestPath = resolve(root, '../skills/package.json');

if (existsSync(siblingManifestPath)) {
  const siblingManifest = JSON.parse(await readFile(siblingManifestPath, 'utf8'));
  const siblingSkills = siblingManifest.jfdevelops.skills.map((skill) => skill.name).sort();

  assert.equal(
    siblingManifest.version,
    dependencyVersion,
    `Sibling skills repo is ${siblingManifest.version} but this package depends on ${dependencyVersion}. Bump @jfdevelops/skills and run pnpm skills:sync.`,
  );
  assert.deepEqual(
    siblingSkills,
    required,
    'Sibling skills repo skill list differs from the installed @jfdevelops/skills package. Bump the dependency and run pnpm skills:sync.',
  );

  const sync = spawnSync(process.execPath, [resolve(root, '../skills/scripts/sync-agent-skills.mjs'), '.', '--check'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(sync.status, 0, sync.stderr || sync.stdout || 'Sibling skills:sync --check failed');
}

console.log(`Verified ${required.length} required skills from @jfdevelops/skills@${skillsManifest.version}, provenance, and agent discovery copies.`);
