import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const workspace = await mkdtemp(join(tmpdir(), 'jfdevelops-cli-package-'));
const isWindows = process.platform === 'win32';
// pnpm exports npm_config_* variables that npm warns about when it runs as a child process.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^npm_config_/i.test(name)));

function run(command, args, cwd) {

  return execFileSync(command, args, { cwd, env, encoding: 'utf8', shell: isWindows, stdio: ['ignore', 'pipe', 'inherit'] });
}

try {
  run('pnpm', ['pack', '--pack-destination', workspace], root);

  const tarball = (await readdir(workspace)).find((name) => name.endsWith('.tgz'));

  assert(tarball, 'pnpm pack did not produce a tarball');

  await writeFile(join(workspace, 'package.json'), '{ "name": "package-check", "private": true }\n');
  run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', `./${tarball}`], workspace);

  const executable = join(workspace, 'node_modules', '.bin', isWindows ? 'jfdevelops.cmd' : 'jfdevelops');
  const version = run(executable, ['--version'], workspace).trim();
  const help = run(executable, ['--help'], workspace);

  assert.equal(version, manifest.version);
  assert.match(help, /Usage: jfdevelops/);
  console.log(`Verified the packed ${manifest.name}@${version} executable.`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}
