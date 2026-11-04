import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { compareStrings } from '../compare.js';
import type { DesiredFile } from '../plan/create.js';
import { canonicalSkillDirectory, findAgents, type AgentName } from './agents.js';
import { frontmatterPattern } from './frontmatter.js';

// Reads every bundled resource; symlinks and special files are rejected rather than followed.
export async function readSkillFiles(directory: string, prefix = '') {
  const files = new Map<string, Buffer>();

  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      for (const [nestedPath, content] of await readSkillFiles(directory, path)) {
        files.set(nestedPath, content);
      }
    } else if (entry.isFile()) {
      files.set(path, await readFile(join(directory, path)));
    } else {
      throw new Error(`Unsupported skill resource: ${path}`);
    }
  }

  return new Map([...files].sort(([left], [right]) => compareStrings(left, right)));
}

// Keeps the source frontmatter so the agent discovers the stub exactly like the skill it points to.
function createSkillStub(name: string, skillDocument: Buffer) {
  const frontmatter = skillDocument.toString('utf8').match(frontmatterPattern)?.[0].trimEnd();

  if (!frontmatter) {
    throw new Error(`${name}/SKILL.md has no frontmatter`);
  }

  const path = `${canonicalSkillDirectory}/${name}/SKILL.md`;
  const body = `Read and follow \`${path}\`, relative to the project root, before this work. Resolve its references relative to that file.`;

  return `${frontmatter}\n\n${body}\n`;
}

/**
 * Plans one full copy of the skill in .agents/skills, which AGENTS.md links to, and a stub for each
 * selected agent that reads skills from its own directory instead.
 */
export async function createSkillInstallFiles(skill: { name: string; directory: string }, agentNames: readonly AgentName[]) {
  const resources = await readSkillFiles(skill.directory);
  const owner = { type: 'skill' as const, name: skill.name };
  const skillDocument = resources.get('SKILL.md');

  if (!skillDocument) {
    throw new Error(`${skill.name} has no SKILL.md`);
  }

  const copies = [...resources].map(([path, content]): DesiredFile => ({ path: `${canonicalSkillDirectory}/${skill.name}/${path}`, owner, content }));
  const stubs = findAgents(agentNames).flatMap((agent): DesiredFile[] =>
    agent.stubDirectory ? [{ path: `${agent.stubDirectory}/${skill.name}/SKILL.md`, owner, content: createSkillStub(skill.name, skillDocument) }] : [],
  );

  return [...copies, ...stubs];
}
