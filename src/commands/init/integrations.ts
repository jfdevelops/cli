import type { ProjectConfig } from '../../config/schema.js';
import type { DetectedIntegration } from '../../detect/integration.js';
import type { Prompter } from '../../prompts/prompter.js';
import type { SkillCatalog } from '../../skills/catalog.js';

function describeScopes(integration: DetectedIntegration) {

  return integration.scopes.map((scope) => (scope === '.' ? 'project root' : scope)).join(', ');
}

/** Offers detected dependencies for explicit adoption; detection alone never enables an integration. */
export async function confirmIntegrations(integrations: DetectedIntegration[], existing: ProjectConfig['addons'], prompter: Prompter) {
  const detectedNames = new Set(integrations.map((integration) => integration.name));
  const retained = existing.filter((addon) => !detectedNames.has(addon.name));

  if (integrations.length === 0) {
    prompter.info('No supported integrations detected.');

    return retained;
  }

  const selectAll = 'select-all';
  const detected = integrations.map((integration) => integration.name);
  const selection = await prompter.multiselect({
    message: 'Which detected integrations should this project adopt?',
    choices: [
      { value: selectAll, label: 'Select all', hint: 'adopt every detected integration' },
      ...integrations.map((integration) => ({ value: integration.name, label: integration.name, hint: describeScopes(integration) })),
    ],
    initialValues: detected,
  });
  const selectedNames = selection.includes(selectAll) ? detected : selection;
  const existingByName = new Map(existing.map((addon) => [addon.name, addon]));
  const selected = selectedNames.map((name) => existingByName.get(name) ?? { name, options: {} });

  return [...retained, ...selected];
}

/** Keeps skills from detected addon packages out of the catalog until that addon is confirmed. */
export function filterAddonSkills(catalog: SkillCatalog, integrations: DetectedIntegration[], addons: ProjectConfig['addons']): SkillCatalog {
  const detectedPackages = new Set(integrations.map((integration) => integration.package));
  const selectedNames = new Set(addons.map((addon) => addon.name));
  const selectedPackages = new Set(integrations.filter((integration) => selectedNames.has(integration.name)).map((integration) => integration.package));
  const skills = catalog.skills.filter((skill) => !detectedPackages.has(skill.source.package) || selectedPackages.has(skill.source.package));
  const skillSources = new Set(skills.map((skill) => `${skill.source.package}@${skill.source.version}:${skill.name}`));
  const conflicts = catalog.conflicts
    .map((conflict) => ({
      name: conflict.name,
      sources: conflict.sources.filter((source) => skillSources.has(`${source.package}@${source.version}:${conflict.name}`)),
    }))
    .filter((conflict) => conflict.sources.length > 1);

  return { ...catalog, skills, conflicts };
}
