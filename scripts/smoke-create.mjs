// Creates real projects for each template, formatter, and package manager combination, installing
// their dependencies and running the generated format:check and build scripts. Requires network access.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCreate } from '../dist/commands/create/run.js';
import { runCommand } from '../dist/process/run.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const workspace = await mkdtemp(join(tmpdir(), 'jfdevelops-smoke-'));
const combinations = [
  { name: 'prettier-app', kind: 'app', template: 'node-app', formatter: 'prettier', packageManager: 'pnpm', shouldInitializeGit: true, remoteUrl: 'git@github.com:jfdevelops/prettier-app.git' },
  { name: 'biome-library', kind: 'library', template: 'typescript-library', formatter: 'biome', packageManager: 'pnpm', shouldInitializeGit: false },
  { name: 'biome-app', kind: 'app', template: 'node-app', formatter: 'biome', packageManager: 'npm', shouldInitializeGit: false },
  { name: 'prettier-library', kind: 'library', template: 'typescript-library', formatter: 'prettier', packageManager: 'npm', shouldInitializeGit: false },
  { name: 'prettier-monorepo', kind: 'app', monorepo: true, template: 'node-app', formatter: 'prettier', packageManager: 'pnpm', shouldInitializeGit: true, libraries: ['utils'] },
  { name: 'biome-monorepo', kind: 'app', monorepo: true, template: 'node-app', formatter: 'biome', packageManager: 'npm', shouldInitializeGit: false },
  { name: 'prettier-library-workspace', kind: 'library', template: 'typescript-library', formatter: 'prettier', packageManager: 'pnpm', shouldInitializeGit: false, libraries: ['core', 'utils'] },
  { name: 'biome-library-workspace', kind: 'library', template: 'typescript-library', formatter: 'biome', packageManager: 'npm', shouldInitializeGit: false, libraries: ['core'] },
];

// Workspace layout prompts, answered by accepting their defaults as pressing Enter does.
const workspaceMessages = new Set([
  'What namespace should package names use? (type none for bare names)',
  'What should the app be called?',
  'Where should apps live?',
  'Where should libraries live?',
]);

// The foundation commit needs an identity on machines without Git configuration, such as CI runners.
for (const role of ['AUTHOR', 'COMMITTER']) {
  process.env[`GIT_${role}_NAME`] ??= 'jfdevelops smoke test';
  process.env[`GIT_${role}_EMAIL`] ??= 'smoke-test@jfdevelops.invalid';
}

function createPrompter(combination, transcript) {
  // Libraries are added one at a time, so each yes or no depends on how many names are left to give.
  const pending = [...(combination.libraries ?? [])];
  const packageAnswers = {
    'Do you want to add a package?': () => pending.length > 0,
    'Do you want to add a package? (this makes the project a workspace)': () => pending.length > 0,
    'What do you want to name this package?': () => pending.shift(),
    'Add another package?': () => pending.length > 0,
  };
  const answers = {
    'What is the package name?': combination.name,
    'What kind of project are you creating?': combination.kind,
    'Which template should be used?': combination.template,
    'Which package manager should be used?': combination.packageManager,
    'Which formatter should be used?': combination.formatter,
    'Initialize Git and create the foundation commit?': combination.shouldInitializeGit,
    'Git remote URL (optional, press Enter to skip)': combination.remoteUrl ?? '',
    'Create this project?': true,
  };
  const record = (kind) => (message) => transcript.push(`${kind}: ${message}`);

  function answer({ message, defaultValue }) {
    if ((combination.monorepo || combination.libraries) && workspaceMessages.has(message)) {

      return defaultValue;
    }

    if (message in packageAnswers) {

      return packageAnswers[message]();
    }

    assert(message in answers, `Unexpected prompt: ${message}`);

    return answers[message];
  }

  return {
    intro: record('intro'),
    outro: record('outro'),
    cancel: record('cancel'),
    note: record('note'),
    info: record('info'),
    warn: record('warn'),
    success: record('success'),
    error: record('error'),
    text: async (question) => answer(question),
    select: async (question) => answer(question),
    multiselect: async ({ message, initialValues }) => {
      if (message === 'Which coding agents should load the skills?') {

        return initialValues ?? [];
      }

      assert.equal(message, 'Which options should the project use?', `Unexpected prompt: ${message}`);

      return combination.monorepo ? ['monorepo'] : [];
    },
    confirm: async (question) => answer(question),
  };
}

try {
  await runCommand('pnpm', ['pack', '--pack-destination', workspace], { cwd: root, captureOutput: true });

  const tarball = join(workspace, (await readdir(workspace)).find((name) => name.endsWith('.tgz')) ?? '');

  for (const combination of combinations) {
    const directory = join(workspace, combination.name);
    const transcript = [];
    // The CLI version under test may not be published yet, so projects install the packed tarball instead.
    const installDependency = async ({ packageManager, isWorkspaceRoot }) => {
      const flags = packageManager === 'pnpm' && isWorkspaceRoot ? ['--workspace-root'] : [];

      await runCommand(packageManager, packageManager === 'npm' ? ['install', '--save-dev', tarball] : ['add', '--save-dev', ...flags, tarball], { cwd: directory });
    };

    console.log(`\n=== ${combination.name}: ${combination.template}, ${combination.formatter}, ${combination.packageManager}`);

    const status = await runCreate({ directory, version: manifest.version, prompter: createPrompter(combination, transcript), installDependency });

    assert.equal(status, 'complete', `${combination.name} finished as ${status}:\n${transcript.join('\n')}`);

    // Formatting must leave every CLI-managed file, including the AGENTS.md block, exactly as recorded.
    await runCommand('node', [join(root, 'dist/cli.js'), 'skills', directory, '--check'], { cwd: workspace, captureOutput: true });

    if (combination.monorepo) {
      // The root build script must have built the app inside the workspace.
      await readFile(join(directory, 'apps/web/dist/index.js'), 'utf8');
    }

    for (const library of combination.libraries ?? []) {
      await readFile(join(directory, 'packages', library, 'dist/index.js'), 'utf8');
    }

    if (combination.shouldInitializeGit) {
      const subject = await runCommand('git', ['log', '--format=%s'], { cwd: directory, captureOutput: true });
      const branch = await runCommand('git', ['branch', '--show-current'], { cwd: directory, captureOutput: true });

      assert.equal(subject.trim(), 'chore(init): initialize project');
      assert.equal(branch.trim(), 'main');

      const remotes = await runCommand('git', ['remote', '-v'], { cwd: directory, captureOutput: true });

      assert.deepEqual(
        remotes.trim().split(/\r?\n/).filter(Boolean),
        combination.remoteUrl ? [`origin\t${combination.remoteUrl} (fetch)`, `origin\t${combination.remoteUrl} (push)`] : [],
      );
    }
  }

  console.log(`\nCreated, formatted, and built ${combinations.length} projects with ${manifest.name}@${manifest.version}.`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}
