import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runCommand } from './run.js';

describe('runCommand', () => {
  it('runs package manager shims and captures output', async () => {
    await expect(runCommand('npm', ['--version'], { cwd: tmpdir(), captureOutput: true })).resolves.toMatch(/^\d+\.\d+\.\d+/);
  });

  it('passes arguments with spaces and punctuation intact', async () => {
    const output = await runCommand('node', ['-e', 'console.log(process.argv[1])', 'chore(init): initialize project'], { cwd: tmpdir(), captureOutput: true });

    expect(output.trim()).toBe('chore(init): initialize project');
  });

  it('rejects when the command fails', async () => {
    await expect(runCommand('node', ['-e', 'process.exit(3)'], { cwd: tmpdir() })).rejects.toThrow('exited with code 3');
  });
});
