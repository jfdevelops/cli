import type { DesiredFile } from '../../plan/create.js';
import { projectOwner } from './templates.js';

// An exact release, as setup-vp asks; its moving v1 tag no longer receives updates.
const setupVpVersion = 'v1.22.0';

export const affectedScriptPath = 'scripts/run-affected.mjs';

/**
 * Runs Vite+ tasks only where a change can matter: in the packages with changed files and the packages that
 * depend on them. Vite+ resolves the dependents and builds the packages they depend on first. A change outside
 * every package, such as the lockfile or root configuration, runs the tasks everywhere, as does a missing base.
 */
const affectedScript = `// Usage: BASE_SHA=<commit> node ${affectedScriptPath} <task>...
// Runs each task with Vite+ in the packages changed since BASE_SHA and in the packages that depend on them.
// A change outside every package, or a base that cannot be compared, runs the tasks in every package.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

const tasks = process.argv.slice(2);
const base = process.env.BASE_SHA ?? '';

// Files that no task reads.
const inertPatterns = [/\\.md$/, /^\\.agents\\//, /^\\.claude\\//, /^jfdevelops\\.json$/];

function readChangedFiles() {
  // GitHub reports an all-zero commit before the first push of a branch.
  if (base === '' || /^0+$/.test(base)) {

    return undefined;
  }

  try {
    const output = execFileSync('git', ['diff', '--name-only', \`\${base}...HEAD\`], { encoding: 'utf8' });

    return output.split('\\n').filter((file) => file !== '');
  } catch {

    return undefined;
  }
}

// The nearest directory with a package.json below the workspace root, or undefined for a root file.
function findPackageDirectory(file) {
  for (let directory = dirname(file); directory !== '.'; directory = dirname(directory)) {
    if (existsSync(\`\${directory}/package.json\`)) {

      return directory;
    }
  }

  return undefined;
}

function selectPackages() {
  const files = readChangedFiles()?.filter((file) => !inertPatterns.some((pattern) => pattern.test(file)));

  if (files === undefined) {

    return ['-r'];
  }

  const directories = files.map((file) => findPackageDirectory(file));

  if (directories.includes(undefined)) {

    return ['-r'];
  }

  return [...new Set(directories)].flatMap((directory) => ['--filter', \`...{\${directory}}\`]);
}

const selection = selectPackages();

if (selection.length === 0) {
  console.log('No packages are affected by this change.');
  process.exit(0);
}

console.log(\`Running \${tasks.join(', ')} with: \${selection.join(' ')}\`);

// The workspace's own Vite+ runs without a shell; a global vp, as setup-vp installs, is the fallback.
const localVp = 'node_modules/vite-plus/bin/vp';
const [command, ...prefix] = existsSync(localVp) ? [process.execPath, localVp] : ['vp'];

for (const task of tasks) {
  const result = spawnSync(command, [...prefix, 'run', ...selection, task], { stdio: 'inherit', shell: command === 'vp' && process.platform === 'win32' });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
`;

const workflow = `name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

# A newer push to a pull request cancels the run it replaces.
concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: \${{ github.event_name == 'pull_request' }}

jobs:
  check:
    name: Check affected packages
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      # Installs Vite+, Node.js, and the package manager in packageManager, then installs dependencies.
      - uses: voidzero-dev/setup-vp@${setupVpVersion}
        with:
          node-version: '24'
          cache: true
      # Task results from earlier runs; a task whose inputs are unchanged replays instead of running again.
      - name: Restore Vite Task cache
        id: vite-task-cache
        uses: actions/cache/restore@v6
        with:
          path: node_modules/.vite/task-cache
          key: vite-task-\${{ runner.os }}-\${{ runner.arch }}-\${{ github.run_id }}-\${{ github.run_attempt }}
          restore-keys: |
            vite-task-\${{ runner.os }}-\${{ runner.arch }}-
      - name: Check formatting
        run: vp run format:check
      - name: Typecheck, test, and build affected packages
        env:
          # A pull request compares with its base; a push to main compares with the commit before it.
          BASE_SHA: \${{ github.event.pull_request.base.sha || github.event.before }}
        run: node ${affectedScriptPath} typecheck test build
      - name: Save Vite Task cache
        if: success()
        uses: actions/cache/save@v6
        with:
          path: node_modules/.vite/task-cache
          key: \${{ steps.vite-task-cache.outputs.cache-primary-key }}
`;

/** The CI workflow and the script it uses to run tasks only in affected packages. */
export function createCiFiles(): DesiredFile[] {

  return [
    { path: '.github/workflows/ci.yml', owner: projectOwner, content: workflow },
    { path: affectedScriptPath, owner: projectOwner, content: affectedScript },
  ];
}
