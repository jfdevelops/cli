import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from '../process/run.js';
import { loadUpstreamSkills } from './upstream.js';

vi.mock('../process/run.js', () => ({ runCommand: vi.fn() }));

afterEach(() => {
  vi.resetAllMocks();
});

describe('loadUpstreamSkills', () => {
  it('reads the declared skills and resources from one main checkout, then removes it', async () => {
    let temporary = '';

    vi.mocked(runCommand).mockImplementation(async (_command, args, options) => {
      if (args.includes('clone')) {
        temporary = options.cwd;
        const directory = args.at(-1)!;

        await mkdir(join(directory, 'skills/jf-git/references'), { recursive: true });
        await writeFile(join(directory, 'package.json'), JSON.stringify({
          name: '@jfdevelops/skills', version: '1.0.0', jfdevelops: { skills: [{ name: 'jf-git', path: './skills/jf-git' }] },
        }));
        await writeFile(join(directory, 'skills/jf-git/SKILL.md'), '---\nname: jf-git\ndescription: Git conventions\n---\n\nCurrent');
        await writeFile(join(directory, 'skills/jf-git/references/branches.md'), 'branches');

        return '';
      }

      return 'abc123\n';
    });

    const upstream = await loadUpstreamSkills();

    expect(upstream.revision).toBe('abc123');
    expect(upstream.skills.get('jf-git')?.get('references/branches.md')?.toString()).toBe('branches');
    expect(vi.mocked(runCommand).mock.calls[0]?.[1]).toEqual(expect.arrayContaining(['--branch', 'main', 'https://github.com/jfdevelops/skills.git']));
    expect(existsSync(temporary)).toBe(false);
  });

  it('cleans up temporary files when cloning fails', async () => {
    let temporary = '';

    vi.mocked(runCommand).mockImplementation(async (_command, _args, options) => {
      temporary = options.cwd;
      throw new Error('clone failed');
    });

    await expect(loadUpstreamSkills()).rejects.toThrow('clone failed');
    expect(existsSync(temporary)).toBe(false);
  });
});
