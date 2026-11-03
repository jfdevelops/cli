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

  it('prints help listing create and init when no command is given', async () => {
    const { output, error } = await runProgram([]);

    expect(output).toContain('Usage: jfdevelops [options] [command]');
    expect(output).toMatch(/create \[directory\]\s+Create a new app or library/);
    expect(output).toMatch(/init \[directory\]\s+Adopt an existing project/);
    expect(error).toMatchObject({ exitCode: 0 });
  });

  it('rejects unknown options', async () => {
    const { output, error } = await runProgram(['--nope']);

    expect(output).toContain("unknown option '--nope'");
    expect(error).toMatchObject({ exitCode: 1 });
  });
});

describe('create command', () => {
  it('routes a destination through the create flow', async () => {
    const fixture = await createFixture({});
    const destination = join(fixture.root, 'site');
    const { prompter, transcript } = createScriptedPrompter((question) => {
      if (question.kind === 'text') {

        return 'site';
      }

      if (question.kind === 'confirm') {

        return false;
      }

      if (question.kind === 'multiselect') {

        return [];
      }

      return question.initialValue ?? question.choices[0]?.value ?? '';
    });

    fixtures.push(fixture);

    await runProgram(['create', destination], { createPrompter: () => prompter, isInteractive: () => true, installDependency: async () => undefined });

    expect(transcript[0]).toBe('intro: jfdevelops create');
    expect(transcript.at(-1)).toBe('cancel: Project creation cancelled. No files were changed.');
    expect(existsSync(destination)).toBe(false);
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

    await runProgram(['init', fixture.root], { createPrompter: () => prompter, isInteractive: () => true, installDependency: async () => undefined });

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

describe('skills command', () => {
  async function createConfiguredProject() {
    const fixture = await createFixture({
      'package.json': { name: 'site', private: true },
      'jfdevelops.json': {
        schemaVersion: 1,
        generator: { package: '@jfdevelops/cli', version: '0.1.0' },
        project: { name: 'site', packageManager: 'npm' },
      },
    });

    fixtures.push(fixture);

    return fixture.root;
  }

  it('reports status without a terminal and fails --check when out of sync', async () => {
    const projectRoot = await createConfiguredProject();
    const { prompter, transcript } = createScriptedPrompter(() => 'cancel');
    const dependencies = { createPrompter: () => prompter, isInteractive: () => false };

    await runProgram(['skills', projectRoot], dependencies);

    expect(transcript[0]).toBe('intro: jfdevelops skills');
    expect(transcript.at(-1)).toBe('outro: Run jfdevelops skills sync to review and apply updates.');
    expect(process.exitCode).toBeUndefined();

    await runProgram(['skills', projectRoot, '--check'], dependencies);

    expect(process.exitCode).toBe(1);
  });

  it('lists additions without a terminal but requires one to add', async () => {
    const projectRoot = await createConfiguredProject();
    const { prompter, transcript } = createScriptedPrompter(() => 'cancel');
    const dependencies = { createPrompter: () => prompter, isInteractive: () => false };

    await runProgram(['add', '--list', '--directory', projectRoot], dependencies);

    expect(transcript[0]).toBe('intro: jfdevelops add --list');
    expect(transcript.some((line) => line.startsWith('note [Available additions]'))).toBe(true);

    const { output, error } = await runProgram(['add', 'skill', 'jf-git', '--directory', projectRoot], dependencies);

    expect(output).toContain('jfdevelops add is interactive; run it in a terminal, or use add --list.');
    expect(error).toMatchObject({ exitCode: 1 });
  });

  it('routes sync and refuses to run it without a terminal', async () => {
    const projectRoot = await createConfiguredProject();
    const { prompter } = createScriptedPrompter(() => 'cancel');
    const { output, error } = await runProgram(['skills', 'sync', projectRoot], { createPrompter: () => prompter, isInteractive: () => false });

    expect(output).toContain('jfdevelops skills sync is interactive; run it in a terminal.');
    expect(error).toMatchObject({ exitCode: 1 });
  });
});
