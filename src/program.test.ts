import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProgram, type ProgramDependencies } from './program.js';
import { createFixture } from './testing/fixture.js';
import { createScriptedPrompter } from './testing/prompter.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];

async function runProgram(args: string[], dependencies?: ProgramDependencies) {
  const program = createProgram('1.2.3', dependencies);
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
    await program.parseAsync(args, { from: 'user' });
  } catch (error) {

    return { output, error };
  }

  return { output, error: undefined };
}

afterEach(async () => {
  process.exitCode = undefined;
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('createProgram', () => {
  it('prints the version', async () => {
    const { output, error } = await runProgram(['--version']);

    expect(output).toBe('1.2.3\n');
    expect(error).toMatchObject({ code: 'commander.version', exitCode: 0 });
  });

  it('prints help listing init when no command is given', async () => {
    const { output, error } = await runProgram([]);

    expect(output).toContain('Usage: jfdevelops [options] [command]');
    expect(output).toMatch(/init \[directory\]\s+Adopt an existing project/);
    expect(error).toMatchObject({ exitCode: 0 });
  });

  it('rejects unknown options', async () => {
    const { output, error } = await runProgram(['--nope']);

    expect(output).toContain("unknown option '--nope'");
    expect(error).toMatchObject({ exitCode: 1 });
  });
});

describe('init command', () => {
  it('refuses to run without a terminal', async () => {
    const { prompter } = createScriptedPrompter(() => 'cancel');
    const { output, error } = await runProgram(['init'], { createPrompter: () => prompter, isInteractive: () => false });

    expect(output).toContain('jfdevelops init is interactive; run it in a terminal.');
    expect(error).toMatchObject({ exitCode: 1 });
  });

  it('runs init in the given directory', async () => {
    const fixture = await createFixture({ 'package.json': { name: 'site', private: true, packageManager: 'npm@10.0.0', dependencies: { next: '15.0.0' } } });
    const { prompter, transcript } = createScriptedPrompter((question) => (question.kind === 'multiselect' ? [] : true));

    fixtures.push(fixture);

    await runProgram(['init', fixture.root], { createPrompter: () => prompter, isInteractive: () => true });

    expect(transcript[0]).toBe('intro: jfdevelops init');
    expect(transcript.at(-1)).toBe('outro: Project initialized.');
    expect(existsSync(join(fixture.root, 'jfdevelops.json'))).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it('sets a failing exit code when init fails', async () => {
    const fixture = await createFixture({});
    const { prompter } = createScriptedPrompter(() => true);

    fixtures.push(fixture);

    await runProgram(['init', fixture.root], { createPrompter: () => prompter, isInteractive: () => true });

    expect(process.exitCode).toBe(1);
  });
});
