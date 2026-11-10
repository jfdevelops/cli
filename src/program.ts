import { Command } from 'commander';
import { runAdd, runAddList, type AdditionKind } from './commands/add/run.js';
import type { PackedFileLister } from './authoring/packed-files.js';
import { parseAgentsFlag, parseCommaList, parseConflictPolicy, parseEnumFlag } from './commands/flags.js';
import { runCreate, type CreateAnswers } from './commands/create/run.js';
import { runCreateSkills } from './commands/create/skills.js';
import type { FormatterName, ProjectKind } from './commands/create/templates.js';
import { runInit, type InitAnswers } from './commands/init/run.js';
import { runSkillsStatus } from './commands/skills/status.js';
import { runSkillsSync } from './commands/skills/sync.js';
import type { DependencyInstaller, PackageInstaller } from './dependencies/install.js';
import type { PackageManagerName } from './detect/package-manager.js';
import { createClackPrompter } from './prompts/clack.js';
import { createLoggingPrompter } from './prompts/logging.js';
import type { Prompter } from './prompts/prompter.js';

export type ProgramDependencies = {
  createPrompter: () => Prompter;
  isInteractive: () => boolean;
  installDependency?: DependencyInstaller;
  installPackage?: PackageInstaller;
  listPackedFiles?: PackedFileLister;
};

const defaultDependencies: ProgramDependencies = {
  createPrompter: () => (process.stdin.isTTY && process.stdout.isTTY ? createClackPrompter() : createLoggingPrompter()),
  isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
};

const projectKinds = ['app', 'library'] as const satisfies readonly ProjectKind[];
const packageManagers = ['pnpm', 'npm', 'yarn', 'bun'] as const satisfies readonly PackageManagerName[];
const formatters = ['prettier', 'biome'] as const satisfies readonly FormatterName[];

type CreateCliOptions = {
  kind?: string;
  template?: string;
  packageManager?: string;
  formatter?: string;
  agents?: string;
  git?: boolean;
  remote?: string;
  monorepo?: boolean;
  workspace?: boolean;
  namespace?: string;
  appName?: string;
  appsDir?: string;
  librariesDir?: string;
  packages?: string;
  yes?: boolean;
  conflicts?: string;
};

type InitCliOptions = {
  packageManager?: string;
  agents?: string;
  addons?: string;
  skills?: string;
  yes?: boolean;
  conflicts?: string;
};

function createAnswersFromFlags(options: CreateCliOptions): CreateAnswers {
  const answers: CreateAnswers = {
    kind: parseEnumFlag('kind', options.kind, projectKinds),
    packageManager: parseEnumFlag('package-manager', options.packageManager, packageManagers, 'pnpm'),
    formatter: parseEnumFlag('formatter', options.formatter, formatters, 'prettier'),
    agents: parseAgentsFlag(options.agents),
    shouldInitializeGit: options.git ?? true,
    monorepo: Boolean(options.monorepo),
    workspace: Boolean(options.workspace),
  };

  if (options.template !== undefined) {
    answers.templateName = options.template;
  }

  if (options.remote !== undefined) {
    answers.remoteUrl = options.remote;
  }

  if (options.namespace !== undefined) {
    answers.namespace = options.namespace;
  }

  if (options.appName !== undefined) {
    answers.appName = options.appName;
  }

  if (options.appsDir !== undefined) {
    answers.appsDirectory = options.appsDir;
  }

  if (options.librariesDir !== undefined) {
    answers.packagesDirectory = options.librariesDir;
  }

  if (options.packages !== undefined) {
    answers.packages = parseCommaList(options.packages);
  }

  return answers;
}

function initAnswersFromFlags(options: InitCliOptions): InitAnswers {
  const answers: InitAnswers = {};

  if (options.packageManager !== undefined) {
    answers.packageManager = parseEnumFlag('package-manager', options.packageManager, packageManagers);
  }

  if (options.agents !== undefined) {
    answers.agents = parseAgentsFlag(options.agents);
  }

  if (options.addons !== undefined) {
    answers.addons = parseCommaList(options.addons);
  }

  if (options.skills !== undefined) {
    answers.skills = parseCommaList(options.skills);
  }

  return answers;
}

function addCreateFlags(command: Command) {

  return command
    .option('--kind <app|library>', 'project kind')
    .option('--template <name>', 'template name for the project kind')
    .option('--package-manager <name>', 'package manager (default: pnpm)')
    .option('--formatter <name>', 'formatter (default: prettier)')
    .option('--agents <list>', 'comma-separated coding agents (default: all)')
    .option('--git', 'initialize Git and create the foundation commit')
    .option('--no-git', 'skip Git initialization')
    .option('--remote <url>', 'Git remote URL to add as origin')
    .option('--monorepo', 'create an app as a workspace with apps and libraries')
    .option('--workspace', 'create a library as a workspace of packages')
    .option('--namespace <name>', 'package name namespace, or none for bare names')
    .option('--app-name <name>', 'app package short name in a monorepo (default: web)')
    .option('--apps-dir <path>', 'apps directory in a monorepo (default: apps)')
    .option('--libraries-dir <path>', 'libraries directory (default: packages)')
    .option('--packages <list>', 'comma-separated library package short names')
    .option('-y, --yes', 'run non-interactively and apply the plan')
    .option('--conflicts <keep|overwrite>', 'conflict policy when using --yes (default: keep)');
}

function addInitFlags(command: Command) {

  return command
    .option('--package-manager <name>', 'package manager when it cannot be detected')
    .option('--agents <list>', 'comma-separated coding agents (default: all)')
    .option('--addons <list>', 'comma-separated detected integrations to adopt (default: all detected)')
    .option('--skills <list>', 'comma-separated skills to enable (default: all available)')
    .option('-y, --yes', 'run non-interactively and apply the plan')
    .option('--conflicts <keep|overwrite>', 'conflict policy when using --yes (default: keep)');
}

export function createProgram(version: string, dependencies = defaultDependencies) {
  const program = new Command('jfdevelops')
    .description('Project setup and skill discovery for jfdevelops projects')
    .version(version, '-v, --version', 'Show the CLI version')
    .helpOption('-h, --help', 'Show command help')
    .helpCommand(false);

  const create = addCreateFlags(
    program.command('create').description('Create a new app or library from a reviewed template').argument('[name]', 'package name, or . to create the project in the current directory'),
  ).action(async (directory: string | undefined, options: CreateCliOptions) => {
    const wantsNonInteractive = Boolean(options.yes) || !dependencies.isInteractive();

    if (wantsNonInteractive && !options.yes) {
      program.error('jfdevelops create is interactive; pass --yes with flags, or run it in a terminal.');
    }

    if (wantsNonInteractive && options.kind === undefined) {
      program.error('Missing --kind. Use app or library.');
    }

    try {
      const status = await runCreate({
        ...(directory ? { directory } : {}),
        version,
        prompter: dependencies.createPrompter(),
        ...(wantsNonInteractive
          ? {
              answers: createAnswersFromFlags(options),
              nonInteractive: { conflicts: parseConflictPolicy(options.conflicts) },
            }
          : {}),
        ...(dependencies.installDependency ? { installDependency: dependencies.installDependency } : {}),
      });

      if (status === 'incomplete' || status === 'failed') {
        process.exitCode = 1;
      }
    } catch (error) {
      program.error(error instanceof Error ? error.message : String(error));
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

  addInitFlags(program.command('init').description('Adopt an existing project: choose skills and review every change before it is applied').argument('[directory]', 'project directory', '.')).action(
    async (directory: string, options: InitCliOptions) => {
      const wantsNonInteractive = Boolean(options.yes) || !dependencies.isInteractive();

      if (wantsNonInteractive && !options.yes) {
        program.error('jfdevelops init is interactive; pass --yes with flags, or run it in a terminal.');
      }

      try {
        const status = await runInit({
          directory,
          version,
          prompter: dependencies.createPrompter(),
          ...(wantsNonInteractive
            ? {
                answers: initAnswersFromFlags(options),
                nonInteractive: { conflicts: parseConflictPolicy(options.conflicts) },
              }
            : {}),
          ...(dependencies.installDependency ? { installDependency: dependencies.installDependency } : {}),
        });

        if (status === 'incomplete' || status === 'failed') {
          process.exitCode = 1;
        }
      } catch (error) {
        program.error(error instanceof Error ? error.message : String(error));
      }
    },
  );

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
