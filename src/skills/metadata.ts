import { z } from 'zod';

// Mirrors @jfdevelops/skills schemas/package-skills.schema.json.
export const skillNameSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Expected a lowercase kebab-case name');

export const packageSkillsSchema = z.strictObject({
  skills: z
    .array(
      z.strictObject({
        name: skillNameSchema,
        path: z
          .string()
          .regex(/^\.\/(?!.*(?:^|\/)\.{1,2}(?:\/|$))[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/, 'Expected a ./-prefixed package path'),
      }),
    )
    .min(1),
});

export type PackageSkillEntry = z.infer<typeof packageSkillsSchema>['skills'][number];
