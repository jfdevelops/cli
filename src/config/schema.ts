import { z } from 'zod';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'Expected a lowercase hex SHA-256 digest');
const nameSchema = z.string().max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Expected a lowercase kebab-case name');
const packageNameSchema = z.string().regex(/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/, 'Expected an npm package name');
const optionsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

// Project-relative POSIX path without drive letters, backslashes, or empty, `.`, or `..` segments.
export const projectPathSchema = z
  .string()
  .regex(/^(?!\/)(?!.*[\\:])(?!.*(?:^|\/)\.{0,2}(?:\/|$)).+$/, 'Expected a project-relative POSIX path');

// Directory inside a published package, matching the package skill metadata schema.
const packagePathSchema = z
  .string()
  .regex(/^\.\/(?!.*(?:^|\/)\.{1,2}(?:\/|$))[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/, 'Expected a ./-prefixed package path');

const targetSchema = z.strictObject({
  path: z.union([z.literal('.'), projectPathSchema]),
  kind: z.enum(['app', 'library']),
  template: nameSchema.optional(),
  options: optionsSchema.default({}),
});

const addonSchema = z.strictObject({
  name: z.string().min(1),
  options: optionsSchema.default({}),
});

const skillSchema = z.strictObject({
  name: nameSchema,
  required: z.boolean(),
  source: z.strictObject({
    package: packageNameSchema,
    version: z.string().min(1),
    path: packagePathSchema,
  }),
});

const managedFileOwnerSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('project') }),
  z.strictObject({ type: z.literal('skill'), name: nameSchema }),
  z.strictObject({ type: z.literal('addon'), name: z.string().min(1) }),
]);

const managedFileSchema = z.strictObject({
  path: projectPathSchema,
  owner: managedFileOwnerSchema,
  sha256: sha256Schema,
});

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }

    seen.add(value);
  }

  return [...duplicates];
}

export const projectConfigSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    generator: z.strictObject({
      package: packageNameSchema,
      version: z.string().min(1),
    }),
    project: z.strictObject({
      name: z.string().min(1),
      packageManager: z.enum(['npm', 'pnpm', 'yarn', 'bun']),
    }),
    formatter: z.string().min(1).optional(),
    targets: z.array(targetSchema).default([]),
    addons: z.array(addonSchema).default([]),
    skills: z.array(skillSchema).default([]),
    managedFiles: z.array(managedFileSchema).default([]),
  })
  .superRefine((config, context) => {
    const uniqueKeys = [
      ['targets', config.targets.map((target) => target.path)],
      ['addons', config.addons.map((addon) => addon.name)],
      ['skills', config.skills.map((skill) => skill.name)],
      ['managedFiles', config.managedFiles.map((file) => file.path)],
    ] as const;

    for (const [field, values] of uniqueKeys) {
      for (const duplicate of findDuplicates(values)) {
        context.addIssue({ code: 'custom', path: [field], message: `Duplicate entry: ${duplicate}` });
      }
    }

    const skillNames = new Set(config.skills.map((skill) => skill.name));
    const addonNames = new Set(config.addons.map((addon) => addon.name));

    config.managedFiles.forEach((file, index) => {
      const { owner } = file;
      const isMissingSkill = owner.type === 'skill' && !skillNames.has(owner.name);
      const isMissingAddon = owner.type === 'addon' && !addonNames.has(owner.name);

      if (isMissingSkill || isMissingAddon) {
        context.addIssue({
          code: 'custom',
          path: ['managedFiles', index, 'owner'],
          message: `Owner ${owner.type} is not enabled: ${owner.name}`,
        });
      }
    });
  });

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type ManagedFile = ProjectConfig['managedFiles'][number];
export type ManagedFileOwner = ManagedFile['owner'];
