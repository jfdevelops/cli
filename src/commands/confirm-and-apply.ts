import { applyChangePlan } from '../plan/apply.js';
import type { ChangePlan } from '../plan/create.js';
import { PromptCancelledError, type Prompter } from '../prompts/prompter.js';
import { describePlan, reportApplyResult, resolveConflicts } from './review.js';

type ConfirmAndApplyOptions = {
  projectRoot: string;
  plan: ChangePlan;
  prompter: Prompter;
  isConfigChanged: boolean;
  // Additional steps shown in the preview, such as dependency installation.
  extraSteps?: string[];
};

/**
 * Previews a plan, asks how to handle each conflict, and applies it after confirmation. Declining
 * throws PromptCancelledError before anything is written.
 */
export async function confirmAndApply({ projectRoot, plan, prompter, isConfigChanged, extraSteps = [] }: ConfirmAndApplyOptions) {
  prompter.note([...describePlan(plan, isConfigChanged), ...extraSteps].join('\n'), 'Planned changes');

  const resolutions = await resolveConflicts(plan, prompter);

  if (!(await prompter.confirm({ message: 'Apply these changes?', initialValue: true }))) {
    throw new PromptCancelledError('Declined');
  }

  const result = await applyChangePlan({ projectRoot, plan, resolutions });

  reportApplyResult(result, prompter);

  return result;
}
