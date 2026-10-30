import { createHash } from 'node:crypto';

export type FileContent = string | Uint8Array;

export function hashContent(content: FileContent) {

  return createHash('sha256').update(content).digest('hex');
}
