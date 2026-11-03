import type { ProjectConfig } from '../config/schema.js';
import type { CatalogSkill } from './catalog.js';

/**
 * Describes enabled skills for the AGENTS.md list, using the installed source's description when one
 * exists so every command renders the same list.
 */
export function describeEnabledSkills(skills: ProjectConfig['skills'], catalogSkills: CatalogSkill[]) {

  return skills.map((skill) => {
    const candidates = catalogSkills.filter((candidate) => candidate.name === skill.name && candidate.source.package === skill.source.package);
    const source = candidates.find((candidate) => candidate.source.version === skill.source.version) ?? candidates[0];

    return { name: skill.name, description: source?.description ?? `${skill.source.package} is not installed` };
  });
}
