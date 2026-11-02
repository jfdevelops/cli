import { describe, expect, it } from 'vitest';
import type { SkillCatalog } from '../../skills/catalog.js';
import { filterAddonSkills } from './integrations.js';

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
