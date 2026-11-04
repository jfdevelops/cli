import { compareStrings } from '../../compare.js';

type TreeNode = { children: Map<string, TreeNode>; isDirectory: boolean; collapsedFiles: number | undefined };

// Skill copies and agent files are generated in bulk, so each directory is summarized on one line.
const collapsedDirectories = new Set(['.agents', '.claude', '.cursor', '.github']);

function createNode(isDirectory: boolean, collapsedFiles?: number): TreeNode {

  return { children: new Map(), isDirectory, collapsedFiles };
}

function buildTree(paths: string[]) {
  const root = createNode(true);

  for (const path of paths) {
    const segments = path.split('/');
    const [first = ''] = segments;

    if (segments.length > 1 && collapsedDirectories.has(first)) {
      const directory = root.children.get(first) ?? createNode(true, 0);

      directory.collapsedFiles = (directory.collapsedFiles ?? 0) + 1;
      root.children.set(first, directory);
      continue;
    }

    let node = root;

    for (const [index, segment] of segments.entries()) {
      const child = node.children.get(segment) ?? createNode(index < segments.length - 1);

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
    const suffix = child.collapsedFiles === undefined ? '' : ` (${child.collapsedFiles} files)`;
    const label = `${name}${child.isDirectory ? '/' : ''}${suffix}`;

    return [`${prefix}${isLast ? '└── ' : '├── '}${label}`, ...renderChildren(child, `${prefix}${isLast ? '    ' : '│   '}`)];
  });
}

/** Draws project-relative file paths as a folder tree under the given root label. */
export function renderFileTree(rootLabel: string, paths: string[]) {

  return [`${rootLabel}/`, ...renderChildren(buildTree(paths), '')].join('\n');
}
