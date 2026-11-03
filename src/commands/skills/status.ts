import type { Prompter } from '../../prompts/prompter.js';
import { inspectSkills, type SkillStatus } from './inspect.js';

export type SkillsStatusResult = 'in-sync' | 'out-of-sync' | 'failed';

function formatStatuses(statuses: SkillStatus[]) {
  const nameWidth = Math.max(...statuses.map((status) => status.name.length));

  return statuses.map((status) => {
    const version = status.installedVersion ?? status.recordedVersion;
    const details = status.details.length > 0 ? ` · ${status.details.join(', ')}` : '';

    return `${status.name.padEnd(nameWidth)}  ${status.state.padEnd(14)}  ${status.package}@${version}${details}`;
  });
}

/** Reports whether each enabled skill matches its installed source package. Reads only. */
export async function runSkillsStatus({ directory, prompter }: { directory: string; prompter: Prompter }): Promise<SkillsStatusResult> {
  prompter.intro('jfdevelops skills');

  try {
    const { catalog, plan, statuses, availableNames } = await inspectSkills(directory);

    for (const problem of catalog.problems) {
      prompter.warn(`${problem.package}: ${problem.message}`);
    }

    if (statuses.length === 0) {
      prompter.info('No skills are enabled.');
    } else {
      prompter.note(formatStatuses(statuses).join('\n'), 'Enabled skills');
    }

    if (availableNames.length > 0) {
      prompter.info(`Also available from installed packages: ${availableNames.join(', ')}. Run jfdevelops init to enable them.`);
    }

    const isInSync = statuses.every((status) => status.state === 'current') && !plan.hasChanges;

    prompter.outro(isInSync ? 'All skills are in sync.' : 'Run jfdevelops skills sync to review and apply updates.');

    return isInSync ? 'in-sync' : 'out-of-sync';
  } catch (error) {
    prompter.error(error instanceof Error ? error.message : String(error));
    prompter.cancel('Could not read skill status.');

    return 'failed';
  }
}
