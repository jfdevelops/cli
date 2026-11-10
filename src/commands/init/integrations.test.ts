import { describe, expect, it } from 'vitest';
import type { SkillCatalog } from '../../skills/catalog.js';
import { createScriptedPrompter } from '../../testing/prompter.js';
import { confirmIntegrations, filterAddonSkills } from './integrations.js';

function createSkill(name: string, packageName: string) {

  return {
    name,
    description: name,
    directory: name,
    source: { package: packageName, version: '1.0.0', path: `./skills/${name}` },
    scopes: ['.'],
    required: false,
  };
}

describe('filterAddonSkills', () => {
  it('offers addon-owned skills only for confirmed integrations', () => {
    const catalog: SkillCatalog = {
      skills: [createSkill('convex-workflows', 'convex'), createSkill('build-forms', '@acme/forms')],
      conflicts: [],
      problems: [],
      missingDependencies: [],
    };
    const integrations = [{ name: 'convex', package: 'convex', scopes: ['.'] }];

    expect(filterAddonSkills(catalog, integrations, []).skills.map((skill) => skill.name)).toEqual(['build-forms']);
    expect(filterAddonSkills(catalog, integrations, [{ name: 'convex', options: {} }]).skills.map((skill) => skill.name)).toEqual([
      'convex-workflows',
      'build-forms',
    ]);
  });
});

describe('confirmIntegrations', () => {
  const integrations = [
    { name: 'convex', package: 'convex', scopes: ['.'] },
    { name: 'portless', package: 'portless', scopes: ['apps/web'] },
  ];

  it('preselects every installed integration and preserves existing options', async () => {
    const { prompter } = createScriptedPrompter((question) => {
      if (question.kind !== 'multiselect') {
        throw new Error('Expected integration selection');
      }

      expect(question.initialValues).toEqual(['convex', 'portless']);

      return question.initialValues ?? [];
    });

    await expect(confirmIntegrations(integrations, [{ name: 'convex', options: { custom: true } }], prompter)).resolves.toEqual([
      { name: 'convex', options: { custom: true } },
      { name: 'portless', options: {} },
    ]);
  });

  it('adopts every detected integration when Select all is chosen', async () => {
    const { prompter } = createScriptedPrompter((question) => {
      if (question.kind !== 'multiselect') {
        throw new Error('Expected integration selection');
      }

      return question.choices.filter((choice) => choice.label === 'Select all').map((choice) => choice.value);
    });

    await expect(confirmIntegrations(integrations, [], prompter)).resolves.toEqual([
      { name: 'convex', options: {} },
      { name: 'portless', options: {} },
    ]);
  });

  it('allows every preselected integration to be deselected', async () => {
    const { prompter } = createScriptedPrompter(() => []);

    await expect(confirmIntegrations(integrations, [{ name: 'convex', options: {} }], prompter)).resolves.toEqual([]);
  });
});
