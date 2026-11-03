import { compareStrings } from '../../compare.js';
import { parseProjectConfig } from '../../config/read.js';
import type { ManagedFile, ProjectConfig } from '../../config/schema.js';
import { writeProjectConfig } from '../../config/write.js';
import { createInstructionEdits } from '../../instructions/edits.js';
import { createChangePlan, type FileEdit } from '../../plan/create.js';
import type { Prompter } from '../../prompts/prompter.js';
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
  // Targeted edits to project-owned files, such as new package files or workspace registration.
  edits?: FileEdit[];
  extraSteps?: string[];
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
  const plan = await createChangePlan({
    projectRoot: project.root,
    managedFiles: config.managedFiles,
    files: (await Promise.all(addedSkills.map((skill) => createSkillInstallFiles(skill)))).flat(),
    edits: [
      ...createInstructionEdits([...describeEnabledSkills(config.skills, catalog.skills), ...addedSkills], project.agentFiles),
      ...(changes.edits ?? []),
    ],
    owners: addedSkills.map((skill) => ({ type: 'skill' as const, name: skill.name })),
  });

  function createConfig(managedFiles: ManagedFile[]) {

    return {
      ...config,
      targets: changes.targets ?? config.targets,
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

  await writeProjectConfig(project.root, createConfig(result.managedFiles));

  if (!result.isComplete) {
    prompter.outro('Finished with errors. Run the command again to retry the failed files.');

    return 'incomplete';
  }

  return 'complete';
}
