import type { ProjectDetection } from '../../detect/project.js';
import type { Prompter } from '../../prompts/prompter.js';

export type ConfirmedTarget = { path: string; kind: 'app' | 'library' };

type DetectedTarget = ProjectDetection['targets'][number];

function describeTarget(target: DetectedTarget) {

  return target.path === '.' ? (target.name ?? 'the project root') : `${target.path}${target.name ? ` (${target.name})` : ''}`;
}

async function askKind(target: DetectedTarget, prompter: Prompter, initialValue?: ConfirmedTarget['kind']) {

  return prompter.select({
    message: `Is ${describeTarget(target)} an app or a library?`,
    choices: [
      { value: 'app', label: 'App', hint: 'deployable application' },
      { value: 'library', label: 'Library', hint: 'published or shared package' },
    ],
    ...(initialValue ? { initialValue } : {}),
  });
}

/**
 * Shows detected targets, asks for the type of any ambiguous target, and lets the user correct
 * detected types before they are recorded.
 */
export async function confirmTargets(targets: DetectedTarget[], prompter: Prompter) {
  const confirmed: ConfirmedTarget[] = [];
  const hasDetectedKinds = targets.some((target) => target.kind !== 'unknown');

  prompter.note(
    targets.map((target) => `${describeTarget(target)}: ${target.kind} (${target.reasons.join(', ')})`).join('\n'),
    'Detected targets',
  );

  for (const target of targets) {
    confirmed.push({ path: target.path, kind: target.kind === 'unknown' ? await askKind(target, prompter) : target.kind });
  }

  if (!hasDetectedKinds || (await prompter.confirm({ message: 'Use these target types?', initialValue: true }))) {

    return confirmed;
  }

  const corrected: ConfirmedTarget[] = [];

  for (const [index, target] of targets.entries()) {
    corrected.push({ path: target.path, kind: await askKind(target, prompter, confirmed[index]?.kind) });
  }

  return corrected;
}
