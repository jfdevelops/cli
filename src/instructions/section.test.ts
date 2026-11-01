import { describe, expect, it } from 'vitest';
import { upsertManagedSection } from './section.js';

const start = '<!-- jfdevelops:start -->';
const end = '<!-- jfdevelops:end -->';

describe('upsertManagedSection', () => {
  it('creates a file with the heading and block', () => {
    expect(upsertManagedSection(undefined, 'Body', '# Title')).toBe(`# Title\n\n${start}\nBody\n${end}\n`);
  });

  it('appends the block after existing content', () => {
    expect(upsertManagedSection('# Mine\n\nKeep me.\n\n\n', 'Body', '# Title')).toBe(`# Mine\n\nKeep me.\n\n${start}\nBody\n${end}\n`);
  });

  it('replaces only the existing block', () => {
    const current = `# Mine\n\n${start}\nOld\n${end}\n\nAfter.\n`;

    expect(upsertManagedSection(current, 'New', '# Title')).toBe(`# Mine\n\n${start}\nNew\n${end}\n\nAfter.\n`);
  });

  it('preserves CRLF line endings', () => {
    expect(upsertManagedSection('# Mine\r\n', 'One\nTwo', '# Title')).toBe(`# Mine\r\n\r\n${start}\r\nOne\r\nTwo\r\n${end}\r\n`);
  });

  it('is stable when applied repeatedly', () => {
    const once = upsertManagedSection('# Mine\n', 'Body', '# Title');

    expect(upsertManagedSection(once, 'Body', '# Title')).toBe(once);
  });

  it('rejects unmatched markers', () => {
    expect(() => upsertManagedSection(`${start}\nBody\n`, 'Body', '# Title')).toThrow(`Found an unmatched ${start} marker`);
    expect(() => upsertManagedSection(`Body\n${end}\n`, 'Body', '# Title')).toThrow(`Found an unmatched ${end} marker`);
  });
});
