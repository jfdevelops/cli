import { z } from 'zod';
import { runCommand } from '../process/run.js';

export type PackedFileLister = (packageDirectory: string) => Promise<string[]>;

const packResultSchema = z.array(z.looseObject({ files: z.array(z.looseObject({ path: z.string() })) })).min(1);

/**
 * Lists the files npm would publish for a package, without running its lifecycle scripts, so the
 * result reflects the package's `files`, ignore files, and npm's own rules.
 */
export const listPackedFiles: PackedFileLister = async (packageDirectory) => {
  const output = await runCommand('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: packageDirectory, captureOutput: true });
  const [result] = packResultSchema.parse(JSON.parse(output));

  return (result?.files ?? []).map((file) => file.path.replaceAll('\\', '/'));
};
