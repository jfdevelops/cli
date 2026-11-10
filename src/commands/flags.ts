import type { ConflictResolution } from '../plan/apply.js';
import { agentNames, type AgentName } from '../skills/agents.js';

export function parseCommaList(value: string | undefined) {
  if (value === undefined || value.trim() === '') {

    return [];
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function parseAgentsFlag(value: string | undefined): AgentName[] {
  if (value === undefined) {

    return [...agentNames];
  }

  const names = parseCommaList(value);
  const invalid = names.filter((name) => !agentNames.includes(name as AgentName));

  if (invalid.length > 0) {
    throw new Error(`Unknown agent(s): ${invalid.join(', ')}. Use ${agentNames.join(', ')}.`);
  }

  if (names.length === 0) {
    throw new Error(`Pass at least one agent, or omit --agents to use all of them (${agentNames.join(', ')}).`);
  }

  return [...new Set(names)] as AgentName[];
}

export function parseConflictPolicy(value: string | undefined): ConflictResolution {

  return parseEnumFlag('conflicts', value, ['keep', 'overwrite'] as const, 'keep');
}

export function parseEnumFlag<Value extends string>(label: string, value: string | undefined, allowed: readonly Value[], fallback?: Value): Value {
  if (value === undefined) {
    if (fallback !== undefined) {

      return fallback;
    }

    throw new Error(`Missing --${label}. Use one of: ${allowed.join(', ')}.`);
  }

  if (!allowed.includes(value as Value)) {
    throw new Error(`Unknown ${label}: ${value}. Use one of: ${allowed.join(', ')}.`);
  }

  return value as Value;
}
