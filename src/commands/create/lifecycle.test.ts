import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeProjectGit, isGitRemoteUrl } from './lifecycle.js';

const directories: string[] = [];

beforeEach(() => {
  vi.stubEnv('GIT_AUTHOR_NAME', 'Test');
  vi.stubEnv('GIT_AUTHOR_EMAIL', 'test@example.com');
  vi.stubEnv('GIT_COMMITTER_NAME', 'Test');
  vi.stubEnv('GIT_COMMITTER_EMAIL', 'test@example.com');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
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
