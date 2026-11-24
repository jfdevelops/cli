import { discoverPackageSkills } from './discover.js';
import { readSkillFiles } from './files.js';
import { openSharedSkillsFromMain, sharedSkillsPackageName, type OpenSharedSkills } from './shared.js';

export type UpstreamSkills = { revision: string; skills: Map<string, Map<string, Buffer>> };

/** Reads one snapshot of upstream main without running repository scripts or changing the project. */
export async function loadUpstreamSkills(openSharedSkills: OpenSharedSkills = openSharedSkillsFromMain): Promise<UpstreamSkills> {
  const checkout = await openSharedSkills();

  try {
    const discovery = await discoverPackageSkills(checkout.directory);

    if (!discovery || discovery.source.name !== sharedSkillsPackageName || discovery.problems.length > 0) {
      throw new Error(`Could not read upstream skills: ${discovery?.problems.join('; ') || 'invalid package metadata'}`);
    }

    const skills = new Map<string, Map<string, Buffer>>();

    for (const skill of discovery.skills) {
      skills.set(skill.name, await readSkillFiles(skill.directory));
    }

    return { revision: checkout.revision, skills };
  } finally {
    await checkout.close();
  }
}
