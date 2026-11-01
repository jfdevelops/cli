import { existsSync } from 'node:fs';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ManagedFile, ManagedFileOwner } from '../config/schema.js';
import { createFixture, type FixtureFiles } from '../testing/fixture.js';
import { applyChangePlan } from './apply.js';
import { createChangePlan, type DesiredFile } from './create.js';
import { hashContent } from './hash.js';

const fixtures: Array<{ remove: () => Promise<void> }> = [];
const skill: ManagedFileOwner = { type: 'skill', name: 'jf-git' };

async function createProject(files: FixtureFiles = {}) {
  const fixture = await createFixture(files);

  fixtures.push(fixture);

  return fixture.root;
}

function createRecord(path: string, content: string): ManagedFile {

  return { path, owner: skill, sha256: hashContent(content) };
}

function createDesired(path: string, content: string): DesiredFile {

  return { path, owner: skill, content };
}

async function readText(projectRoot: string, path: string) {

  return readFile(join(projectRoot, path), 'utf8');
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.remove()));
});

describe('applyChangePlan', () => {
  it('applies every non-conflicting change and records the result', async () => {
    const projectRoot = await createProject({
      'update.md': 'old',
      'adopt.md': 'same',
      'skills/old/SKILL.md': 'remove me',
      'skills/kept/other.md': 'unrelated',
      'skills/kept/remove.md': 'remove me too',
    });
    const managedFiles = [
      createRecord('update.md', 'old'),
      createRecord('forget.md', 'gone'),
      createRecord('skills/old/SKILL.md', 'remove me'),
      createRecord('skills/kept/remove.md', 'remove me too'),
    ];
    const files = [createDesired('nested/create.md', 'new'), createDesired('update.md', 'new'), createDesired('adopt.md', 'same')];
    const plan = await createChangePlan({ projectRoot, owners: [skill], managedFiles, files });
    const result = await applyChangePlan({ projectRoot, plan });

    expect(result).toMatchObject({ isComplete: true, skipped: [], failed: [] });
    expect(result.applied).toEqual([
      { path: 'adopt.md', action: 'adopt' },
      { path: 'forget.md', action: 'forget' },
      { path: 'nested/create.md', action: 'create' },
      { path: 'skills/kept/remove.md', action: 'delete' },
      { path: 'skills/old/SKILL.md', action: 'delete' },
      { path: 'update.md', action: 'update' },
    ]);
    expect(result.managedFiles).toEqual(plan.managedFiles);
    expect(await readText(projectRoot, 'nested/create.md')).toBe('new');
    expect(await readText(projectRoot, 'update.md')).toBe('new');
    expect(existsSync(join(projectRoot, 'skills/old'))).toBe(false);
    expect(existsSync(join(projectRoot, 'skills/kept/other.md'))).toBe(true);

    const repeat = await createChangePlan({ projectRoot, owners: [skill], managedFiles: result.managedFiles, files });

    expect(repeat.hasChanges).toBe(false);
  });

  it('requires a decision for every conflict before writing anything', async () => {
    const projectRoot = await createProject({ 'edited.md': 'local edit' });
    const plan = await createChangePlan({
      projectRoot,
      owners: [skill],
      managedFiles: [createRecord('edited.md', 'original')],
      files: [createDesired('edited.md', 'new'), createDesired('create.md', 'new')],
    });

    await expect(applyChangePlan({ projectRoot, plan })).rejects.toThrow('edited.md needs a resolution (locally-edited)');
    await expect(applyChangePlan({ projectRoot, plan, resolutions: { 'create.md': 'keep' } })).rejects.toThrow(
      'create.md has a resolution but is not a conflict',
    );
    expect(existsSync(join(projectRoot, 'create.md'))).toBe(false);
  });

  it('keeps or overwrites conflicts as resolved', async () => {
    const projectRoot = await createProject({ 'keep.md': 'mine', 'overwrite.md': 'mine', 'removed.md': 'mine' });
    const plan = await createChangePlan({
      projectRoot,
      owners: [skill],
      managedFiles: [createRecord('keep.md', 'original'), createRecord('overwrite.md', 'original'), createRecord('removed.md', 'original')],
      files: [createDesired('keep.md', 'new'), createDesired('overwrite.md', 'new')],
    });
    const result = await applyChangePlan({
      projectRoot,
      plan,
      resolutions: { 'keep.md': 'keep', 'overwrite.md': 'overwrite', 'removed.md': 'overwrite' },
    });

    expect(result.applied).toEqual([
      { path: 'overwrite.md', action: 'overwrite' },
      { path: 'removed.md', action: 'delete' },
    ]);
    expect(result.skipped).toEqual([{ path: 'keep.md', reason: 'locally-edited' }]);
    expect(result.managedFiles).toEqual([createRecord('keep.md', 'original'), createRecord('overwrite.md', 'new')]);
    expect(await readText(projectRoot, 'keep.md')).toBe('mine');
    expect(await readText(projectRoot, 'overwrite.md')).toBe('new');
    expect(existsSync(join(projectRoot, 'removed.md'))).toBe(false);
  });

  it('refuses to overwrite files owned outside the plan', async () => {
    const projectRoot = await createProject({ 'shared.md': 'other' });
    const plan = await createChangePlan({
      projectRoot,
      owners: [skill],
      managedFiles: [{ path: 'shared.md', owner: { type: 'project' }, sha256: hashContent('other') }],
      files: [createDesired('shared.md', 'new')],
    });

    await expect(applyChangePlan({ projectRoot, plan, resolutions: { 'shared.md': 'overwrite' } })).rejects.toThrow(
      'shared.md cannot be overwritten (owned-elsewhere)',
    );
  });

  it('reports files changed since planning and continues with the rest', async () => {
    const projectRoot = await createProject({ 'update.md': 'old' });
    const plan = await createChangePlan({
      projectRoot,
      owners: [skill],
      managedFiles: [createRecord('update.md', 'old')],
      files: [createDesired('update.md', 'new'), createDesired('late.md', 'new'), createDesired('create.md', 'new')],
    });

    await writeFile(join(projectRoot, 'update.md'), 'edited after planning');
    await writeFile(join(projectRoot, 'late.md'), 'created after planning');

    const result = await applyChangePlan({ projectRoot, plan });

    expect(result.isComplete).toBe(false);
    expect(result.failed).toEqual([
      { path: 'late.md', action: 'create', message: 'changed on disk since the plan was created' },
      { path: 'update.md', action: 'update', message: 'changed on disk since the plan was created' },
    ]);
    expect(result.applied).toEqual([{ path: 'create.md', action: 'create' }]);
    expect(result.managedFiles).toEqual([createRecord('create.md', 'new'), createRecord('update.md', 'old')]);
    expect(await readText(projectRoot, 'update.md')).toBe('edited after planning');
  });

  it('refuses to write through directories linked outside the project', async () => {
    const outside = await createProject();
    const projectRoot = await createProject();

    await mkdir(join(outside, 'target'));
    await symlink(join(outside, 'target'), join(projectRoot, 'linked'), 'junction');

    const plan = await createChangePlan({ projectRoot, owners: [skill], files: [createDesired('linked/escape.md', 'x')] });
    const result = await applyChangePlan({ projectRoot, plan });

    expect(result.failed).toEqual([{ path: 'linked/escape.md', action: 'create', message: 'linked/escape.md resolves outside the project' }]);
    expect(existsSync(join(outside, 'target/escape.md'))).toBe(false);
  });
});
