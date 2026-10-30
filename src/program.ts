import { Command } from 'commander';

export function createProgram(version: string) {
  const program = new Command('jfdevelops')
    .description('Project setup and skill discovery for jfdevelops projects')
    .version(version, '-v, --version', 'Show the CLI version')
    .helpOption('-h, --help', 'Show command help')
    .helpCommand(false);

  program.action(() => {
    program.help();
  });

  return program;
}
