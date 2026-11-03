import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { inspectLibraryPackage, type LibraryPackageInspection } from '../../authoring/inspect.js';
import { listPackedFiles as defaultListPackedFiles, type PackedFileLister } from '../../authoring/packed-files.js';
import { validatePublication } from '../../authoring/publication.js';
import { createRegistrationEdit, createSkillDocument } from '../../authoring/registration.js';
import { isInsideDirectory } from '../../files/containment.js';
import { detectProject, type ProjectDetection } from '../../detect/project.js';
import { createChangePlan, type FileEdit } from '../../plan/create.js';
import { PromptCancelledError, type Prompter } from '../../prompts/prompter.js';
import { skillNameSchema, type PackageSkillEntry } from '../../skills/metadata.js';
import { confirmAndApply } from '../confirm-and-apply.js';

export type CreateSkillsOptions = {
  directory: string;
  prompter: Prompter;
  // Name of the workspace package that owns the skills.
  packageName?: string;
  // Skill directory to register or scaffold, relative to `directory`.
  skillPath?: string;
  listPackedFiles?: PackedFileLister;
};

export type CreateSkillsStatus = 'complete' | 'incomplete' | 'unchanged' | 'cancelled' | 'failed';

type DetectedTarget = ProjectDetection['targets'][number];

type Authoring = { register: PackageSkillEntry[]; scaffold?: { path: string; content: string } };

async function choosePackage(project: ProjectDetection, packageName: string | undefined, prompter: Prompter) {
  if (packageName) {
    const target = project.targets.find((candidate) => candidate.name === packageName);

    if (!target) {
      throw new Error(`No package named ${packageName} in ${project.root}.`);
    }

    return target;
  }

  const libraries = project.targets.filter((target): target is DetectedTarget & { name: string } => target.kind !== 'app' && target.name !== undefined);
  const [only] = libraries;

  if (!only) {
    throw new Error('No library package found. create skills registers skills in a publishable library package.');
  }

  if (libraries.length === 1) {

    return only;
  }

  const path = await prompter.select({
    message: 'Which package owns the skills?',
    choices: libraries.map((target) => ({ value: target.path, label: target.name, hint: target.path })),
  });

  return libraries.find((target) => target.path === path) ?? only;
}

async function isOccupied(path: string) {

  return existsSync(path) && (await readdir(path)).length > 0;
}

// Asks until the name is valid and not used by a registered, selected, or existing skill directory.
async function askSkillName(inspection: LibraryPackageInspection, packageRoot: string, register: PackageSkillEntry[], prompter: Prompter): Promise<string> {
  const name = (await prompter.text({ message: 'Skill name', placeholder: 'build-forms' })).trim();

  if (!skillNameSchema.safeParse(name).success) {
    prompter.warn('Use a lowercase kebab-case name of at most 64 characters.');

    return askSkillName(inspection, packageRoot, register, prompter);
  }

  const isTaken =
    [...inspection.registrations, ...register].some((entry) => entry.name === name) || (await isOccupied(join(packageRoot, 'skills', name)));

  if (isTaken) {
    prompter.warn(`${name} is already used by an existing skill.`);

    return askSkillName(inspection, packageRoot, register, prompter);
  }

  return name;
}

async function askDescription(prompter: Prompter): Promise<string> {
  const description = (await prompter.text({ message: 'Describe when an agent should use this skill', placeholder: 'Build forms with validation and accessible errors.' })).trim();

  if (description.length === 0 || description.length > 1024) {
    prompter.warn('Enter a description of 1 to 1024 characters.');

    return askDescription(prompter);
  }

  return description;
}

async function scaffoldSkill(packageRoot: string, path: string, name: string, prompter: Prompter) {
  if (await isOccupied(join(packageRoot, path))) {
    throw new Error(`${path} already exists and is not empty.`);
  }

  return { path, content: createSkillDocument(name, await askDescription(prompter)) };
}

// Registers or scaffolds the skill at an explicit path inside the package.
async function authorAtPath(inspection: LibraryPackageInspection, packageRoot: string, skillPath: string, prompter: Prompter): Promise<Authoring> {
  const relativePath = relative(packageRoot, skillPath).split(sep).join('/');
  const path = `./${relativePath}`;

  if (!isInsideDirectory(packageRoot, skillPath) || relativePath === '' || relativePath.startsWith('..')) {
    throw new Error(`${skillPath} is not inside the package.`);
  }

  if (inspection.registrations.some((entry) => entry.path === path)) {
    prompter.info(`${path} is already registered.`);

    return { register: [] };
  }

  const found = inspection.unregistered.find((skill) => skill.path === path);

  if (found && 'problem' in found) {
    throw new Error(`${path}/SKILL.md cannot be registered: ${found.problem}`);
  }

  const name = found?.name ?? basename(relativePath);
  const registeredElsewhere = inspection.registrations.find((entry) => entry.name === name);

  if (registeredElsewhere) {
    throw new Error(`${name} is already registered at ${registeredElsewhere.path}.`);
  }

  if (found) {

    return { register: [{ name: found.name, path }] };
  }

  if (!skillNameSchema.safeParse(name).success) {
    throw new Error(`The directory name ${name} is not a valid skill name; use lowercase kebab-case.`);
  }

  return { register: [{ name, path }], scaffold: await scaffoldSkill(packageRoot, relativePath, name, prompter) };
}

// Offers unregistered skills for registration, then optionally scaffolds a new one.
async function authorInteractively(inspection: LibraryPackageInspection, packageRoot: string, prompter: Prompter): Promise<Authoring> {
  const valid = inspection.unregistered.flatMap((skill) => ('name' in skill ? [skill] : []));
  const registeredNames = new Set(inspection.registrations.map((entry) => entry.name));
  const repeatedNames = new Set(valid.map((skill) => skill.name).filter((name, index, names) => names.indexOf(name) !== index || registeredNames.has(name)));

  // A name in several directories, or one already registered elsewhere, cannot be registered twice; --path picks one.
  for (const name of repeatedNames) {
    const paths = [...inspection.registrations.filter((entry) => entry.name === name), ...valid.filter((skill) => skill.name === name)].map((skill) => skill.path);

    prompter.warn(`${name} appears in more than one directory (${paths.join(', ')}). Register one with --path.`);
  }

  const registrable = valid.filter((skill) => !repeatedNames.has(skill.name));
  const paths =
    registrable.length === 0
      ? []
      : await prompter.multiselect({
          message: 'Register these existing skills?',
          choices: registrable.map((skill) => ({ value: skill.path, label: skill.name, hint: skill.path })),
          initialValues: registrable.map((skill) => skill.path),
        });
  const register = registrable.filter((skill) => paths.includes(skill.path)).map((skill) => ({ name: skill.name, path: skill.path }));

  if (!(await prompter.confirm({ message: 'Scaffold a new skill?', initialValue: register.length === 0 }))) {

    return { register };
  }

  const name = await askSkillName(inspection, packageRoot, register, prompter);
  const path = `skills/${name}`;

  return { register: [...register, { name, path: `./${path}` }], scaffold: await scaffoldSkill(packageRoot, path, name, prompter) };
}

function toProjectPath(packagePath: string, path: string) {

  return packagePath === '.' ? path : `${packagePath}/${path}`;
}

function createOnly(content: string) {

  return (current: string | undefined) => {
    if (current !== undefined) {
      throw new Error('SKILL.md already exists');
    }

    return content;
  };
}

async function authorSkills(options: CreateSkillsOptions): Promise<CreateSkillsStatus> {
  const { directory, prompter, listPackedFiles = defaultListPackedFiles } = options;
  const project = await detectProject(directory);
  const target = await choosePackage(project, options.packageName, prompter);
  const packageRoot = join(project.root, target.path);
  const inspection = await inspectLibraryPackage(packageRoot);

  for (const skill of inspection.unregistered) {
    if ('problem' in skill) {
      prompter.warn(`${skill.path}/SKILL.md cannot be registered: ${skill.problem}`);
    }
  }

  const authoring = options.skillPath
    ? await authorAtPath(inspection, packageRoot, resolve(directory, options.skillPath), prompter)
    : await authorInteractively(inspection, packageRoot, prompter);
  const edits: FileEdit[] = [
    ...(authoring.scaffold ? [{ path: toProjectPath(target.path, `${authoring.scaffold.path}/SKILL.md`), transform: createOnly(authoring.scaffold.content) }] : []),
    ...(authoring.register.length > 0 ? [createRegistrationEdit(toProjectPath(target.path, 'package.json'), authoring.register)] : []),
  ];
  const plan = await createChangePlan({ projectRoot: project.root, files: [], edits, owners: [] });

  if (plan.hasChanges) {
    const result = await confirmAndApply({ projectRoot: project.root, plan, prompter, isConfigChanged: false });

    if (!result.isComplete) {
      prompter.outro('Finished with errors. Run create skills again to retry.');

      return 'incomplete';
    }
  }

  return reportPublication(inspection.manifest.name ?? target.path, packageRoot, listPackedFiles, prompter, plan.hasChanges);
}

async function reportPublication(packageName: string, packageRoot: string, listPackedFiles: PackedFileLister, prompter: Prompter, hasChanges: boolean): Promise<CreateSkillsStatus> {
  const check = await validatePublication(packageRoot, listPackedFiles);

  for (const problem of check.problems) {
    prompter.error(problem);
  }

  if (check.missingFiles.length > 0) {
    prompter.error(`Not included in the published package: ${check.missingFiles.join(', ')}. Add their directory to the files field in package.json.`);
  }

  if (check.problems.length > 0 || check.missingFiles.length > 0) {
    prompter.outro(`${packageName} would not publish its skills correctly.`);

    return 'incomplete';
  }

  prompter.outro(`${packageName} publishes ${check.skills.length} skill${check.skills.length === 1 ? '' : 's'}: ${check.skills.map((skill) => skill.name).join(', ')}.`);

  return hasChanges ? 'complete' : 'unchanged';
}

/**
 * Registers a library package's existing skills or scaffolds new ones in its `jfdevelops.skills`
 * metadata, keeps them in the published files, and verifies the package tarball. Publishing is left
 * to the library's own release process.
 */
export async function runCreateSkills(options: CreateSkillsOptions): Promise<CreateSkillsStatus> {
  const { prompter } = options;

  prompter.intro('jfdevelops create skills');

  try {

    return await authorSkills(options);
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      prompter.cancel('Cancelled. No files were changed.');

      return 'cancelled';
    }

    prompter.error(error instanceof Error ? error.message : String(error));
    prompter.cancel('create skills failed.');

    return 'failed';
  }
}
