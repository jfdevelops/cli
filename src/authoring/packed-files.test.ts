import { describe, expect, it } from 'vitest';
import { parsePackedFiles } from './packed-files.js';

const files = [{ path: 'package.json' }, { path: 'skills\\build-forms\\SKILL.md' }];

describe('parsePackedFiles', () => {
  it('reads the array printed by npm 11 and earlier', () => {
    expect(parsePackedFiles(JSON.stringify([{ name: '@acme/forms', files }]))).toEqual(['package.json', 'skills/build-forms/SKILL.md']);
  });

  it('reads the object keyed by package name printed by npm 12', () => {
    expect(parsePackedFiles(JSON.stringify({ '@acme/forms': { name: '@acme/forms', files } }))).toEqual(['package.json', 'skills/build-forms/SKILL.md']);
  });

  it('rejects output without a packed package', () => {
    expect(() => parsePackedFiles('[]')).toThrow();
    expect(() => parsePackedFiles('{}')).toThrow('npm pack reported no package');
  });
});
