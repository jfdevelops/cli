import type { z } from 'zod';
import { compareStrings } from '../../compare.js';
import type { ManagedFile, ProjectConfig, projectConfigSchema } from '../../config/schema.js';
import type { PackageManagerName } from '../../detect/package-manager.js';
import type { CatalogSkill } from '../../skills/catalog.js';
import type { ConfirmedTarget } from './targets.js';

type InitConfigOptions = {
  existing: ProjectConfig | undefined;
  version: string;
  name: string;
  packageManager: PackageManagerName;
  targets: ConfirmedTarget[];
  selectedSkills: CatalogSkill[];
  missingSourceSkills: ProjectConfig['skills'];
  managedFiles: ManagedFile[];
};

/**
 * Builds the configuration recorded after init. Existing formatter, addons, and per-target template
 * and options are preserved. Skills that were not selected stay enabled while they still own managed
 * files, so kept or failed removals remain accounted for.
 */
export function createInitConfig(options: InitConfigOptions): z.input<typeof projectConfigSchema> {
  const { existing, managedFiles } = options;
  const existingTargets = new Map((existing?.targets ?? []).map((target) => [target.path, target]));
  const existingSkills = new Map((existing?.skills ?? []).map((skill) => [skill.name, skill]));
  const selectedNames = new Set(options.selectedSkills.map((skill) => skill.name));
  const ownerNames = new Set(managedFiles.flatMap((file) => (file.owner.type === 'skill' ? [file.owner.name] : [])));
  const missingSourceNames = new Set(options.missingSourceSkills.map((skill) => skill.name));
  const retainedSkills = (existing?.skills ?? []).filter(
    (skill) => !selectedNames.has(skill.name) && (ownerNames.has(skill.name) || missingSourceNames.has(skill.name)),
  );
  const selectedSkills = options.selectedSkills.map((skill) => ({
    name: skill.name,
    required: existingSkills.get(skill.name)?.required ?? false,
    source: skill.source,
  }));
  const targets = options.targets.map((target) => {
    const { template, options: targetOptions = {} } = existingTargets.get(target.path) ?? {};

    return { path: target.path, kind: target.kind, ...(template ? { template } : {}), options: targetOptions };
  });

  return {
    schemaVersion: 1,
    generator: { package: '@jfdevelops/cli', version: options.version },
    project: { name: options.name, packageManager: options.packageManager },
    ...(existing?.formatter ? { formatter: existing.formatter } : {}),
    targets,
    addons: existing?.addons ?? [],
    skills: [...selectedSkills, ...retainedSkills].sort((left, right) => compareStrings(left.name, right.name)),
    managedFiles,
  };
}
