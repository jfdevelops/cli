import { readdir } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runInit } from '../commands/init/run.js';
import { createFixture } from '../testing/fixture.js';
import { createClackPrompter } from './clack.js';
import { PromptCancelledError } from './prompter.js';

const keys = { enter: '\r', down: '\u001b[B', space: ' ', escape: '\u001b', interrupt: '\u0003' };

// Real Clack prompts reading simulated keystrokes and rendering to a captured stream.
function createTerminal() {
  const input = new PassThrough();
  const output = new PassThrough();
  let rendered = '';

  output.setEncoding('utf8');
  output.on('data', (chunk: string) => {
    rendered += chunk;
  });

  return {
    prompter: createClackPrompter({ input, output }),
    // Waits for the prompt to render before each keystroke, as a person would.
    type: async (...sequence: string[]) => {
      for (const key of sequence) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        input.write(key);
      }
    },
    getOutput: () => rendered,
    waitFor: async (text: string) => {
      while (!rendered.includes(text)) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
  };
}

describe('createClackPrompter', () => {
  it('answers select, multiselect, text, and confirm prompts from the keyboard', async () => {
    const terminal = createTerminal();
    const choices = [
      { value: 'app', label: 'App' },
      { value: 'library', label: 'Library' },
    ];
    const select = terminal.prompter.select({ message: 'Kind?', choices });

    await terminal.type(keys.down, keys.enter);
    await expect(select).resolves.toBe('library');

    const multiselect = terminal.prompter.multiselect({ message: 'Skills?', choices, initialValues: ['app'] });

    await terminal.type(keys.down, keys.space, keys.enter);
    await expect(multiselect).resolves.toEqual(['app', 'library']);

    const text = terminal.prompter.text({ message: 'Name?', initialValue: 'shop' });

    await terminal.type('s', keys.enter);
    await expect(text).resolves.toBe('shops');

    const confirm = terminal.prompter.confirm({ message: 'Apply?', initialValue: true });

    await terminal.type(keys.enter);
    await expect(confirm).resolves.toBe(true);
    expect(terminal.getOutput()).toContain('Kind?');
  });

  it.each([
    ['Escape', keys.escape],
    ['Ctrl+C', keys.interrupt],
  ])('turns %s into a cancellation', async (_name, key) => {
    const terminal = createTerminal();
    const confirm = terminal.prompter.confirm({ message: 'Apply these changes?' });

    await terminal.type(key);
    await expect(confirm).rejects.toBeInstanceOf(PromptCancelledError);
  });

  it('cancels a whole command from the keyboard without writing anything', async () => {
    const fixture = await createFixture({ 'package.json': { name: 'shop', private: true, packageManager: 'pnpm@10.28.1', dependencies: { next: '15.0.0' } } });
    const terminal = createTerminal();

    try {
      const status = runInit({ directory: fixture.root, version: '0.1.0', prompter: terminal.prompter, installDependency: async () => undefined });

      await terminal.waitFor('Use these target types?');
      await terminal.type(keys.escape);
      await expect(status).resolves.toBe('cancelled');
      expect(terminal.getOutput()).toContain('Init cancelled. No files were changed.');
      expect(await readdir(fixture.root)).toEqual(['package.json']);
    } finally {
      await fixture.remove();
    }
  });

  it('writes messages to the given output', () => {
    const terminal = createTerminal();

    terminal.prompter.intro('jfdevelops test');
    terminal.prompter.warn('Careful');
    terminal.prompter.outro('Done');

    expect(terminal.getOutput()).toMatch(/jfdevelops test[\s\S]*Careful[\s\S]*Done/);
  });
});
