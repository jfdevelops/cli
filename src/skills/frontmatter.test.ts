import { describe, expect, it } from 'vitest';
import { parseSkillFrontmatter } from './frontmatter.js';

describe('parseSkillFrontmatter', () => {
  it('reads YAML frontmatter, including CRLF files and quoted values', () => {
    const content = '---\r\nname: build-forms\r\ndescription: "Build forms: fields and validation"\r\n---\r\n\r\n# Forms\r\n';

    expect(parseSkillFrontmatter(content)).toEqual({
      name: 'build-forms',
      description: 'Build forms: fields and validation',
    });
  });

  it.each([
    ['missing frontmatter', '# Forms\n', 'SKILL.md has no frontmatter'],
    ['invalid YAML', '---\nname: [\n---\n', 'SKILL.md frontmatter is not valid YAML'],
    ['a missing description', '---\nname: build-forms\n---\n', 'Invalid SKILL.md frontmatter'],
    ['an invalid name', '---\nname: Build Forms\ndescription: Forms\n---\n', 'Invalid SKILL.md frontmatter'],
  ])('rejects %s', (_case, content, message) => {
    expect(() => parseSkillFrontmatter(content)).toThrow(message);
  });
});
