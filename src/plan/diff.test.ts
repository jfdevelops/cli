import { describe, expect, it } from 'vitest';
import { formatChangeDiff } from './diff.js';

describe('formatChangeDiff', () => {
  it('renders a unified diff from disk to the planned content', () => {
    expect(formatChangeDiff('a.md', Buffer.from('one\ntwo\n'), 'one\nthree\n')).toBe(
      ['--- a.md\ton disk', '+++ a.md\tplanned', '@@ -1,2 +1,2 @@', ' one', '-two', '+three'].join('\n'),
    );
  });

  it('renders removals', () => {
    expect(formatChangeDiff('a.md', Buffer.from('gone\n'), undefined)).toContain('+++ a.md\tremoved\n@@ -1,1 +0,0 @@\n-gone');
  });

  it('summarizes binary content', () => {
    expect(formatChangeDiff('image.png', Buffer.from([0, 1, 2]), Buffer.from([0, 1]))).toBe('Binary content differs.');
  });

  it('truncates long diffs', () => {
    const current = Array.from({ length: 100 }, (_, index) => `line ${index}`).join('\n');
    const lines = formatChangeDiff('long.md', Buffer.from(current), '').split('\n');

    expect(lines).toHaveLength(61);
    expect(lines.at(-1)).toMatch(/^… \d+ more lines$/);
  });
});
