import type { ProjectConfig } from '../../config/schema.js';
import { detectProject } from '../../detect/project.js';
import { createInstructionEdits } from '../../instructions/edits.js';
import { createChangePlan, type ChangePlan } from '../../plan/create.js';
import { buildSkillCatalog, type CatalogSkill } from '../../skills/catalog.js';
import { createSkillInstallFiles } from '../../skills/files.js';
import { findSharedSkillsPackage } from '../../skills/shared.js';

type EnabledSkill = ProjectConfig['skills'][number];

export type SkillState = 'current' | 'outdated' | 'modified' | 'missing-source' | 'ambiguous';

export type SkillStatus = {
  name: string;
  package: string;
  recordedVersion: string;
  installedVersion: string | undefined;
  state: SkillState;
  details: string[];
};

export class MissingConfigError extends Error {
  override name = 'MissingConfigError';
}

function countFiles(count: number, description: string) {

  return `${count} ${description} file${count === 1 ? '' : 's'}`;
}

function describeChanges(plan: ChangePlan, name: string) {
  const changes = plan.changes.filter((change) => change.owner.type === 'skill' && change.owner.name === name);
  const edited = changes.filter((change) => change.action === 'conflict').length;
  const missing = changes.filter((change) => change.action === 'create').length;
  const stale = changes.filter((change) => change.action === 'update' || change.action === 'delete' || change.action === 'forget').length;
  const unrecorded = changes.filter((change) => change.action === 'adopt').length;
  const details = [
    ...(edited > 0 ? [countFiles(edited, 'locally edited')] : []),
    ...(missing > 0 ? [countFiles(missing, 'missing')] : []),
    ...(stale > 0 ? [countFiles(stale, 'outdated')] : []),
    ...(unrecorded > 0 ? [countFiles(unrecorded, 'unrecorded')] : []),
  ];

  return { hasEdits: edited > 0, hasChanges: changes.some((change) => change.action !== 'unchanged'), details };
}

function getSkillStatus(skill: EnabledSkill, candidates: CatalogSkill[], plan: ChangePlan): SkillStatus {
  const base = { name: skill.name, package: skill.source.package, recordedVersion: skill.source.version };
  const source = candidates.length === 1 ? candidates[0] : undefined;

  if (candidates.length === 0) {

    return { ...base, installedVersion: undefined, state: 'missing-source', details: [`${skill.source.package} is not installed`] };
  }

  if (!source) {
    const versions = candidates.map((candidate) => candidate.source.version).join(', ');

    return { ...base, installedVersion: undefined, state: 'ambiguous', details: [`more than one installed version (${versions}); run jfdevelops init to choose`] };
  }

  const { hasEdits, hasChanges, details } = describeChanges(plan, skill.name);
  const isUpgraded = source.source.version !== skill.source.version;
  const versionDetails = isUpgraded ? [`${skill.source.version} → ${source.source.version}`] : [];
  const state = hasEdits ? 'modified' : isUpgraded || hasChanges ? 'outdated' : 'current';

  return { ...base, installedVersion: source.source.version, state, details: [...versionDetails, ...details] };
}

/**
 * Compares each enabled skill with the version installed in the project. The returned plan would
 * bring unchanged copies up to date, delete files of skills listed in `removedSkills`, and refresh the
 * AGENTS.md skill list; skills whose source is missing or ambiguous are left untouched.
 */
export async function inspectSkills(directory: string, removedSkills: string[] = []) {
  const project = await detectProject(directory);
  const { config } = project;

  if (!config) {
    throw new MissingConfigError('No jfdevelops.json found. Run jfdevelops init first.');
  }

  const scopes = ['.', ...config.targets.map((target) => target.path)];
  const catalog = await buildSkillCatalog(project.root, scopes, [{ directory: findSharedSkillsPackage(), scope: '.', required: true }]);
  const candidatesByName = new Map(
    config.skills.map((skill) => [
      skill.name,
      catalog.skills.filter((candidate) => candidate.name === skill.name && candidate.source.package === skill.source.package),
    ]),
  );
  const removed = new Set(removedSkills);
  const sources = config.skills.flatMap((skill) => {
    const candidates = candidatesByName.get(skill.name) ?? [];
    const [source] = candidates;

    return source && candidates.length === 1 && !removed.has(skill.name) ? [source] : [];
  });
  const sourceNames = new Set(sources.map((source) => source.name));
  const keptSkills = config.skills
    .filter((skill) => !sourceNames.has(skill.name) && !removed.has(skill.name))
    .map((skill) => {
      const [candidate] = candidatesByName.get(skill.name) ?? [];

      return { name: skill.name, description: candidate?.description ?? `${skill.source.package} is not installed` };
    });
  const plan = await createChangePlan({
    projectRoot: project.root,
    managedFiles: config.managedFiles,
    files: (await Promise.all(sources.map((source) => createSkillInstallFiles(source)))).flat(),
    edits: createInstructionEdits([...sources, ...keptSkills], project.agentFiles),
    owners: [...sources.map((source) => source.name), ...removedSkills].map((name) => ({ type: 'skill' as const, name })),
  });
  const statuses = config.skills.map((skill) => getSkillStatus(skill, candidatesByName.get(skill.name) ?? [], plan));
  const enabledNames = new Set(config.skills.map((skill) => skill.name));
  const availableNames = [...new Set(catalog.skills.filter((skill) => !enabledNames.has(skill.name)).map((skill) => skill.name))];

  return { project, config, catalog, sources, plan, statuses, availableNames };
}

export type SkillsInspection = Awaited<ReturnType<typeof inspectSkills>>;
