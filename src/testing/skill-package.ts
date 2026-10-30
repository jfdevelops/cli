import type { FixtureFiles } from './fixture.js';

type SkillPackageOptions = {
  name: string;
  version: string;
  skills: string[];
  dependencies?: Record<string, string>;
};

export function createSkillDocument(name: string, description = `Use ${name}`) {

  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
}

// Fixture files for an installed package that declares and bundles the given skills.
export function createSkillPackage(directory: string, { name, version, skills, dependencies }: SkillPackageOptions) {
  const files: FixtureFiles = {
    [`${directory}/package.json`]: {
      name,
      version,
      dependencies,
      jfdevelops: { skills: skills.map((skill) => ({ name: skill, path: `./skills/${skill}` })) },
    },
  };

  for (const skill of skills) {
    files[`${directory}/skills/${skill}/SKILL.md`] = createSkillDocument(skill);
  }

  return files;
}
