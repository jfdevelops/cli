import { parseProjectConfig } from '../../config/read.js';
import type { ManagedFile, ProjectConfig } from '../../config/schema.js';
import { writeProjectConfig } from '../../config/write.js';
import { PromptCancelledError, type Prompter } from '../../prompts/prompter.js';
import type { CatalogSkill } from '../../skills/catalog.js';
import { confirmAndApply } from '../confirm-and-apply.js';
import { inspectSkills, type SkillsInspection } from './inspect.js';

export type SkillsSyncStatus = 'complete' | 'incomplete' | 'unchanged' | 'cancelled' | 'failed';

/**
 * Records installed source versions for synchronized skills and drops removed skills once none of
 * their files remain managed; kept or failed removals stay enabled so their records stay valid.
 */
function createSyncConfig(config: ProjectConfig, sources: CatalogSkill[], removedSkills: string[], managedFiles: ManagedFile[]) {
  const sourcesByName = new Map(sources.map((source) => [source.name, source]));
  const ownerNames = new Set(managedFiles.flatMap((file) => (file.owner.type === 'skill' ? [file.owner.name] : [])));
  const skills = config.skills
    .filter((skill) => !removedSkills.includes(skill.name) || ownerNames.has(skill.name))
    .map((skill) => {
      const source = sourcesByName.get(skill.name);

      return source ? { ...skill, source: source.source } : skill;
    });

  return { ...config, skills, managedFiles };
}

async function chooseRemovedSkills(missing: Array<{ name: string; package: string }>, prompter: Prompter) {
  if (missing.length === 0) {

    return [];
  }

  return prompter.multiselect({
    message: 'These skills come from packages that are no longer installed. Which should be removed?',
    choices: missing.map((skill) => ({ value: skill.name, label: skill.name, hint: skill.package })),
    initialValues: missing.map((skill) => skill.name),
  });
}

// Asks which installed version to use for each skill that has more than one; unchosen skills stay as they are.
async function chooseVersions(inspection: SkillsInspection, prompter: Prompter) {
  const selectedVersions: Record<string, string> = {};

  for (const status of inspection.statuses.filter((candidate) => candidate.state === 'ambiguous')) {
    const candidates = inspection.candidatesByName.get(status.name) ?? [];
    const version = await prompter.select({
      message: `${status.name} is installed in more than one version. Which should be used?`,
      choices: [
        ...candidates.map((candidate) => ({
          value: candidate.source.version,
          label: `${candidate.source.package}@${candidate.source.version}`,
          hint: candidate.scopes.map((scope) => (scope === '.' ? 'project root' : scope)).join(', '),
        })),
        { value: 'keep', label: `Keep ${status.recordedVersion}` },
      ],
      initialValue: 'keep',
    });

    if (version !== 'keep') {
      selectedVersions[status.name] = version;
    }
  }

  return selectedVersions;
}

async function syncSkills(directory: string, prompter: Prompter): Promise<SkillsSyncStatus> {
  const initial = await inspectSkills(directory);

  for (const problem of initial.catalog.problems) {
    prompter.warn(`${problem.package}: ${problem.message}`);
  }

  const removedSkills = await chooseRemovedSkills(initial.statuses.filter((status) => status.state === 'missing-source'), prompter);
  const selectedVersions = await chooseVersions(initial, prompter);
  const hasChoices = removedSkills.length > 0 || Object.keys(selectedVersions).length > 0;
  const { project, config, sources, plan } = hasChoices ? await inspectSkills(directory, { removedSkills, selectedVersions }) : initial;
  const plannedConfig = parseProjectConfig(createSyncConfig(config, sources, removedSkills, plan.managedFiles));
  const isConfigChanged = JSON.stringify(plannedConfig) !== JSON.stringify(config);

  if (!plan.hasChanges && !isConfigChanged) {
    prompter.outro('Skills are already in sync.');

    return 'unchanged';
  }

  const result = await confirmAndApply({ projectRoot: project.root, plan, prompter, isConfigChanged });

  await writeProjectConfig(project.root, createSyncConfig(config, sources, removedSkills, result.managedFiles));

  if (!result.isComplete) {
    prompter.outro('Sync finished with errors. Run it again to retry the failed files.');

    return 'incomplete';
  }

  prompter.outro('Skills synchronized.');

  return 'complete';
}

/**
 * Updates unchanged skill copies to the installed source versions, offers to remove skills whose
 * source package is gone, and asks before replacing or deleting locally edited copies. Nothing is
 * written before the final confirmation.
 */
export async function runSkillsSync({ directory, prompter }: { directory: string; prompter: Prompter }): Promise<SkillsSyncStatus> {
  prompter.intro('jfdevelops skills sync');

  try {

    return await syncSkills(directory, prompter);
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      prompter.cancel('Sync cancelled. No files were changed.');

      return 'cancelled';
    }

    prompter.error(error instanceof Error ? error.message : String(error));
    prompter.cancel('Sync failed.');

    return 'failed';
  }
}
