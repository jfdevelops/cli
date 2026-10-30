import { createTwoFilesPatch } from 'diff';
import type { FileContent } from './hash.js';

const maximumLines = 60;

function toText(content: FileContent | undefined) {
  if (content === undefined) {

    return '';
  }

  return typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
}

function isBinary(content: FileContent | undefined) {

  return content !== undefined && typeof content !== 'string' && Buffer.from(content).includes(0);
}

// Renders a unified diff from the file on disk to the planned content, truncated for terminal display.
export function formatChangeDiff(path: string, current: FileContent | undefined, desired: FileContent | undefined) {
  if (isBinary(current) || isBinary(desired)) {

    return 'Binary content differs.';
  }

  const lines = createTwoFilesPatch(path, path, toText(current), toText(desired), 'on disk', desired === undefined ? 'removed' : 'planned')
    .split('\n')
    .slice(2)
    .filter((line) => line !== '\\ No newline at end of file');
  const hiddenLines = lines.length - maximumLines;

  return hiddenLines > 0 ? [...lines.slice(0, maximumLines), `… ${hiddenLines} more lines`].join('\n') : lines.join('\n').trimEnd();
}
