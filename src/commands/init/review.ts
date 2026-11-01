import type { Prompter } from '../../prompts/prompter.js';
import { canOverwrite, type ConflictResolution } from '../../plan/apply.js';
import type { ChangePlan, ConflictReason } from '../../plan/create.js';
import { formatChangeDiff } from '../../plan/diff.js';

const reasonDescriptions: Record<ConflictReason, string> = {
  'locally-edited': 'was edited after the CLI last wrote it',
  unmanaged: 'already exists and is not managed by the CLI',
  'owned-elsewhere': 'is managed for something outside this setup',
  'edited-before-removal': 'is no longer needed but was edited after the CLI wrote it',
  'not-a-file': 'is a directory or link, not a file',
};

// One line per change that would alter the project, aligned by action.
export function describePlan(plan: ChangePlan, isConfigChanged: boolean) {
  const lines = plan.changes
    .filter((change) => change.action !== 'unchanged')
    .map((change) => `${(change.action === 'conflict' ? 'conflict' : change.action).padEnd(9)} ${change.path}`);

  return isConfigChanged ? [...lines, `${'write'.padEnd(9)} jfdevelops.json`] : lines;
}

/**
 * Shows each conflict with its diff and asks whether to keep the current file or apply the planned
 * content. Conflicts that cannot be overwritten are reported and kept.
 */
export async function resolveConflicts(plan: ChangePlan, prompter: Prompter) {
  const resolutions: Record<string, ConflictResolution> = {};

  for (const conflict of plan.conflicts) {
    if (conflict.action !== 'conflict') {
      continue;
    }

    const description = `${conflict.path} ${reasonDescriptions[conflict.reason]}`;

    if (!canOverwrite(conflict.reason)) {
      prompter.warn(`${description}; it will be left unchanged.`);
      resolutions[conflict.path] = 'keep';
      continue;
    }

    prompter.note(formatChangeDiff(conflict.path, conflict.current, conflict.desired), description);
    resolutions[conflict.path] = await prompter.select({
      message: `How should ${conflict.path} be handled?`,
      choices: [
        { value: 'keep', label: 'Keep the current file' },
        { value: 'overwrite', label: conflict.desired === undefined ? 'Delete it' : 'Replace it with the planned content' },
      ],
      initialValue: 'keep',
    });
  }

  return resolutions;
}
