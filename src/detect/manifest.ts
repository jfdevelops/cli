import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const dependencyMapSchema = z.record(z.string(), z.string());

const packageManifestSchema = z.looseObject({
  name: z.string().optional(),
  private: z.boolean().optional(),
  packageManager: z.string().optional(),
  workspaces: z.union([z.array(z.string()), z.looseObject({ packages: z.array(z.string()).optional() })]).optional(),
  dependencies: dependencyMapSchema.optional(),
  devDependencies: dependencyMapSchema.optional(),
  main: z.string().optional(),
  module: z.string().optional(),
  types: z.string().optional(),
  exports: z.unknown().optional(),
  bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
});

export type PackageManifest = z.infer<typeof packageManifestSchema>;

export class ManifestError extends Error {
  override name = 'ManifestError';
}

export async function readPackageManifest(directory: string) {
  const path = join(directory, 'package.json');
  let content: string;

  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {

      return undefined;
    }

    throw error;
  }

  let input: unknown;

  try {
    input = JSON.parse(content);
  } catch (error) {
    throw new ManifestError(`${path} is not valid JSON`, { cause: error });
  }

  const result = packageManifestSchema.safeParse(input);

  if (!result.success) {
    throw new ManifestError(`Invalid ${path}:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}
