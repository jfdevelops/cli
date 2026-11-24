import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from '../process/run.js';
import { buildSkillCatalog, type CatalogPackage, type SkillCatalog } from './catalog.js';
import { discoverPackageSkills } from './discover.js';

export const sharedSkillsPackageName = '@jfdevelops/skills';
export const sharedSkillsRepository = 'https://github.com/jfdevelops/skills.git';
export const sharedSkillsBranch = 'main';

export type SharedSkillsCheckout = {
  directory: string;
  revision: string;
  close: () => Promise<void>;
};

export type OpenSharedSkills = () => Promise<SharedSkillsCheckout>;

/**
 * Clones jfdevelops/skills main into a temporary directory. Callers must close the checkout when
 * finished so the temporary files are removed. Skill names come only from that package's metadata.
 */
export async function openSharedSkillsFromMain(run: typeof runCommand = runCommand): Promise<SharedSkillsCheckout> {
  const temporary = await mkdtemp(join(tmpdir(), 'jfdevelops-skills-'));
  const directory = join(temporary, 'skills');
  let closed = false;

  async function close() {
    if (!closed) {
      closed = true;
      await rm(temporary, { recursive: true, force: true });
    }
  }

  try {
    await run(
      'git',
      ['clone', '--config', 'core.autocrlf=false', '--quiet', '--depth', '1', '--branch', sharedSkillsBranch, '--single-branch', sharedSkillsRepository, directory],
      { cwd: temporary, captureOutput: true },
    );
    const revision = (await run('git', ['rev-parse', 'HEAD'], { cwd: directory, captureOutput: true })).trim();
    const discovery = await discoverPackageSkills(directory);

    if (!discovery || discovery.source.name !== sharedSkillsPackageName || discovery.problems.length > 0) {
      throw new Error(`Could not read shared skills from ${sharedSkillsBranch}: ${discovery?.problems.join('; ') || 'invalid package metadata'}`);
    }

    if (discovery.skills.length === 0) {
      throw new Error(`No skills are registered in ${sharedSkillsPackageName} on ${sharedSkillsBranch}.`);
    }

    return { directory, revision, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Marks every skill from the shared package required and records the checkout revision as its version. */
export function applySharedSkillsCheckout(catalog: SkillCatalog, checkout: SharedSkillsCheckout): SkillCatalog {

  return {
    ...catalog,
    skills: catalog.skills.map((skill) => {
      if (skill.source.package !== sharedSkillsPackageName) {

        return skill;
      }

      return {
        ...skill,
        required: true,
        source: { ...skill.source, version: checkout.revision },
      };
    }),
  };
}

export function sharedSkillsCatalogPackage(checkout: SharedSkillsCheckout): CatalogPackage {

  return { directory: checkout.directory, scope: '.', required: true };
}

/** Discovers project package skills plus every skill registered on the shared skills checkout. */
export async function buildSkillCatalogWithSharedSkills(
  projectRoot: string,
  scopes: string[],
  checkout: SharedSkillsCheckout,
) {

  return applySharedSkillsCheckout(
    await buildSkillCatalog(projectRoot, scopes, [sharedSkillsCatalogPackage(checkout)]),
    checkout,
  );
}
