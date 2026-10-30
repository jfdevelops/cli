import { lstat, readFile, readdir, rm, rmdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ManagedFile } from '../config/schema.js';
import { compareStrings } from '../compare.js';
import { assertInsideProject, isInsideDirectory } from '../files/containment.js';
import { writeFileAtomic } from '../files/write.js';
import type { ChangePlan, ConflictReason, PlannedChange } from './create.js';
import { hashContent, type FileContent } from './hash.js';

export type ConflictResolution = 'keep' | 'overwrite';

export type AppliedAction = 'create' | 'update' | 'delete' | 'adopt' | 'forget' | 'overwrite';

export type ApplyChangePlanOptions = {
  projectRoot: string;
  plan: ChangePlan;
  // Decision for every conflicting path, keyed by project path.
  resolutions?: Record<string, ConflictResolution>;
};

type Operation =
  | { kind: 'write'; content: FileContent; action: AppliedAction }
  | { kind: 'remove'; action: AppliedAction }
  | { kind: 'record'; sha256: string; action: AppliedAction }
  | { kind: 'drop'; action: AppliedAction }
  | { kind: 'keep'; reason: ConflictReason }
  | { kind: 'none' };

const overwritableReasons = new Set<ConflictReason>(['locally-edited', 'unmanaged', 'edited-before-removal']);

export class ApplyError extends Error {
  override name = 'ApplyError';
}

function validateResolutions(plan: ChangePlan, resolutions: Record<string, ConflictResolution>) {
  const conflicts = new Map(plan.conflicts.map((change) => [change.path, change]));

  for (const path of Object.keys(resolutions)) {
    if (!conflicts.has(path)) {
      throw new ApplyError(`${path} has a resolution but is not a conflict`);
    }
  }

  for (const conflict of conflicts.values()) {
    const resolution = resolutions[conflict.path];

    if (resolution === undefined) {
      throw new ApplyError(`${conflict.path} needs a resolution (${conflict.reason})`);
    }

    if (resolution === 'overwrite' && !overwritableReasons.has(conflict.reason)) {
      throw new ApplyError(`${conflict.path} cannot be overwritten (${conflict.reason})`);
    }
  }
}

function getOperation(change: PlannedChange, resolution: ConflictResolution | undefined): Operation {
  switch (change.action) {
    case 'create':
    case 'update':

      return { kind: 'write', content: change.content, action: change.action };
    case 'delete':

      return { kind: 'remove', action: 'delete' };
    case 'adopt':

      return { kind: 'record', sha256: change.sha256, action: 'adopt' };
    case 'forget':

      return { kind: 'drop', action: 'forget' };
    case 'unchanged':

      return { kind: 'none' };
    case 'conflict':
      if (resolution !== 'overwrite') {

        return { kind: 'keep', reason: change.reason };
      }

      return change.desired === undefined ? { kind: 'remove', action: 'delete' } : { kind: 'write', content: change.desired, action: 'overwrite' };
  }
}

async function readSha256(path: string) {
  try {
    const stats = await lstat(path);

    return stats.isFile() ? hashContent(await readFile(path)) : 'not-a-file';
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {

      return undefined;
    }

    throw error;
  }
}

// Removes directories left empty by a deletion, stopping at the project root or the first non-empty directory.
async function removeEmptyParents(projectRoot: string, path: string) {
  const root = resolve(projectRoot);
  let directory = dirname(resolve(path));

  while (directory !== root && isInsideDirectory(root, directory)) {
    if ((await readdir(directory)).length > 0) {

      return;
    }

    await rmdir(directory);
    directory = dirname(directory);
  }
}

/**
 * Applies a change plan file by file. Every conflict needs a resolution before anything is written.
 * Files edited since planning are reported as failures instead of being overwritten, and a failure
 * does not stop unrelated files. The returned managed files describe what is actually on disk.
 */
export async function applyChangePlan({ projectRoot, plan, resolutions = {} }: ApplyChangePlanOptions) {
  validateResolutions(plan, resolutions);

  const records = new Map(plan.previousManagedFiles.map((file) => [file.path, file]));
  const applied: Array<{ path: string; action: AppliedAction }> = [];
  const skipped: Array<{ path: string; reason: ConflictReason }> = [];
  const failed: Array<{ path: string; action: AppliedAction; message: string }> = [];

  for (const change of plan.changes) {
    const operation = getOperation(change, resolutions[change.path]);
    const path = join(projectRoot, change.path);

    if (operation.kind === 'none') {
      continue;
    }

    if (operation.kind === 'keep') {
      skipped.push({ path: change.path, reason: operation.reason });
      continue;
    }

    try {
      if (operation.kind === 'write' || operation.kind === 'remove') {
        await assertInsideProject(projectRoot, change.path);

        if ((await readSha256(path)) !== change.currentSha256) {
          throw new Error('changed on disk since the plan was created');
        }
      }

      if (operation.kind === 'write') {
        await writeFileAtomic(path, operation.content);
      }

      if (operation.kind === 'remove') {
        await rm(path);
        await removeEmptyParents(projectRoot, path);
      }

      if (operation.kind === 'remove' || operation.kind === 'drop') {
        records.delete(change.path);
      } else {
        const sha256 = operation.kind === 'write' ? hashContent(operation.content) : operation.sha256;

        records.set(change.path, { path: change.path, owner: change.owner, sha256 } satisfies ManagedFile);
      }

      applied.push({ path: change.path, action: operation.action });
    } catch (error) {
      failed.push({ path: change.path, action: operation.action, message: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    applied,
    skipped,
    failed,
    isComplete: failed.length === 0,
    managedFiles: [...records.values()].sort((left, right) => compareStrings(left.path, right.path)),
  };
}

export type ApplyResult = Awaited<ReturnType<typeof applyChangePlan>>;
