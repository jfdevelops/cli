import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { FileContent } from '../plan/hash.js';

// Writes beside the destination and renames it into place so readers never see a partial file.
export async function writeFileAtomic(path: string, content: FileContent) {
  const temporaryPath = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;

  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(temporaryPath, content);
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });

    throw error;
  }
}
