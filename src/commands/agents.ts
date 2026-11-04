import type { Prompter } from '../prompts/prompter.js';
import { agents, type AgentName } from '../skills/agents.js';

/** Asks which coding agents should load the skills; every skill is still installed once in .agents/skills. */
export async function chooseAgents(prompter: Prompter, initialValues: AgentName[]) {

  return prompter.multiselect<AgentName>({
    message: 'Which coding agents should load the skills?',
    choices: agents.map((agent) => ({ value: agent.name, label: agent.label, hint: agent.hint })),
    initialValues,
  });
}
