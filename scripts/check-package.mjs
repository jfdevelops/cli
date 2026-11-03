import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const workspace = await mkdtemp(join(tmpdir(), 'jfdevelops-cli-package-'));
const project = join(workspace, 'project');
const isWindows = process.platform === 'win32';
// pnpm exports npm_config_* variables that npm warns about when it runs as a child process.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^npm_config_/i.test(name)));
// Relative to the workspace so the shell never sees a temporary path with spaces.
const executable = join('node_modules', '.bin', isWindows ? 'jfdevelops.cmd' : 'jfdevelops');

function run(command, args, cwd) {

  return execFileSync(command, args, { cwd, env, encoding: 'utf8', shell: isWindows, stdio: ['ignore', 'pipe', 'inherit'] });
}

// Runs the installed CLI with piped stdio, so it never sees a terminal.
function runCli(args) {
  const result = spawnSync(executable, args, { cwd: workspace, env: { ...env, NO_COLOR: '1' }, encoding: 'utf8', shell: isWindows, stdio: 'pipe' });

  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function expectCli(args, expected) {
  const { status, output } = runCli(args);

  assert.equal(status, expected.status, `jfdevelops ${args.join(' ')} exited with ${status}:\n${output}`);

  for (const text of expected.output ?? []) {
    assert(output.includes(text), `jfdevelops ${args.join(' ')} output is missing "${text}":\n${output}`);
  }
}

try {
  run('pnpm', ['pack', '--pack-destination', workspace], root);

  const tarball = (await readdir(workspace)).find((name) => name.endsWith('.tgz'));

  assert(tarball, 'pnpm pack did not produce a tarball');

  await writeFile(join(workspace, 'package.json'), '{ "name": "package-check", "private": true }\n');
  run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', `./${tarball}`], workspace);
  await mkdir(project);
  await writeFile(join(project, 'package.json'), '{ "name": "project", "private": true }\n');
  await writeFile(
    join(project, 'jfdevelops.json'),
    `${JSON.stringify({ schemaVersion: 1, generator: { package: manifest.name, version: manifest.version }, project: { name: 'project', packageManager: 'npm' } }, null, 2)}\n`,
  );

  expectCli(['--version'], { status: 0, output: [manifest.version] });
  expectCli(['--help'], { status: 0, output: ['create [directory]', 'init [directory]', 'add [options]', 'skills [options] [directory]'] });
  expectCli(['unknown-command'], { status: 1, output: ["unknown command 'unknown-command'"] });

  // Read-only commands work without a terminal and report through their exit codes.
  expectCli(['skills', 'project'], { status: 0, output: ['No skills are enabled.', 'Run jfdevelops skills sync'] });
  expectCli(['skills', 'project', '--check'], { status: 1 });
  expectCli(['skills', 'missing-project'], { status: 1, output: ['No package.json found'] });
  expectCli(['add', '--list', '--directory', 'project'], { status: 0, output: ['jf-git', 'convex'] });

  // Interactive commands refuse to run rather than waiting for input that cannot arrive.
  for (const [args, name] of [
    [['create'], 'create'],
    [['create', 'skills'], 'create skills'],
    [['init', 'project'], 'init'],
    [['add', '--directory', 'project'], 'add'],
    [['add', 'skill', 'jf-git', '--directory', 'project'], 'add'],
    [['skills', 'sync', 'project'], 'skills sync'],
  ]) {
    expectCli(args, { status: 1, output: [`jfdevelops ${name} is interactive`] });
  }

  assert.deepEqual((await readdir(project)).sort(), ['jfdevelops.json', 'package.json'], 'Commands changed the project without confirmation');
  console.log(`Verified the packed ${manifest.name}@${manifest.version} executable and its non-interactive behavior.`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}
