import { spawn } from 'node:child_process';

type RunCommandOptions = { cwd: string; captureOutput?: boolean };

const isWindows = process.platform === 'win32';

// Quotes arguments that the Windows shell would otherwise split or interpret.
function quoteForShell(argument: string) {

  return /^[\w@%+=:,./-]+$/.test(argument) ? argument : `"${argument.replaceAll('"', '\\"')}"`;
}

/**
 * Runs a command and resolves with its standard output when captured. Windows needs a shell to launch
 * the `.cmd` shims that npm, pnpm, yarn, and bun install, and Node refuses to spawn them directly.
 */
export function runCommand(command: string, arguments_: string[], { cwd, captureOutput = false }: RunCommandOptions) {

  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, isWindows ? arguments_.map((argument) => quoteForShell(argument)) : arguments_, {
      cwd,
      shell: isWindows,
      stdio: captureOutput ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    });
    let output = '';

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      output += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`${command} ${arguments_.join(' ')} exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}
