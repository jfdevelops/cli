import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Instruction files and skill directories that adoption must preserve.
const agentFilePaths = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.cursor/rules',
  '.cursorrules',
  '.windsurfrules',
  '.agents/skills',
  '.claude/skills',
  '.cursor/skills',
  '.github/skills',
];

export function detectAgentFiles(projectRoot: string) {

  return agentFilePaths.filter((path) => existsSync(join(projectRoot, path)));
}
