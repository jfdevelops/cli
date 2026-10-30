import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

export function isInsideDirectory(root: string, path: string) {
  const local = relative(root, path);

  // relative() returns an absolute path when the target is on another Windows drive.
  return local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local);
}

async function resolveExistingAncestor(path: string): Promise<string> {
  try {

    return await realpath(path);
  } catch (error) {
    const parent = dirname(path);

    if (error instanceof Error && 'code' in error && error.code === 'ENOENT' && parent !== path) {

      return resolveExistingAncestor(parent);
    }

    throw error;
  }
}

// Rejects project paths whose existing parent directories link outside the project.
export async function assertInsideProject(projectRoot: string, projectPath: string) {
  const root = await realpath(projectRoot);
  const ancestor = await resolveExistingAncestor(dirname(join(projectRoot, projectPath)));

  if (!isInsideDirectory(root, ancestor)) {
    throw new Error(`${projectPath} resolves outside the project`);
  }
}
