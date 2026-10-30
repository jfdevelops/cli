import { Command } from 'commander';
import { runInit } from './commands/init/run.js';
import { createClackPrompter } from './prompts/clack.js';
import type { Prompter } from './prompts/prompter.js';

export type ProgramDependencies = {
  createPrompter: () => Prompter;
  isInteractive: () => boolean;
};

const defaultDependencies: ProgramDependencies = {
  createPrompter: createClackPrompter,
  isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
};

export function createProgram(version: string, dependencies = defaultDependencies) {
  const program = new Command('jfdevelops')
    .description('Project setup and skill discovery for jfdevelops projects')
    .version(version, '-v, --version', 'Show the CLI version')
    .helpOption('-h, --help', 'Show command help')
    .helpCommand(false);

  program
    .command('init')
    .description('Adopt an existing project: choose skills and review every change before it is applied')
    .argument('[directory]', 'project directory', '.')
    .action(async (directory: string) => {
      if (!dependencies.isInteractive()) {
        program.error('jfdevelops init is interactive; run it in a terminal.');
      }

      const status = await runInit({ directory, version, prompter: dependencies.createPrompter() });

      if (status === 'incomplete' || status === 'failed') {
        process.exitCode = 1;
      }
    });

  program.action(() => {
    program.help();
  });

  return program;
}
