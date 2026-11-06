import { describe, expect, it } from 'vitest';
import { renderFileTree } from './tree.js';

describe('renderFileTree', () => {
  it('draws directories before files and summarizes generated agent directories when asked', () => {
    const tree = renderFileTree(
      'acme',
      [
        'package.json',
        'apps/web/src/index.ts',
        'apps/web/package.json',
        '.agents/skills/jf-git/SKILL.md',
        '.agents/skills/jf-git/references/commits.md',
        '.claude/skills/jf-git/SKILL.md',
        'README.md',
      ].map((path) => ({ path })),
      { isCollapsingAgentDirectories: true },
    );

    expect(tree).toBe(
      [
        '📁 acme/',
        '├── 📁 .agents/ (2 files)',
        '├── 📁 .claude/ (1 files)',
        '├── 📁 apps/',
        '│   └── 📁 web/',
        '│       ├── 📁 src/',
        '│       │   └── 📄 index.ts',
        '│       └── 📄 package.json',
        '├── 📄 README.md',
        '└── 📄 package.json',
      ].join('\n'),
    );
  });

  it('lists every file with its action by default', () => {
    const tree = renderFileTree('acme', [
      { path: '.claude/skills/jf-git/SKILL.md', note: 'create' },
      { path: '.claude/skills/jf-git/references/commits.md', note: 'create' },
      { path: '.github/copilot-instructions.md', note: 'edit' },
      { path: 'jfdevelops.json', note: 'conflict' },
    ]);

    expect(tree).toBe(
      [
        '📁 acme/',
        '├── 📁 .claude/',
        '│   └── 📁 skills/',
        '│       └── 📁 jf-git/',
        '│           ├── 📁 references/',
        '│           │   └── 📄 commits.md [create]',
        '│           └── 📄 SKILL.md [create]',
        '├── 📁 .github/',
        '│   └── 📄 copilot-instructions.md [edit]',
        '└── 📄 jfdevelops.json [conflict]',
      ].join('\n'),
    );
  });

  it('draws a root with no files', () => {
    expect(renderFileTree('empty', [])).toBe('📁 empty/');
  });
});
