import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from '../process/run.js';
import { discoverPackageSkills } from './discover.js';
import { readSkillFiles } from './files.js';

export type UpstreamSkills = { revision: string; skills: Map<string, Map<string, Buffer>> };

/** Reads one snapshot of upstream main without running repository scripts or changing the project. */
export async function loadUpstreamSkills(): Promise<UpstreamSkills> {
  const temporary = await mkdtemp(join(tmpdir(), 'jfdevelops-upstream-'));
  const directory = join(temporary, 'skills');

  try {
    await runCommand('git', ['clone', '--config', 'core.autocrlf=false', '--quiet', '--depth', '1', '--branch', 'main', '--single-branch', 'https://github.com/jfdevelops/skills.git', directory], {
      cwd: temporary,
      captureOutput: true,
    });
    const revision = (await runCommand('git', ['rev-parse', 'HEAD'], { cwd: directory, captureOutput: true })).trim();
    const discovery = await discoverPackageSkills(directory);

    if (!discovery || discovery.source.name !== '@jfdevelops/skills' || discovery.problems.length > 0) {
      throw new Error(`Could not read upstream skills: ${discovery?.problems.join('; ') || 'invalid package metadata'}`);
    }

    const skills = new Map<string, Map<string, Buffer>>();

    for (const skill of discovery.skills) {
      skills.set(skill.name, await readSkillFiles(skill.directory));
    }

    return { revision, skills };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
