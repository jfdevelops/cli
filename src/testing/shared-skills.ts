import { createFixture } from './fixture.js';
import { createSkillPackage } from './skill-package.js';
import type { OpenSharedSkills, SharedSkillsCheckout } from '../skills/shared.js';

const defaultSkills = ['jf-coding-conventions', 'jf-docs', 'jf-git', 'jf-naming-conventions'];

/** Opens a temporary @jfdevelops/skills package for tests that would otherwise clone GitHub main. */
export function openTestSharedSkills(options: { skills?: string[]; revision?: string; version?: string } = {}): OpenSharedSkills {
  const skills = options.skills ?? defaultSkills;
  const revision = options.revision ?? 'test-revision';
  const version = options.version ?? '0.0.0';

  return async (): Promise<SharedSkillsCheckout> => {
    const fixture = await createFixture({
      ...createSkillPackage('.', { name: '@jfdevelops/skills', version, skills }),
    });

    return {
      directory: fixture.root,
      revision,
      close: fixture.remove,
    };
  };
}
