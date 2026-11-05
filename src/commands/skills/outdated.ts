import { readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { compareStrings } from '../../compare.js';
import type { Prompter } from '../../prompts/prompter.js';
import { canonicalSkillDirectory } from '../../skills/agents.js';
import { readSkillFiles } from '../../skills/files.js';
import { loadUpstreamSkills, type UpstreamSkills } from '../../skills/upstream.js';

export type SkillsOutdatedResult = 'current' | 'outdated' | 'failed';

export type SkillsOutdatedOptions = {
  directory: string;
  prompter: Prompter;
  loadUpstream?: () => Promise<UpstreamSkills>;
};

async function findInstalledSkills(directory: string) {
  try {

    return (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory() || entry.isSymbolicLink()).map((entry) => entry.name).sort(compareStrings);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {

      return [];
    }

    throw error;
  }
}

/** Compares canonical project copies and all bundled resources with upstream main. Reads only. */
export async function runSkillsOutdated({ directory, prompter, loadUpstream = loadUpstreamSkills }: SkillsOutdatedOptions): Promise<SkillsOutdatedResult> {
  prompter.intro('jfdevelops skills outdated');

  try {
    const installedDirectory = join(resolve(directory), canonicalSkillDirectory);
    const names = await findInstalledSkills(installedDirectory);

    if (names.length === 0) {
      prompter.outro(`No installed skills found in ${canonicalSkillDirectory}.`);

      return 'current';
    }

    const upstream = await loadUpstream();
    const statuses: string[] = [];
    const skipped: string[] = [];
    let hasChanges = false;

    for (const name of names) {
      const expected = upstream.skills.get(name);

      if (!expected) {
        skipped.push(name);
        continue;
      }

      const local = await readSkillFiles(join(installedDirectory, name));
      const paths = [...new Set([...local.keys(), ...expected.keys()])].sort(compareStrings);
      const changed = paths.filter((path) => {
        const actual = local.get(path);
        const desired = expected.get(path);

        return !actual || !desired || !actual.equals(desired);
      });

      hasChanges ||= changed.length > 0;
      statuses.push(`${name}  ${changed.length > 0 ? `outdated · differs: ${changed.join(', ')}` : 'current'}`);
    }

    prompter.info(`Compared with jfdevelops/skills main at ${upstream.revision}.`);

    if (statuses.length > 0) {
      prompter.note(statuses.join('\n'), 'Installed skills');
    }

    if (skipped.length > 0) {
      prompter.info(`Not present in upstream; not compared: ${skipped.join(', ')}.`);
    }

    prompter.outro(hasChanges
      ? 'Skills differ from upstream main. Differences may include local edits; no files were changed.'
      : statuses.length > 0 ? 'All compared skills match upstream main.' : 'No installed skills could be compared with upstream main.');

    return hasChanges ? 'outdated' : 'current';
  } catch (error) {
    prompter.error(error instanceof Error ? error.message : String(error));
    prompter.cancel('Could not compare skills with upstream main. Check network access and that Git is installed.');

    return 'failed';
  }
}
