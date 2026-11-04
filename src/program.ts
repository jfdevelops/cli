import { Command } from 'commander';
import { runAdd, runAddList, type AdditionKind } from './commands/add/run.js';
import type { PackedFileLister } from './authoring/packed-files.js';
import { runCreate } from './commands/create/run.js';
import { runCreateSkills } from './commands/create/skills.js';
import { runInit } from './commands/init/run.js';
import { runSkillsStatus } from './commands/skills/status.js';
import { runSkillsSync } from './commands/skills/sync.js';
import type { DependencyInstaller, PackageInstaller } from './dependencies/install.js';
import { createClackPrompter } from './prompts/clack.js';
import type { Prompter } from './prompts/prompter.js';

export type ProgramDependencies = {
  createPrompter: () => Prompter;
  isInteractive: () => boolean;
  installDependency?: DependencyInstaller;
  installPackage?: PackageInstaller;
  listPackedFiles?: PackedFileLister;
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

  const create = program
    .command('create')
    .description('Create a new app or library from a reviewed template')
    .argument('[name]', 'package name, or . to create the project in the current directory')
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

  create
    .command('skills')
    .description('Register or scaffold skills in a library package and verify they are published')
    .option('--package <name>', 'workspace package that owns the skills')
    .option('--path <skill-directory>', 'skill directory to register, or to scaffold when it has no SKILL.md')
    .option('-d, --directory <path>', 'project directory', '.')
    .action(async (options: { package?: string; path?: string; directory: string }) => {
      if (!dependencies.isInteractive()) {
        program.error('jfdevelops create skills is interactive; run it in a terminal.');
      }

      const status = await runCreateSkills({
        directory: options.directory,
        prompter: dependencies.createPrompter(),
        ...(options.package ? { packageName: options.package } : {}),
        ...(options.path ? { skillPath: options.path } : {}),
        ...(dependencies.listPackedFiles ? { listPackedFiles: dependencies.listPackedFiles } : {}),
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

  async function runAddCommand(options: { directory: string; kind?: AdditionKind; name?: string }) {
    if (!dependencies.isInteractive()) {
      program.error('jfdevelops add is interactive; run it in a terminal, or use add --list.');
    }

    const status = await runAdd({
      ...options,
      prompter: dependencies.createPrompter(),
      ...(dependencies.installPackage ? { installPackage: dependencies.installPackage } : {}),
    });

    if (status === 'incomplete' || status === 'failed') {
      process.exitCode = 1;
    }
  }

  const add = program
    .command('add')
    .description('Browse and add skills, integrations, or workspace packages')
    .option('-l, --list', 'list compatible additions without changing anything')
    .option('-d, --directory <path>', 'project directory', '.')
    .action(async (options: { list?: boolean; directory: string }) => {
      if (!options.list) {
        await runAddCommand({ directory: options.directory });

        return;
      }

      if ((await runAddList({ directory: options.directory, prompter: dependencies.createPrompter() })) === 'failed') {
        process.exitCode = 1;
      }
    });

  const additionCommands: Array<[AdditionKind, string]> = [
    ['skill', 'Enable a skill provided by an installed package'],
    ['addon', 'Adopt or install an integration and offer its skills'],
    ['package', 'Scaffold a TypeScript library package in the workspace'],
  ];

  for (const [kind, description] of additionCommands) {
    add
      .command(kind)
      .description(description)
      .argument('<name>', `${kind} name`)
      .option('-d, --directory <path>', 'project directory', '.')
      .action(async (name: string, options: { directory: string }) => {
        await runAddCommand({ directory: options.directory, kind, name });
      });
  }

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

  // Extra words reach this action only when they match no command, so report them as unknown.
  program.allowExcessArguments().action(() => {
    const [unknownCommand] = program.args;

    if (unknownCommand) {
      program.error(`error: unknown command '${unknownCommand}'. Run jfdevelops --help to see the available commands.`);
    }

    program.help();
  });

  return program;
}
