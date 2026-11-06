import { compareStrings } from '../compare.js';

// A project-relative path, optionally tagged with what will happen to it, such as create or conflict.
export type TreeEntry = { path: string; note?: string };

type RenderFileTreeOptions = {
  // Summarizes generated agent directories on one line instead of listing every file.
  isCollapsingAgentDirectories?: boolean;
};

type TreeNode = { children: Map<string, TreeNode>; isDirectory: boolean; note: string | undefined; collapsedFiles: number | undefined };

// Skill copies and agent files are generated in bulk, so a collapsed tree summarizes each directory on one line.
const collapsedDirectories = new Set(['.agents', '.claude', '.cursor', '.github']);

function createNode(isDirectory: boolean, collapsedFiles?: number, note?: string): TreeNode {

  return { children: new Map(), isDirectory, note, collapsedFiles };
}

function buildTree(entries: TreeEntry[], isCollapsingAgentDirectories: boolean) {
  const root = createNode(true);

  for (const { path, note } of entries) {
    const segments = path.split('/');
    const [first = ''] = segments;

    if (isCollapsingAgentDirectories && segments.length > 1 && collapsedDirectories.has(first)) {
      const directory = root.children.get(first) ?? createNode(true, 0);

      directory.collapsedFiles = (directory.collapsedFiles ?? 0) + 1;
      root.children.set(first, directory);
      continue;
    }

    let node = root;

    for (const [index, segment] of segments.entries()) {
      const isLeaf = index === segments.length - 1;
      const child = node.children.get(segment) ?? createNode(!isLeaf);

      if (isLeaf) {
        child.note = note;
      }

      node.children.set(segment, child);
      node = child;
    }
  }

  return root;
}

function sortEntries(node: TreeNode) {

  return [...node.children.entries()].sort(([leftName, left], [rightName, right]) =>
    left.isDirectory === right.isDirectory ? compareStrings(leftName, rightName) : left.isDirectory ? -1 : 1,
  );
}

function renderChildren(node: TreeNode, prefix: string): string[] {
  const entries = sortEntries(node);

  return entries.flatMap(([name, child], index) => {
    const isLast = index === entries.length - 1;
    const summary = child.collapsedFiles === undefined ? '' : ` (${child.collapsedFiles} files)`;
    const tag = child.note === undefined ? '' : ` [${child.note}]`;
    const label = `${child.isDirectory ? '📁' : '📄'} ${name}${child.isDirectory ? '/' : ''}${summary}${tag}`;

    return [`${prefix}${isLast ? '└── ' : '├── '}${label}`, ...renderChildren(child, `${prefix}${isLast ? '    ' : '│   '}`)];
  });
}

/** Draws project-relative file paths as a folder tree under the given root label. */
export function renderFileTree(rootLabel: string, entries: TreeEntry[], { isCollapsingAgentDirectories = false }: RenderFileTreeOptions = {}) {

  return [`📁 ${rootLabel}/`, ...renderChildren(buildTree(entries, isCollapsingAgentDirectories), '')].join('\n');
}
