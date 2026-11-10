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

function findSkillByRequest(catalog: SkillCatalog, request: string) {
  const separator = request.lastIndexOf(':');
  const packageName = separator === -1 ? undefined : request.slice(0, separator);
  const skillName = separator === -1 ? request : request.slice(separator + 1);
  const matches = catalog.skills.filter(
    (skill) => skill.name === skillName && (packageName === undefined || skill.source.package === packageName),
  );

  if (matches.length === 0) {
    throw new Error(
      packageName
        ? `No skill named ${skillName} from ${packageName} is available.`
        : `No skill named ${skillName} is available. Use package:name when more than one package provides it.`,
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `${skillName} is provided by more than one package. Pass one of: ${matches.map((skill) => `${skill.source.package}:${skill.name}`).join(', ')}.`,
    );
  }

  return matches[0]!;
}

/**
 * Resolves skills for a non-interactive run. Omitting requests installs every catalog skill; for a
 * name provided by more than one package, an already-enabled source is kept, otherwise the skill
 * must be named as package:name.
 */
export function resolveSkills(catalog: SkillCatalog, enabledSkills: EnabledSkill[], requests: string[] | undefined, prompter: Prompter) {
  const conflictNames = new Set(catalog.conflicts.map((conflict) => conflict.name));
  const required = catalog.skills.filter((skill) => skill.required);
  const selected = new Map(required.map((skill) => [getSkillKey(skill), skill]));

  if (required.length > 0) {
    prompter.info(`Required convention skills: ${required.map((skill) => skill.name).join(', ')}`);
  }

  if (requests === undefined) {
    for (const skill of catalog.skills.filter((entry) => !entry.required && !conflictNames.has(entry.name))) {
      selected.set(getSkillKey(skill), skill);
    }

    for (const conflict of catalog.conflicts) {
      if (required.some((skill) => skill.name === conflict.name)) {
        continue;
      }

      const candidates = catalog.skills.filter((skill) => skill.name === conflict.name && !skill.required);
      const enabledCandidate = candidates.find((skill) => isEnabled(skill, enabledSkills));

      if (enabledCandidate) {
        selected.set(getSkillKey(enabledCandidate), enabledCandidate);
        continue;
      }

      if (candidates.length === 1 && candidates[0]) {
        selected.set(getSkillKey(candidates[0]), candidates[0]);
        continue;
      }

      throw new Error(
        `${conflict.name} is provided by more than one package. Pass --skills with one of: ${candidates.map((skill) => `${skill.source.package}:${skill.name}`).join(', ')}.`,
      );
    }

    return [...selected.values()];
  }

  for (const request of requests) {
    const skill = findSkillByRequest(catalog, request);

    selected.set(getSkillKey(skill), skill);
  }

  return [...selected.values()];
}

/**
 * Lets the user choose skills from the catalog, preselecting enabled ones. Names provided by more than
 * one package or version are resolved one at a time so a source is never chosen silently.
 */
export async function selectSkills(catalog: SkillCatalog, enabledSkills: EnabledSkill[], prompter: Prompter) {
  const conflictNames = new Set(catalog.conflicts.map((conflict) => conflict.name));
  const required = catalog.skills.filter((skill) => skill.required);
  const unambiguous = catalog.skills.filter((skill) => !skill.required && !conflictNames.has(skill.name));
  const selected: CatalogSkill[] = [...required];

  if (required.length > 0) {
    prompter.info(`Required convention skills: ${required.map((skill) => skill.name).join(', ')}`);
  }

  if (unambiguous.length > 0) {
    const keys = await prompter.multiselect({
      message: 'Select skills to install',
      choices: unambiguous.map((skill) => ({ value: getSkillKey(skill), label: skill.name, hint: describeSource(skill) })),
      initialValues: unambiguous.filter((skill) => isEnabled(skill, enabledSkills)).map((skill) => getSkillKey(skill)),
    });

    selected.push(...unambiguous.filter((skill) => keys.includes(getSkillKey(skill))));
  }

  for (const conflict of catalog.conflicts) {
    if (required.some((skill) => skill.name === conflict.name)) {
      prompter.warn(`${conflict.name} is required from @jfdevelops/skills; other providers were ignored.`);
      continue;
    }

    const candidates = catalog.skills.filter((skill) => skill.name === conflict.name && !skill.required);

    if (candidates.length === 0) {
      continue;
    }
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
