import { describe, expect, it } from 'vitest';
import { renderFileTree } from './tree.js';

describe('renderFileTree', () => {
  it('draws directories before files and summarizes generated agent directories', () => {
    const tree = renderFileTree('acme', [
      'package.json',
      'apps/web/src/index.ts',
      'apps/web/package.json',
      '.agents/skills/jf-git/SKILL.md',
      '.agents/skills/jf-git/references/commits.md',
      '.claude/skills/jf-git/SKILL.md',
      'README.md',
    ]);

    expect(tree).toBe(
      [
        'acme/',
        '├── .agents/ (2 files)',
        '├── .claude/ (1 files)',
        '├── apps/',
        '│   └── web/',
        '│       ├── src/',
        '│       │   └── index.ts',
        '│       └── package.json',
        '├── README.md',
        '└── package.json',
      ].join('\n'),
    );
  });

  it('draws a root with no files', () => {
    expect(renderFileTree('empty', [])).toBe('empty/');
  });
});
