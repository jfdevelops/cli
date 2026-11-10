import { compareStrings } from '../../compare.js';
import { parseProjectConfig } from '../../config/read.js';
import type { ManagedFile, ProjectConfig } from '../../config/schema.js';
import { writeProjectConfig } from '../../config/write.js';
import { createInstructionEdits } from '../../instructions/edits.js';
import { createChangePlan, type DesiredFile, type FileEdit } from '../../plan/create.js';
import type { Prompter } from '../../prompts/prompter.js';
import { getConfiguredAgents } from '../../skills/agents.js';
import type { CatalogSkill } from '../../skills/catalog.js';
import { createSkillInstallFiles } from '../../skills/files.js';
import { describeEnabledSkills } from '../../skills/listing.js';
import { confirmAndApply } from '../confirm-and-apply.js';
import type { ProjectAdditions } from './additions.js';

export type AddStatus = 'complete' | 'incomplete' | 'unchanged' | 'cancelled' | 'failed';

export type AdditionChanges = {
  skills?: CatalogSkill[];
  addons?: ProjectConfig['addons'];
  targets?: ProjectConfig['targets'];
  // New managed scaffold files; existing project-owned files remain outside this partial plan.
  files?: DesiredFile[];
  // Targeted edits to existing files, such as workspace registration.
  edits?: FileEdit[];
  extraSteps?: string[];
  // How to retry when an edit fails; new targets are not recorded then, so the same command can run again.
  editRetryHint?: string;
};

function toEnabledSkill(skill: CatalogSkill) {

  return { name: skill.name, required: skill.required, source: skill.source };
}

/**
 * Plans the requested additions on top of the current setup, installing only the added skills and
 * refreshing the AGENTS.md list, then previews, applies, and records them after confirmation.
 */
export async function applyAdditions(additions: ProjectAdditions, changes: AdditionChanges, prompter: Prompter): Promise<AddStatus> {
  const { project, config, catalog } = additions;
  const addedSkills = changes.skills ?? [];
  const agents = getConfiguredAgents(config);
  const files = [...(await Promise.all(addedSkills.map((skill) => createSkillInstallFiles(skill, agents)))).flat(), ...(changes.files ?? [])];
  const plan = await createChangePlan({
    projectRoot: project.root,
    managedFiles: config.managedFiles,
    isRemovingMissingFiles: false,
    files,
    edits: [
      ...createInstructionEdits([...describeEnabledSkills(config.skills, catalog.skills), ...addedSkills], project.agentFiles, agents),
      ...(changes.edits ?? []),
    ],
    owners: [...addedSkills.map((skill) => ({ type: 'skill' as const, name: skill.name })), ...(changes.files ?? []).map((file) => file.owner)],
  });

  function createConfig(managedFiles: ManagedFile[], hasFailedEdits = false) {

    return {
      ...config,
      targets: hasFailedEdits ? config.targets : (changes.targets ?? config.targets),
      addons: changes.addons ?? config.addons,
      skills: [...config.skills, ...addedSkills.map((skill) => toEnabledSkill(skill))].sort((left, right) => compareStrings(left.name, right.name)),
      managedFiles,
    };
  }

  const isConfigChanged = JSON.stringify(parseProjectConfig(createConfig(plan.managedFiles))) !== JSON.stringify(config);

  if (!plan.hasChanges && !isConfigChanged) {
    prompter.outro('Nothing to add. The project already has these additions.');

    return 'unchanged';
  }

  const result = await confirmAndApply({ projectRoot: project.root, plan, prompter, isConfigChanged, extraSteps: changes.extraSteps ?? [] });

  const failedPaths = new Set(result.failed.map((file) => file.path));
  const editPaths = new Set([...(changes.edits ?? []).map((edit) => edit.path), ...(changes.files ?? []).map((file) => file.path)]);
  const hasFailedEdits = [...failedPaths].some((path) => editPaths.has(path));
  const skillPaths = new Set(plan.changes.filter((change) => change.owner.type === 'skill').map((change) => change.path));
  const hasFailedSkillFiles = [...failedPaths].some((path) => skillPaths.has(path));

  await writeProjectConfig(project.root, createConfig(result.managedFiles, hasFailedEdits));

  if (!result.isComplete) {
    // Added skills stay enabled, so skills sync restores their missing copies; a rerun of add would report them as enabled.
    const hints = [
      ...(hasFailedSkillFiles ? ['Run jfdevelops skills sync to install the remaining skill files.'] : []),
      ...(hasFailedEdits ? [changes.editRetryHint ?? 'Fix the reported files and run the command again.'] : []),
    ];

    prompter.outro(['Finished with errors.', ...hints].join(' '));

    return 'incomplete';
  }

  return 'complete';
}
