import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { frontmatterPattern } from './frontmatter.js';

export const agentNames = ['claude-code', 'codex', 'cursor', 'copilot'] as const;

export type AgentName = (typeof agentNames)[number];

type Agent = {
  name: AgentName;
  label: string;
  hint: string;
  // Skill directory the agent reads instead of .agents/skills; it receives a stub per skill.
  stubDirectory?: string;
  // Whether the agent preprocesses the skill's SKILL.md itself, which only works on a full copy in stubDirectory.
  isPreprocessed?: (skillDocument: string) => boolean;
  // Instruction file the agent reads instead of AGENTS.md; it receives a pointer to AGENTS.md.
  instructionFile?: string;
  // Paths whose presence shows the project already uses the agent.
  detectionPaths: string[];
};

// Every skill has exactly one full copy here, which AGENTS.md links to.
export const canonicalSkillDirectory = '.agents/skills';

// Claude Code substitutes arguments and ${CLAUDE_*} variables and runs !`command` injections in the SKILL.md it discovers.
const claudeSubstitutionPattern = /\$(?:ARGUMENTS|\d|\{CLAUDE_[A-Z_]+\})/;
// Fences may be indented, such as inside a list item.
const claudeCommandPattern = /(?:^|\s)!`|^[ \t]*```!/m;

function usesClaudePreprocessing(skillDocument: string) {
  const frontmatter = skillDocument.match(frontmatterPattern)?.[1] ?? '';

  return claudeSubstitutionPattern.test(skillDocument) || claudeCommandPattern.test(skillDocument) || /^arguments\s*:/m.test(frontmatter);
}

export const agents: Agent[] = [
  {
    name: 'claude-code',
    label: 'Claude Code',
    hint: 'gets a stub per skill in .claude/skills and a CLAUDE.md pointer',
    stubDirectory: '.claude/skills',
    isPreprocessed: usesClaudePreprocessing,
    instructionFile: 'CLAUDE.md',
    detectionPaths: ['CLAUDE.md', '.claude'],
  },
  { name: 'codex', label: 'Codex', hint: 'reads .agents/skills and AGENTS.md directly', detectionPaths: ['.codex'] },
  { name: 'cursor', label: 'Cursor', hint: 'reads .agents/skills and AGENTS.md directly', detectionPaths: ['.cursor', '.cursorrules'] },
  {
    name: 'copilot',
    label: 'GitHub Copilot',
    hint: 'reads .agents/skills and AGENTS.md directly',
    detectionPaths: ['.github/copilot-instructions.md', '.github/skills'],
  },
];

export function findAgents(names: readonly AgentName[]) {

  return agents.filter((agent) => names.includes(agent.name));
}

// Projects recorded before agents were selectable kept copies for every agent, so they keep all of them.
export function getConfiguredAgents(config: { agents?: AgentName[] | undefined } | undefined): AgentName[] {

  return config?.agents ?? [...agentNames];
}

export function detectAgents(projectRoot: string) {

  return agents.filter((agent) => agent.detectionPaths.some((path) => existsSync(join(projectRoot, path)))).map((agent) => agent.name);
}
