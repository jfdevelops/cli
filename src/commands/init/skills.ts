import type { ProjectConfig } from '../../config/schema.js';
import type { Prompter } from '../../prompts/prompter.js';
import type { CatalogSkill, SkillCatalog } from '../../skills/catalog.js';

type EnabledSkill = ProjectConfig['skills'][number];

function getSkillKey(skill: CatalogSkill) {

  return `${skill.source.package}@${skill.source.version}:${skill.name}`;
}

function describeSource(skill: CatalogSkill) {
  const scopes = skill.scopes.map((scope) => (scope === '.' ? 'project root' : scope)).join(', ');

  return `${skill.source.package}@${skill.source.version} · ${scopes}`;
}

function isEnabled(skill: CatalogSkill, enabledSkills: EnabledSkill[]) {

  return enabledSkills.some((enabled) => enabled.name === skill.name && enabled.source.package === skill.source.package);
}

// Enabled skills whose source package is no longer installed; their files and records are kept as they are.
export function findMissingSourceSkills(catalog: SkillCatalog, enabledSkills: EnabledSkill[]) {

  return enabledSkills.filter((enabled) => !catalog.skills.some((skill) => skill.name === enabled.name && skill.source.package === enabled.source.package));
}

/**
 * Lets the user choose skills from the catalog, preselecting enabled ones. Names provided by more than
 * one package or version are resolved one at a time so a source is never chosen silently.
 */
export async function selectSkills(catalog: SkillCatalog, enabledSkills: EnabledSkill[], prompter: Prompter) {
  const conflictNames = new Set(catalog.conflicts.map((conflict) => conflict.name));
  const unambiguous = catalog.skills.filter((skill) => !conflictNames.has(skill.name));
  const selected: CatalogSkill[] = [];

  if (unambiguous.length > 0) {
    const keys = await prompter.multiselect({
      message: 'Select skills to install',
      choices: unambiguous.map((skill) => ({ value: getSkillKey(skill), label: skill.name, hint: describeSource(skill) })),
      initialValues: unambiguous.filter((skill) => isEnabled(skill, enabledSkills)).map((skill) => getSkillKey(skill)),
    });

    selected.push(...unambiguous.filter((skill) => keys.includes(getSkillKey(skill))));
  }

  for (const conflict of catalog.conflicts) {
    const candidates = catalog.skills.filter((skill) => skill.name === conflict.name);
    const enabledCandidate = candidates.find((skill) => isEnabled(skill, enabledSkills));
    const key = await prompter.select({
      message: `${conflict.name} is provided by more than one package or version. Which should be installed?`,
      choices: [
        ...candidates.map((skill) => ({ value: getSkillKey(skill), label: describeSource(skill) })),
        { value: 'skip', label: 'Do not install' },
      ],
      initialValue: enabledCandidate ? getSkillKey(enabledCandidate) : 'skip',
    });
    const choice = candidates.find((skill) => getSkillKey(skill) === key);

    if (choice) {
      selected.push(choice);
    }
  }

  return selected;
}
