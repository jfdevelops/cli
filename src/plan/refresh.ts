import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ManagedFile } from '../config/schema.js';
import { hashContent } from './hash.js';

/**
 * Re-records the hashes of selected managed files after an expected rewrite, such as running the
 * project's formatter over files the CLI just generated, so they are not later mistaken for local edits.
 */
export async function refreshManagedFiles(projectRoot: string, managedFiles: ManagedFile[], shouldRefresh: (file: ManagedFile) => boolean) {

  return Promise.all(
    managedFiles.map(async (file) => (shouldRefresh(file) ? { ...file, sha256: hashContent(await readFile(join(projectRoot, file.path))) } : file)),
  );
}
