import { describe, expect, it } from 'vitest';
import { createTemplateFiles, projectTemplates } from './templates.js';

function readJson(files: ReturnType<typeof createTemplateFiles>, path: string) {
  const file = files.find((candidate) => candidate.path === path);

  if (!file || typeof file.content !== 'string') {
    throw new Error(`Missing text template file: ${path}`);
  }

  return JSON.parse(file.content) as Record<string, unknown>;
}

describe('projectTemplates', () => {
  it('defines one initial app and library template', () => {
    expect(projectTemplates.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: 'node-app', kind: 'app' },
      { name: 'typescript-library', kind: 'library' },
    ]);
  });

  it('generates a private Node.js app', () => {
    const files = createTemplateFiles('worker', 'node-app');

    expect(files.map((file) => file.path)).toEqual(['.gitignore', 'README.md', 'package.json', 'tsconfig.json', 'src/index.ts']);
    expect(readJson(files, 'package.json')).toMatchObject({ name: 'worker', private: true, scripts: { build: 'tsc', start: 'node dist/index.js' } });
  });

  it('generates a publishable library with declarations', () => {
    const files = createTemplateFiles('@acme/forms', 'typescript-library');

    expect(readJson(files, 'package.json')).toMatchObject({ name: '@acme/forms', files: ['dist'], exports: { '.': { types: './dist/index.d.ts' } } });
    expect(readJson(files, 'tsconfig.json')).toMatchObject({ compilerOptions: { declaration: true, declarationMap: true } });
  });

  it('rejects unknown templates', () => {
    expect(() => createTemplateFiles('app', 'missing')).toThrow('Unknown project template: missing');
  });
});
