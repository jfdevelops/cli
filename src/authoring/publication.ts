import { discoverPackageSkills } from '../skills/discover.js';
import { readSkillFiles } from '../skills/files.js';
import { isIgnoredByNpm } from './npm-ignored.js';
import type { PackedFileLister } from './packed-files.js';

/**
 * Checks a library the way a consumer will see it: every registration must resolve to a valid skill
 * inside the package, and every file of every registered skill must be in the published tarball.
 * Files npm never publishes, such as .DS_Store, are skipped because no files setting can include them.
 */
export async function validatePublication(packageRoot: string, listPackedFiles: PackedFileLister) {
  const discovery = await discoverPackageSkills(packageRoot);

  if (!discovery) {

    return { skills: [], problems: ['No skills are registered in jfdevelops.skills.'], missingFiles: [] };
  }

  const packed = new Set(await listPackedFiles(packageRoot));
  const missingFiles: string[] = [];

  for (const skill of discovery.skills) {
    const directory = skill.path.replace(/^\.\//, '');

    for (const file of (await readSkillFiles(skill.directory)).keys()) {
      if (!isIgnoredByNpm(file) && !packed.has(`${directory}/${file}`)) {
        missingFiles.push(`${directory}/${file}`);
      }
    }
  }

  return { skills: discovery.skills, problems: discovery.problems, missingFiles };
}

export type PublicationCheck = Awaited<ReturnType<typeof validatePublication>>;
