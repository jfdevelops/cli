import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import picomatch from 'picomatch';
import { parseDocument, YAMLSeq } from 'yaml';
import { packageNameSchema, projectPathSchema } from '../../config/schema.js';
import type { ProjectDetection } from '../../detect/project.js';
import type { FileEdit } from '../../plan/create.js';
import type { Prompter } from '../../prompts/prompter.js';
import { createWorkspacePackageFiles } from '../create/templates.js';
import type { ProjectAdditions } from './additions.js';
import { applyAdditions, type AddStatus } from './apply.js';

type Workspace = NonNullable<ProjectDetection['workspace']>;

function normalizePattern(pattern: string) {

  return pattern.trim().replace(/^\.\//, '').replace(/\/+$/, '');
}

// Uses the first `parent/*` pattern whose parent is a literal path, so patterns such as `{apps,packages}/*` are skipped.
function getDefaultDirectory(workspace: Workspace, baseName: string) {
  const parent = workspace.patterns.map((pattern) => normalizePattern(pattern).match(/^([^!*?{}[\]()]+)\/\*$/)?.[1]).find((match) => match !== undefined);

  return `${parent ?? 'packages'}/${baseName}`;
}

export function isWorkspaceMember(patterns: string[], directory: string) {
  const includes = patterns.filter((pattern) => !pattern.startsWith('!')).map((pattern) => normalizePattern(pattern));
  const excludes = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => normalizePattern(pattern.slice(1)));

  return picomatch.isMatch(directory, includes) && !(excludes.length > 0 && picomatch.isMatch(directory, excludes));
}

// Adds the package directory to the workspace definition, preserving the rest of the file.
export function createRegistrationEdit(workspace: Workspace, directory: string): FileEdit {
  if (workspace.source === 'pnpm-workspace.yaml') {

    return {
      path: 'pnpm-workspace.yaml',
      transform: (current) => {
        const document = parseDocument(current ?? '');
        const packages = document.get('packages');

        if (packages instanceof YAMLSeq) {
          packages.add(directory);
        } else {
          document.set('packages', [directory]);
        }

        return document.toString();
      },
    };
  }

  return {
    path: 'package.json',
    transform: (current) => {
      const manifest = JSON.parse(current ?? '{}') as { workspaces?: string[] | { packages?: string[] } };

      if (Array.isArray(manifest.workspaces)) {
        manifest.workspaces = [...manifest.workspaces, directory];
      } else {
        manifest.workspaces = { ...manifest.workspaces, packages: [...(manifest.workspaces?.packages ?? []), directory] };
      }

      return `${JSON.stringify(manifest, null, 2)}\n`;
    },
  };
}

function createNewFileEdit(path: string, content: string): FileEdit {

  return {
    path,
    transform: (current) => {
      if (current !== undefined) {
        throw new Error(`${path} already exists`);
      }

      return content;
    },
  };
}

// A file at the path, or a directory with entries, leaves no room for the package.
async function isOccupied(path: string) {
  if (!existsSync(path)) {

    return false;
  }

  return !(await stat(path)).isDirectory() || (await readdir(path)).length > 0;
}

/**
 * Scaffolds a TypeScript library package inside the workspace, registers its directory when no
 * workspace pattern covers it, and records it as a library target.
 */
export async function addPackage(additions: ProjectAdditions, name: string, prompter: Prompter): Promise<AddStatus> {
  const { project, config } = additions;
  const { workspace } = project;

  if (!workspace) {
    throw new Error('add package needs a workspace defined in pnpm-workspace.yaml or package.json workspaces.');
  }

  if (!packageNameSchema.safeParse(name).success) {
    throw new Error(`Invalid package name: ${name}`);
  }

  const answer = await prompter.text({
    message: 'Where should the package be created?',
    defaultValue: getDefaultDirectory(workspace, name.split('/').at(-1) ?? name),
  });
  const directory = normalizePattern(answer);

  if (!projectPathSchema.safeParse(directory).success) {
    throw new Error(`Invalid package directory: ${answer}`);
  }

  if (config.targets.some((target) => target.path === directory) || (await isOccupied(join(project.root, directory)))) {
    throw new Error(`${directory} is already in use.`);
  }

  const isRegistered = isWorkspaceMember(workspace.patterns, directory);
  const edits = [
    ...createWorkspacePackageFiles(name, { hasBuildScript: true }).map((file) => createNewFileEdit(`${directory}/${file.path}`, file.content)),
    ...(isRegistered ? [] : [createRegistrationEdit(workspace, directory)]),
  ];
  const targets = [...config.targets, { path: directory, kind: 'library' as const, template: 'typescript-library', options: {} }];
  const editRetryHint = `Remove what was created in ${directory}, then run jfdevelops add package ${name} again.`;
  const status = await applyAdditions(additions, { edits, targets, editRetryHint }, prompter);

  if (status === 'complete') {
    prompter.outro(`Created ${name} in ${directory}. Run ${config.project.packageManager} install to link it into the workspace.`);
  }

  return status;
}
