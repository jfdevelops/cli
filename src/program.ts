import { Command } from 'commander';
import { runCreate } from './commands/create/run.js';
import { runInit } from './commands/init/run.js';
import { runSkillsStatus } from './commands/skills/status.js';
import { runSkillsSync } from './commands/skills/sync.js';
import type { DependencyInstaller } from './dependencies/install.js';
import { createClackPrompter } from './prompts/clack.js';
import type { Prompter } from './prompts/prompter.js';

export type ProgramDependencies = {
  createPrompter: () => Prompter;
  isInteractive: () => boolean;
  installDependency?: DependencyInstaller;
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
    .command('create')
    .description('Create a new app or library from a reviewed template')
    .argument('[directory]', 'project destination')
    .action(async (directory: string | undefined) => {
      if (!dependencies.isInteractive()) {
        program.error('jfdevelops create is interactive; run it in a terminal.');
      }

      const status = await runCreate({
        ...(directory ? { directory } : {}),
        version,
        prompter: dependencies.createPrompter(),
        ...(dependencies.installDependency ? { installDependency: dependencies.installDependency } : {}),
      });

      if (status === 'incomplete' || status === 'failed') {
        process.exitCode = 1;
      }
    });

  program
    .command('init')
    .description('Adopt an existing project: choose skills and review every change before it is applied')
    .argument('[directory]', 'project directory', '.')
    .action(async (directory: string) => {
      if (!dependencies.isInteractive()) {
        program.error('jfdevelops init is interactive; run it in a terminal.');
      }

      const status = await runInit({
        directory,
        version,
        prompter: dependencies.createPrompter(),
        ...(dependencies.installDependency ? { installDependency: dependencies.installDependency } : {}),
      });

      if (status === 'incomplete' || status === 'failed') {
        process.exitCode = 1;
      }
    });

  const skills = program
    .command('skills')
    .description('Show whether enabled skills match the installed package versions')
    .argument('[directory]', 'project directory', '.')
    .option('--check', 'exit with code 1 when skills need syncing')
    .action(async (directory: string, options: { check?: boolean }) => {
      const status = await runSkillsStatus({ directory, prompter: dependencies.createPrompter() });

      if (status === 'failed' || (options.check && status === 'out-of-sync')) {
        process.exitCode = 1;
      }
    });

  skills
    .command('sync')
    .description('Update skill copies to the installed versions, reviewing local edits first')
    .argument('[directory]', 'project directory', '.')
    .action(async (directory: string) => {
      if (!dependencies.isInteractive()) {
        program.error('jfdevelops skills sync is interactive; run it in a terminal.');
      }

      const status = await runSkillsSync({ directory, prompter: dependencies.createPrompter() });

      if (status === 'incomplete' || status === 'failed') {
        process.exitCode = 1;
      }
    });

  program.action(() => {
    program.help();
  });

  return program;
}
