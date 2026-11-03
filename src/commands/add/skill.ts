import type { Prompter } from '../../prompts/prompter.js';
import type { CatalogSkill } from '../../skills/catalog.js';
import type { ProjectAdditions } from './additions.js';
import { applyAdditions, type AddStatus } from './apply.js';

function describeSource(skill: CatalogSkill) {
  const scopes = skill.scopes.map((scope) => (scope === '.' ? 'project root' : scope)).join(', ');

  return `${skill.source.package}@${skill.source.version} · ${scopes}`;
}

// Picks the source for a skill name, asking when several packages or versions provide it.
async function chooseSource(candidates: CatalogSkill[], prompter: Prompter) {
  const [only] = candidates;

  if (only && candidates.length === 1) {

    return only;
  }

  const key = await prompter.select({
    message: `${candidates[0]?.name} is provided by more than one package or version. Which should be installed?`,
    choices: candidates.map((candidate) => ({ value: `${candidate.source.package}@${candidate.source.version}`, label: describeSource(candidate) })),
  });

  return candidates.find((candidate) => `${candidate.source.package}@${candidate.source.version}` === key);
}

/** Enables one skill from an installed package without revisiting the rest of the setup. */
export async function addSkill(additions: ProjectAdditions, name: string, prompter: Prompter): Promise<AddStatus> {
  if (additions.config.skills.some((skill) => skill.name === name)) {
    prompter.outro(`${name} is already enabled. Run jfdevelops skills sync to update it.`);

    return 'unchanged';
  }

  const candidates = additions.skills.filter((skill) => skill.name === name);

  if (candidates.length === 0) {
    const available = [...new Set(additions.skills.map((skill) => skill.name))];

    throw new Error(`No installed package provides a skill named ${name}.${available.length > 0 ? ` Available: ${available.join(', ')}.` : ''}`);
  }

  const source = await chooseSource(candidates, prompter);
  const status = await applyAdditions(additions, { skills: source ? [source] : [] }, prompter);

  if (status === 'complete') {
    prompter.outro(`Enabled ${name}.`);
  }

  return status;
}

/** Lets the user pick any number of available skills, resolving names with several sources one at a time. */
export async function chooseSkills(additions: ProjectAdditions, prompter: Prompter) {
  const names = [...new Set(additions.skills.map((skill) => skill.name))];
  const selectedNames = await prompter.multiselect({
    message: 'Select skills to add',
    choices: names.map((name) => {
      const candidates = additions.skills.filter((skill) => skill.name === name);

      return { value: name, label: name, hint: candidates.length === 1 && candidates[0] ? describeSource(candidates[0]) : `${candidates.length} sources` };
    }),
  });
  const selected: CatalogSkill[] = [];

  for (const name of selectedNames) {
    const source = await chooseSource(additions.skills.filter((skill) => skill.name === name), prompter);

    if (source) {
      selected.push(source);
    }
  }

  return selected;
}
