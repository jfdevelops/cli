import { applyChangePlan, type ConflictResolution } from '../plan/apply.js';
import type { ChangePlan } from '../plan/create.js';
import { PromptCancelledError, type Prompter } from '../prompts/prompter.js';
import { renderPlanTree, reportApplyResult, resolveConflicts } from './review.js';

type ConfirmAndApplyOptions = {
  projectRoot: string;
  plan: ChangePlan;
  prompter: Prompter;
  isConfigChanged: boolean;
  // Additional steps shown in the preview, such as dependency installation.
  extraSteps?: string[];
  // When set, every overwritable conflict uses this choice and the apply confirm is accepted.
  nonInteractive?: { conflicts: ConflictResolution };
};

/**
 * Previews a plan, asks how to handle each conflict, and applies it after confirmation. Declining
 * throws PromptCancelledError before anything is written.
 */
export async function confirmAndApply({ projectRoot, plan, prompter, isConfigChanged, extraSteps = [], nonInteractive }: ConfirmAndApplyOptions) {
  prompter.note([renderPlanTree(projectRoot, plan, isConfigChanged), ...(extraSteps.length > 0 ? ['', ...extraSteps] : [])].join('\n'), 'Planned changes');

  const resolutions = await resolveConflicts(plan, prompter, nonInteractive?.conflicts);

  if (!nonInteractive && !(await prompter.confirm({ message: 'Apply these changes?', initialValue: true }))) {
    throw new PromptCancelledError('Declined');
  }

  const result = await applyChangePlan({ projectRoot, plan, resolutions });

  reportApplyResult(result, prompter);

  return result;
}
