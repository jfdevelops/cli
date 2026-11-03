import { z } from 'zod';
import { runCommand } from '../process/run.js';

export type PackedFileLister = (packageDirectory: string) => Promise<string[]>;

const packedPackageSchema = z.looseObject({ files: z.array(z.looseObject({ path: z.string() })) });

// npm 11 and earlier print an array of packed packages; npm 12 prints an object keyed by package name.
const packResultSchema = z.union([z.array(packedPackageSchema).min(1), z.record(z.string(), packedPackageSchema)]);

export function parsePackedFiles(output: string) {
  const result = packResultSchema.parse(JSON.parse(output));
  const [packed] = Array.isArray(result) ? result : Object.values(result);

  if (!packed) {
    throw new Error('npm pack reported no package');
  }

  return packed.files.map((file) => file.path.replaceAll('\\', '/'));
}

/**
 * Lists the files npm would publish for a package, without running its lifecycle scripts, so the
 * result reflects the package's `files`, ignore files, and npm's own rules.
 */
export async function listPackedFiles(packageDirectory: string) {
  const output = await runCommand('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: packageDirectory, captureOutput: true });

  return parsePackedFiles(output);
}
