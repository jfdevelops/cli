import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { agentSkillDirectories } from '../skills/agent-directories.js';

// Instruction files and skill directories that adoption must preserve.
const agentFilePaths = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.cursor/rules',
  '.cursorrules',
  '.windsurfrules',
  ...agentSkillDirectories,
];

export function detectAgentFiles(projectRoot: string) {

  return agentFilePaths.filter((path) => existsSync(join(projectRoot, path)));
}
