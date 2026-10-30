import { describe, expect, it } from 'vitest';
import { classifyTarget } from './target.js';

describe('classifyTarget', () => {
  it('classifies private framework packages as apps', () => {
    expect(classifyTarget({ name: 'web', private: true, dependencies: { next: '15.0.0' } })).toEqual({
      kind: 'app',
      reasons: ['depends on next'],
    });
  });

  it('classifies publishable packages as libraries', () => {
    expect(classifyTarget({ name: '@scope/ui', exports: { '.': './index.js' }, bin: './cli.js' })).toEqual({
      kind: 'library',
      reasons: ['publishes exports, bin'],
    });
    expect(classifyTarget({ name: 'utils' })).toEqual({ kind: 'library', reasons: ['is not private'] });
  });

  it('leaves conflicting signals for confirmation', () => {
    expect(classifyTarget({ name: 'next-plugin', main: './index.js', devDependencies: { next: '15.0.0' } })).toEqual({
      kind: 'unknown',
      reasons: ['depends on next', 'publishes main'],
    });
  });

  it('leaves private packages without a framework for confirmation', () => {
    expect(classifyTarget({ name: 'scripts', private: true })).toEqual({
      kind: 'unknown',
      reasons: ['is private without an app framework'],
    });
  });
});
