import { join } from 'node:path';
import type { z } from 'zod';
import { writeFileAtomic } from '../files/write.js';
import { parseProjectConfig, projectConfigFileName } from './read.js';
import type { projectConfigSchema } from './schema.js';

// Validates before writing so an invalid configuration never replaces a valid one.
export async function writeProjectConfig(projectRoot: string, config: z.input<typeof projectConfigSchema>) {
  const validConfig = parseProjectConfig(config);

  await writeFileAtomic(join(projectRoot, projectConfigFileName), `${JSON.stringify(validConfig, null, 2)}\n`);

  return validConfig;
}
