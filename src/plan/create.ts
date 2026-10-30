import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectPathSchema, type ManagedFile, type ManagedFileOwner } from '../config/schema.js';
import { compareStrings } from '../compare.js';
import { hashContent, type FileContent } from './hash.js';

export type DesiredFile = { path: string; owner: ManagedFileOwner; content: FileContent };

export type ConflictReason = 'locally-edited' | 'unmanaged' | 'owned-elsewhere' | 'edited-before-removal' | 'not-a-file';

// currentSha256 is the file's hash when planned, so applying can detect later edits; undefined when missing or not a file.
type ChangeTarget = { path: string; owner: ManagedFileOwner; currentSha256: string | undefined };

export type PlannedChange =
  | (ChangeTarget & { action: 'create' | 'update'; content: FileContent; sha256: string })
  | (ChangeTarget & { action: 'adopt' | 'unchanged'; sha256: string })
  | (ChangeTarget & { action: 'delete' | 'forget' })
  | (ChangeTarget & { action: 'conflict'; reason: ConflictReason; current: Buffer | undefined; desired: FileContent | undefined });

type CurrentFile = { kind: 'missing' } | { kind: 'other' } | { kind: 'file'; content: Buffer; sha256: string };

export type ChangePlanOptions = {
  projectRoot: string;
  managedFiles?: ManagedFile[];
  files: DesiredFile[];
  // Owners whose complete file set is given; only their missing managed files are removed.
  owners: ManagedFileOwner[];
};

export class ChangePlanError extends Error {
  override name = 'ChangePlanError';
}

export function getOwnerKey(owner: ManagedFileOwner) {

  return owner.type === 'project' ? 'project' : `${owner.type}:${owner.name}`;
}

async function readCurrentFile(path: string): Promise<CurrentFile> {
  try {
    const stats = await lstat(path);

    if (!stats.isFile()) {

      return { kind: 'other' };
    }

    const content = await readFile(path);

    return { kind: 'file', content, sha256: hashContent(content) };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {

      return { kind: 'missing' };
    }

    throw error;
  }
}

function getCurrentSha256(current: CurrentFile) {

  return current.kind === 'file' ? current.sha256 : undefined;
}

function planDesiredFile(file: DesiredFile, record: ManagedFile | undefined, current: CurrentFile, ownerKeys: Set<string>) {
  const target = { path: file.path, owner: file.owner, currentSha256: getCurrentSha256(current) };
  const sha256 = hashContent(file.content);
  const isSameOwner = record !== undefined && getOwnerKey(record.owner) === getOwnerKey(file.owner);

  function conflict(reason: ConflictReason): PlannedChange {

    return { ...target, action: 'conflict', reason, current: current.kind === 'file' ? current.content : undefined, desired: file.content };
  }

  if (current.kind === 'other') {

    return conflict('not-a-file');
  }

  if (record && !isSameOwner && !ownerKeys.has(getOwnerKey(record.owner))) {

    return conflict('owned-elsewhere');
  }

  if (current.kind === 'missing') {

    return { ...target, action: 'create', content: file.content, sha256 } satisfies PlannedChange;
  }

  if (current.sha256 === sha256) {
    const isRecorded = isSameOwner && record.sha256 === sha256;

    return { ...target, action: isRecorded ? 'unchanged' : 'adopt', sha256 } satisfies PlannedChange;
  }

  if (!record) {

    return conflict('unmanaged');
  }

  if (current.sha256 === record.sha256) {

    return { ...target, action: 'update', content: file.content, sha256 } satisfies PlannedChange;
  }

  return conflict('locally-edited');
}

function planRemoval(record: ManagedFile, current: CurrentFile): PlannedChange {
  const target = { path: record.path, owner: record.owner, currentSha256: getCurrentSha256(current) };

  if (current.kind === 'missing') {

    return { ...target, action: 'forget' };
  }

  if (current.kind === 'file' && current.sha256 === record.sha256) {

    return { ...target, action: 'delete' };
  }

  const reason = current.kind === 'file' ? 'edited-before-removal' : 'not-a-file';

  return { ...target, action: 'conflict', reason, current: current.kind === 'file' ? current.content : undefined, desired: undefined };
}

function validateFiles(files: DesiredFile[], ownerKeys: Set<string>) {
  const paths = new Set<string>();

  for (const file of files) {
    if (!projectPathSchema.safeParse(file.path).success) {
      throw new ChangePlanError(`Invalid project path: ${file.path}`);
    }

    if (paths.has(file.path)) {
      throw new ChangePlanError(`More than one planned file uses ${file.path}`);
    }

    if (!ownerKeys.has(getOwnerKey(file.owner))) {
      throw new ChangePlanError(`${file.path} belongs to ${getOwnerKey(file.owner)}, which is not being planned`);
    }

    paths.add(file.path);
  }
}

// Applying every non-conflicting change yields these records; conflicting paths keep their previous record.
function computeManagedFiles(managedFiles: ManagedFile[], changes: PlannedChange[]) {
  const records = new Map(managedFiles.map((file) => [file.path, file]));

  for (const change of changes) {
    if (change.action === 'delete' || change.action === 'forget') {
      records.delete(change.path);
    } else if ('sha256' in change) {
      records.set(change.path, { path: change.path, owner: change.owner, sha256: change.sha256 });
    }
  }

  return [...records.values()].sort((left, right) => compareStrings(left.path, right.path));
}

/**
 * Compares the files the CLI wants to own with the project on disk and the recorded managed files.
 * Reads only; nothing is written until a plan is applied.
 */
export async function createChangePlan({ projectRoot, managedFiles = [], files, owners }: ChangePlanOptions) {
  const ownerKeys = new Set(owners.map((owner) => getOwnerKey(owner)));
  const records = new Map(managedFiles.map((file) => [file.path, file]));

  validateFiles(files, ownerKeys);

  const desiredPaths = new Set(files.map((file) => file.path));
  const removals = managedFiles.filter((record) => ownerKeys.has(getOwnerKey(record.owner)) && !desiredPaths.has(record.path));
  const desiredChanges = files.map(async (file) =>
    planDesiredFile(file, records.get(file.path), await readCurrentFile(join(projectRoot, file.path)), ownerKeys),
  );
  const removalChanges = removals.map(async (record) => planRemoval(record, await readCurrentFile(join(projectRoot, record.path))));
  const changes = (await Promise.all([...desiredChanges, ...removalChanges])).sort((left, right) => compareStrings(left.path, right.path));

  return {
    changes,
    conflicts: changes.filter((change) => change.action === 'conflict'),
    hasChanges: changes.some((change) => change.action !== 'unchanged'),
    previousManagedFiles: managedFiles,
    managedFiles: computeManagedFiles(managedFiles, changes),
  };
}

export type ChangePlan = Awaited<ReturnType<typeof createChangePlan>>;
