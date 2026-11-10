import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as processRunner from '../../process/run.js';
import { formatCreatedProject, initializeProjectGit, isGitRemoteUrl, verifyCreatedProject } from './lifecycle.js';

const directories: string[] = [];

beforeEach(() => {
  vi.stubEnv('GIT_AUTHOR_NAME', 'Test');
  vi.stubEnv('GIT_AUTHOR_EMAIL', 'test@example.com');
  vi.stubEnv('GIT_COMMITTER_NAME', 'Test');
  vi.stubEnv('GIT_COMMITTER_EMAIL', 'test@example.com');
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('project formatting', () => {
  it.each([
    ['prettier', 'pnpm'], ['biome', 'pnpm'], ['prettier', 'npm'], ['biome', 'npm'],
  ] as const)('ignores unsupported files with %s via %s in write and check modes', async (formatter, packageManager) => {
    const runCommand = vi.spyOn(processRunner, 'runCommand').mockResolvedValue('');
    const options = { directory: '/project', packageManager, formatter, paths: ['.gitignore', '.prettierignore', 'src/index.ts'] };
    const ignoreFlag = formatter === 'prettier' ? '--ignore-unknown' : '--files-ignore-unknown=true';

    await formatCreatedProject(options);
    await verifyCreatedProject(options);

    const formatterCalls = runCommand.mock.calls.filter(([, args]) => args.includes(formatter));

    expect(formatterCalls).toHaveLength(2);

    for (const [command, args, execution] of formatterCalls) {
      expect(command).toBe(packageManager);
      expect(args.slice(0, packageManager === 'npm' ? 2 : 1)).toEqual(packageManager === 'npm' ? ['exec', '--'] : ['exec']);
      expect(args).toContain(ignoreFlag);
      expect(args.slice(-3)).toEqual(options.paths);
      expect(execution).toEqual({ cwd: options.directory });
    }

    expect(formatterCalls[0]?.[1]).toContain('--write');
    expect(formatterCalls[1]?.[1]).not.toContain('--write');
  });
});

describe('isGitRemoteUrl', () => {
  it.each(['https://github.com/acme/site.git', 'http://git.local/acme/site', 'ssh://git@github.com/acme/site.git', 'git@github.com:acme/site.git', 'deploy@host.example.com:srv/site.git'])(
    'accepts %s',
    (url) => {
      expect(isGitRemoteUrl(url)).toBe(true);
    },
  );

  it.each(['', 'not a url', 'github.com/acme/site', 'https://github.com', '-oProxyCommand=x@host:path', 'git@github.com', 'https://github.com/acme/site .git'])('rejects %s', (url) => {
    expect(isGitRemoteUrl(url)).toBe(false);
  });
});

describe('initializeProjectGit', () => {
  it('creates the foundation commit and adds only the origin remote when given a URL', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jf-git-'));

    directories.push(directory);
    await writeFile(join(directory, 'README.md'), '# site\n');

    await initializeProjectGit(directory, 'git@github.com:acme/site.git');

    const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();

    expect(git('remote', '-v').split('\n')).toEqual(['origin\tgit@github.com:acme/site.git (fetch)', 'origin\tgit@github.com:acme/site.git (push)']);
    expect(git('log', '--format=%s')).toBe('chore(init): initialize project');
    expect(git('branch', '--show-current')).toBe('main');
  });

  it('adds no remote without a URL', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jf-git-'));

    directories.push(directory);
    await writeFile(join(directory, 'README.md'), '# site\n');
    await initializeProjectGit(directory);

    expect(execFileSync('git', ['remote'], { cwd: directory, encoding: 'utf8' }).trim()).toBe('');
  });
});
