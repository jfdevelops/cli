import { describe, expect, it } from 'vitest';
import { createProgram } from './program.js';

function runProgram(args: string[]) {
  const program = createProgram('1.2.3');
  let output = '';

  program.exitOverride().configureOutput({
    writeOut: (text) => {
      output += text;
    },
    writeErr: (text) => {
      output += text;
    },
  });

  try {
    program.parse(args, { from: 'user' });
  } catch (error) {

    return { output, error };
  }

  return { output, error: undefined };
}

describe('createProgram', () => {
  it('prints the version', () => {
    const { output, error } = runProgram(['--version']);

    expect(output).toBe('1.2.3\n');
    expect(error).toMatchObject({ code: 'commander.version', exitCode: 0 });
  });

  it('prints help when no command is given', () => {
    const { output, error } = runProgram([]);

    expect(output).toContain('Usage: jfdevelops [options]');
    expect(error).toMatchObject({ exitCode: 0 });
  });

  it('rejects unknown options', () => {
    const { output, error } = runProgram(['--nope']);

    expect(output).toContain("unknown option '--nope'");
    expect(error).toMatchObject({ exitCode: 1 });
  });
});
