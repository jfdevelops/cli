import { describe, expect, it } from 'vitest';
import { isIgnoredByNpm } from './npm-ignored.js';

describe('isIgnoredByNpm', () => {
  it('matches names npm always leaves out, at any depth', () => {
    expect(['.DS_Store', 'references/.DS_Store', '._SKILL.md', 'notes.md.orig', '.SKILL.md.swp', '.git/HEAD', 'node_modules/x/index.js'].every(isIgnoredByNpm)).toBe(true);
  });

  it('keeps ordinary skill files', () => {
    expect(['SKILL.md', 'references/fields.md', 'scripts/.prettierrc', 'original.md'].some(isIgnoredByNpm)).toBe(false);
  });
});
