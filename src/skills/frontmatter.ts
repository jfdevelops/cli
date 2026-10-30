import { parse } from 'yaml';
import { z } from 'zod';
import { skillNameSchema } from './metadata.js';

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

const skillFrontmatterSchema = z.looseObject({
  name: skillNameSchema,
  description: z.string().trim().min(1).max(1024),
});

export function parseSkillFrontmatter(content: string) {
  const match = content.match(frontmatterPattern);

  if (!match) {
    throw new Error('SKILL.md has no frontmatter');
  }

  let data: unknown;

  try {
    data = parse(match[1] ?? '');
  } catch (error) {
    throw new Error('SKILL.md frontmatter is not valid YAML', { cause: error });
  }

  const result = skillFrontmatterSchema.safeParse(data);

  if (!result.success) {
    throw new Error(`Invalid SKILL.md frontmatter:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}
