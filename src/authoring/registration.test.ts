import { describe, expect, it } from 'vitest';
import { parseSkillFrontmatter } from '../skills/frontmatter.js';
import { createRegistrationEdit, createSkillDocument, isPublished } from './registration.js';

describe('isPublished', () => {
  it.each([
    [undefined, './skills/a', true],
    [['dist'], './skills/a', false],
    [['dist', 'skills'], './skills/a', true],
    [['./skills/'], './skills/a', true],
    [['skills/a'], './skills/a', true],
    [['skills/*'], './skills/a', true],
    [['**/SKILL.md'], './skills/a', true],
    [['skill'], './skills/a', false],
  ])('files %j publishes %s: %s', (files, path, expected) => {
    expect(isPublished(files, path)).toBe(expected);
  });
});

describe('createRegistrationEdit', () => {
  it('adds registrations and the unpublished directory while keeping order and indentation', () => {
    const current = '{\n\t"name": "@acme/forms",\n\t"files": ["dist"],\n\t"version": "1.0.0"\n}\n';
    const edit = createRegistrationEdit('package.json', [{ name: 'build-forms', path: './skills/build-forms' }]);
    const result = edit.transform(current);

    expect(result).toBe(
      '{\n\t"name": "@acme/forms",\n\t"files": [\n\t\t"dist",\n\t\t"skills"\n\t],\n\t"version": "1.0.0",\n\t"jfdevelops": {\n\t\t"skills": [\n\t\t\t{\n\t\t\t\t"name": "build-forms",\n\t\t\t\t"path": "./skills/build-forms"\n\t\t\t}\n\t\t]\n\t}\n}\n',
    );
  });

  it('never duplicates existing registrations', () => {
    const current = JSON.stringify({ name: 'forms', jfdevelops: { skills: [{ name: 'build-forms', path: './skills/build-forms' }] } });
    const edit = createRegistrationEdit('package.json', [
      { name: 'build-forms', path: './skills/build-forms' },
      { name: 'validate-forms', path: './skills/validate-forms' },
    ]);

    expect(JSON.parse(edit.transform(current)).jfdevelops.skills.map((entry: { name: string }) => entry.name)).toEqual(['build-forms', 'validate-forms']);
  });

  it('registers a name only once within one batch', () => {
    const edit = createRegistrationEdit('package.json', [
      { name: 'build-forms', path: './skills/build-forms' },
      { name: 'build-forms', path: './docs/build-forms' },
    ]);

    expect(JSON.parse(edit.transform(JSON.stringify({ name: 'forms' }))).jfdevelops.skills).toEqual([{ name: 'build-forms', path: './skills/build-forms' }]);
  });
});

describe('createSkillDocument', () => {
  it('writes frontmatter that parses back to the same name and description', () => {
    const description = 'Build forms: fields, validation, and "accessible" errors';

    expect(parseSkillFrontmatter(createSkillDocument('build-forms', description))).toMatchObject({ name: 'build-forms', description });
    expect(createSkillDocument('build-forms', description)).toContain('# Build Forms\n');
  });
});
