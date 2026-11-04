import { compareStrings } from '../compare.js';
import type { FileEdit } from '../plan/create.js';
import { canonicalSkillDirectory, findAgents, type AgentName } from '../skills/agents.js';
import { upsertManagedSection } from './section.js';

// Agent-specific instruction files that receive a pointer to AGENTS.md when they already exist.
const pointerFilePaths = ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md'];

function createSkillListing(skills: Array<{ name: string; description: string }>) {
  if (skills.length === 0) {

    return '## jfdevelops skills\n\nNo jfdevelops skills are enabled.';
  }

  const items = [...skills]
    .sort((left, right) => compareStrings(left.name, right.name))
    .map((skill) => `- [${skill.name}](${canonicalSkillDirectory}/${skill.name}/SKILL.md): ${skill.description}`);

  return ['## jfdevelops skills', '', 'Read each skill before the work it describes:', '', ...items].join('\n');
}

/**
 * Plans the managed AGENTS.md section listing enabled skills, creating AGENTS.md if needed, and a
 * pointer section in agent-specific instruction files the project already has or a selected agent
 * reads instead of AGENTS.md.
 */
export function createInstructionEdits(skills: Array<{ name: string; description: string }>, existingAgentFiles: string[], agentNames: readonly AgentName[]) {
  const listing = createSkillListing(skills);
  const pointer = 'Read AGENTS.md and load each jfdevelops skill it lists before the applicable task.';
  const selectedFiles = findAgents(agentNames).flatMap((agent) => (agent.instructionFile ? [agent.instructionFile] : []));
  const pointerEdits = [...new Set([...pointerFilePaths, ...selectedFiles])]
    .filter((path) => existingAgentFiles.includes(path) || selectedFiles.includes(path))
    .map((path): FileEdit => ({ path, transform: (current) => upsertManagedSection(current, pointer, '# Project instructions') }));

  return [
    { path: 'AGENTS.md', transform: (current) => upsertManagedSection(current, listing, '# Project agent instructions') },
    ...pointerEdits,
  ] satisfies FileEdit[];
}
