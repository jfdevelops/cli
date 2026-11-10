import type { ProjectConfig } from '../../config/schema.js';
import { detectIntegrations } from '../../detect/integration.js';
import { detectProject } from '../../detect/project.js';
import { createInstructionEdits } from '../../instructions/edits.js';
import { createChangePlan, type ChangePlan } from '../../plan/create.js';
import { getConfiguredAgents } from '../../skills/agents.js';
import { buildSkillCatalog, type CatalogSkill } from '../../skills/catalog.js';
import { createSkillInstallFiles } from '../../skills/files.js';
import { describeEnabledSkills } from '../../skills/listing.js';
import { findSharedSkillsPackage } from '../../skills/shared.js';
import { filterAddonSkills } from '../init/integrations.js';

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

    return { ...base, installedVersion: undefined, state: 'ambiguous', details: [`more than one installed version (${versions}); run jfdevelops skills sync to choose`] };
  }

  const { hasEdits, hasChanges, details } = describeChanges(plan, skill.name);
  const isUpgraded = source.source.version !== skill.source.version;
  const versionDetails = isUpgraded ? [`${skill.source.version} → ${source.source.version}`] : [];
  const state = hasEdits ? 'modified' : isUpgraded || hasChanges ? 'outdated' : 'current';

  return { ...base, installedVersion: source.source.version, state, details: [...versionDetails, ...details] };
}

export type InspectSkillsOptions = {
  // Skills whose managed files should be deleted.
  removedSkills?: string[];
  skillNames?: string[];
  // Installed version to use for skills with more than one installed version, keyed by skill name.
  selectedVersions?: Record<string, string>;
};

/**
 * Reads the configured project and builds its skill catalog, keeping addon skills out until the addon
 * is enabled. `pendingAddons` are treated as enabled so an addon being added can offer its skills.
 */
export async function loadConfiguredProject(directory: string, pendingAddons: string[] = []) {
  const project = await detectProject(directory);
  const { config } = project;

  if (!config) {
    throw new MissingConfigError('No jfdevelops.json found. Run jfdevelops init first.');
  }

  const scopes = ['.', ...config.targets.map((target) => target.path)];
  const integrations = await detectIntegrations(project.root, scopes);
  const discovered = await buildSkillCatalog(project.root, scopes, [{ directory: findSharedSkillsPackage(project.root), scope: '.', required: true }]);

  const addons = [...config.addons, ...pendingAddons.map((name) => ({ name, options: {} }))];

  return { project, config, integrations, catalog: filterAddonSkills(discovered, integrations, addons) };
}

export function findSkillCandidates(skill: EnabledSkill, catalogSkills: CatalogSkill[]) {

  return catalogSkills.filter((candidate) => candidate.name === skill.name && candidate.source.package === skill.source.package);
}

/**
 * Compares each enabled skill with the version installed in the project. The returned plan would
 * bring unchanged copies up to date, delete files of removed skills, and refresh the AGENTS.md skill
 * list; skills whose source is missing, or ambiguous without a selected version, are left untouched.
 */
export async function inspectSkills(directory: string, { removedSkills = [], selectedVersions = {}, skillNames }: InspectSkillsOptions = {}) {
  const { project, config, integrations, catalog } = await loadConfiguredProject(directory);
  const candidatesByName = new Map(config.skills.map((skill) => [skill.name, findSkillCandidates(skill, catalog.skills)]));
  const removed = new Set(removedSkills);
  const sources = config.skills.flatMap((skill) => {
    const candidates = candidatesByName.get(skill.name) ?? [];
    const selectedVersion = selectedVersions[skill.name];
    const source = candidates.length === 1 ? candidates[0] : candidates.find((candidate) => candidate.source.version === selectedVersion);

    return source && (!skillNames || skillNames.includes(skill.name)) && !removed.has(skill.name) ? [source] : [];
  });
  const sourceNames = new Set(sources.map((source) => source.name));
  const keptSkills = config.skills.filter((skill) => !sourceNames.has(skill.name) && !removed.has(skill.name));
  const agents = getConfiguredAgents(config);
  const plan = await createChangePlan({
    projectRoot: project.root,
    managedFiles: config.managedFiles,
    files: (await Promise.all(sources.map((source) => createSkillInstallFiles(source, agents)))).flat(),
    edits: createInstructionEdits([...sources, ...describeEnabledSkills(keptSkills, catalog.skills)], project.agentFiles, agents),
    owners: [...sources.map((source) => source.name), ...removedSkills].map((name) => ({ type: 'skill' as const, name })),
  });
  const statuses = config.skills.map((skill) => getSkillStatus(skill, candidatesByName.get(skill.name) ?? [], plan));
  const enabledNames = new Set(config.skills.map((skill) => skill.name));
  const availableNames = [...new Set(catalog.skills.filter((skill) => !enabledNames.has(skill.name)).map((skill) => skill.name))];

  return { project, config, integrations, catalog, sources, plan, statuses, availableNames, candidatesByName };
}

export type SkillsInspection = Awaited<ReturnType<typeof inspectSkills>>;
