import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ManagedFile, ManagedFileOwner } from '../config/schema.js';
import { createFixture, type FixtureFiles } from '../testing/fixture.js';
import { createChangePlan, type ChangePlan, type DesiredFile } from './create.js';
import { hashContent } from './hash.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];
const skill: ManagedFileOwner = { type: 'skill', name: 'jf-git' };
const otherSkill: ManagedFileOwner = { type: 'skill', name: 'jf-other' };

async function createProject(files: FixtureFiles = {}) {
  const fixture = await createFixture(files);

  fixtures.push(fixture);

  return fixture.root;
}

function createRecord(path: string, content: string, owner = skill): ManagedFile {

  return { path, owner, sha256: hashContent(content) };
}

function createDesired(path: string, content: string, owner = skill): DesiredFile {

  return { path, owner, content };
}

function summarize(plan: ChangePlan) {

  return plan.changes.map((change) => [change.path, change.action === 'conflict' ? `conflict:${change.reason}` : change.action]);
}

// Stands in for the apply step so repeat runs can be checked.
async function applyNonConflicting(projectRoot: string, plan: ChangePlan) {
  for (const change of plan.changes) {
    const path = join(projectRoot, change.path);

    if (change.action === 'create' || change.action === 'update') {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, change.content);
    } else if (change.action === 'delete') {
      await rm(path);
    }
  }
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('createChangePlan', () => {
  it('classifies desired files against disk and recorded ownership', async () => {
    const projectRoot = await createProject({
      'unchanged.md': 'same',
      'update.md': 'old',
      'edited.md': 'local edit',
      'edited-to-match.md': 'new',
      'unmanaged.md': 'project content',
      'unmanaged-identical.md': 'same',
    });
    const plan = await createChangePlan({
      projectRoot,
      owners: [skill],
      managedFiles: [
        createRecord('unchanged.md', 'same'),
        createRecord('update.md', 'old'),
        createRecord('edited.md', 'original'),
        createRecord('edited-to-match.md', 'original'),
      ],
      files: [
        createDesired('create.md', 'new'),
        createDesired('unchanged.md', 'same'),
        createDesired('update.md', 'new'),
        createDesired('edited.md', 'new'),
        createDesired('edited-to-match.md', 'new'),
        createDesired('unmanaged.md', 'cli content'),
        createDesired('unmanaged-identical.md', 'same'),
      ],
    });

    expect(summarize(plan)).toEqual([
      ['create.md', 'create'],
      ['edited-to-match.md', 'adopt'],
      ['edited.md', 'conflict:locally-edited'],
      ['unchanged.md', 'unchanged'],
      ['unmanaged-identical.md', 'adopt'],
      ['unmanaged.md', 'conflict:unmanaged'],
      ['update.md', 'update'],
    ]);
    expect(plan.conflicts.find((change) => change.path === 'edited.md')).toMatchObject({
      current: Buffer.from('local edit'),
      desired: 'new',
    });
    expect(plan.hasChanges).toBe(true);
  });

  it('removes only files of the planned owners and protects edited ones', async () => {
    const projectRoot = await createProject({ 'delete.md': 'managed', 'edited.md': 'local edit', 'other.md': 'other' });
    const plan = await createChangePlan({
      projectRoot,
      owners: [skill],
      managedFiles: [
        createRecord('delete.md', 'managed'),
        createRecord('forget.md', 'gone'),
        createRecord('edited.md', 'managed'),
        createRecord('other.md', 'other', otherSkill),
      ],
      files: [],
    });

    expect(summarize(plan)).toEqual([
      ['delete.md', 'delete'],
      ['edited.md', 'conflict:edited-before-removal'],
      ['forget.md', 'forget'],
    ]);
    expect(plan.managedFiles.map((file) => file.path)).toEqual(['edited.md', 'other.md']);
  });

  it('refuses to take over files owned by owners outside the plan', async () => {
    const projectRoot = await createProject({ 'shared.md': 'other' });
    const plan = await createChangePlan({
      projectRoot,
      owners: [skill],
      managedFiles: [createRecord('shared.md', 'other', otherSkill)],
      files: [createDesired('shared.md', 'other')],
    });

    expect(summarize(plan)).toEqual([['shared.md', 'conflict:owned-elsewhere']]);
    expect(plan.managedFiles).toEqual([createRecord('shared.md', 'other', otherSkill)]);
  });

  it('transfers ownership between planned owners', async () => {
    const projectRoot = await createProject({ 'moved.md': 'content' });
    const plan = await createChangePlan({
      projectRoot,
      owners: [skill, otherSkill],
      managedFiles: [createRecord('moved.md', 'content', otherSkill)],
      files: [createDesired('moved.md', 'content')],
    });

    expect(summarize(plan)).toEqual([['moved.md', 'adopt']]);
    expect(plan.managedFiles).toEqual([createRecord('moved.md', 'content')]);
  });

  it('never writes through directories or symlinks', async () => {
    const projectRoot = await createProject({ 'folder/inner.md': 'x' });
    const plan = await createChangePlan({ projectRoot, owners: [skill], files: [createDesired('folder', 'x')] });

    expect(summarize(plan)).toEqual([['folder', 'conflict:not-a-file']]);
  });

  it.each([
    ['duplicate paths', [createDesired('a.md', 'a'), createDesired('a.md', 'b')], 'More than one planned file uses a.md'],
    ['unsafe paths', [createDesired('../a.md', 'a')], 'Invalid project path: ../a.md'],
    ['unplanned owners', [createDesired('a.md', 'a', otherSkill)], 'which is not being planned'],
  ])('rejects %s', async (_case, files, message) => {
    const projectRoot = await createProject();

    await expect(createChangePlan({ projectRoot, owners: [skill], files })).rejects.toThrow(message);
  });

  it('plans targeted edits to project-owned files without recording them', async () => {
    const projectRoot = await createProject({ 'AGENTS.md': '# Mine\n', 'same.md': 'same' });
    const plan = await createChangePlan({
      projectRoot,
      owners: [skill],
      files: [],
      edits: [
        { path: 'AGENTS.md', transform: (current) => `${current}appended\n` },
        { path: 'CLAUDE.md', transform: (current) => current ?? 'created\n' },
        { path: 'same.md', transform: (current) => current ?? '' },
      ],
    });

    expect(plan.changes).toMatchObject([
      { path: 'AGENTS.md', action: 'edit', owner: { type: 'project' }, content: '# Mine\nappended\n' },
      { path: 'CLAUDE.md', action: 'edit', currentSha256: undefined, content: 'created\n' },
    ]);
    expect(plan.managedFiles).toEqual([]);
  });

  it('rejects targeted edits to managed files', async () => {
    const projectRoot = await createProject({ 'a.md': 'a' });
    const edits = [{ path: 'a.md', transform: () => 'b' }];

    await expect(createChangePlan({ projectRoot, owners: [skill], files: [], edits, managedFiles: [createRecord('a.md', 'a')] })).rejects.toThrow(
      'a.md is managed and cannot receive a targeted edit',
    );
  });

  it('plans nothing on a repeat run after applying', async () => {
    const projectRoot = await createProject({ 'remove.md': 'old' });
    const options = {
      projectRoot,
      owners: [skill],
      files: [createDesired('nested/a.md', 'a'), createDesired('b.md', 'b')],
    };
    const first = await createChangePlan({ ...options, managedFiles: [createRecord('remove.md', 'old')] });

    await applyNonConflicting(projectRoot, first);

    const second = await createChangePlan({ ...options, managedFiles: first.managedFiles });

    expect(summarize(first)).toEqual([['b.md', 'create'], ['nested/a.md', 'create'], ['remove.md', 'delete']]);
    expect(summarize(second)).toEqual([['b.md', 'unchanged'], ['nested/a.md', 'unchanged']]);
    expect(second.hasChanges).toBe(false);
    expect(second.managedFiles).toEqual(first.managedFiles);
  });
});
