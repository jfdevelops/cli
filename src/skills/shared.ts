import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);

export function findSharedSkillsPackage() {

  return dirname(require.resolve('@jfdevelops/skills/package.json'));
}
