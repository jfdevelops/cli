import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { projectConfigSchema } from './schema.js';

export const projectConfigFileName = 'jfdevelops.json';

export class ProjectConfigError extends Error {
  override name = 'ProjectConfigError';
}

export function parseProjectConfig(input: unknown) {
  const result = projectConfigSchema.safeParse(input);

  if (!result.success) {
    throw new ProjectConfigError(`Invalid ${projectConfigFileName}:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}

export async function readProjectConfig(projectRoot: string) {
  let content: string;

  try {
    content = await readFile(join(projectRoot, projectConfigFileName), 'utf8');
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
    throw new ProjectConfigError(`${projectConfigFileName} is not valid JSON`, { cause: error });
  }

  return parseProjectConfig(input);
}
