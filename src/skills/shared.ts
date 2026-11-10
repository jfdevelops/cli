import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { findInstalledPackage } from './installed.js';

const require = createRequire(import.meta.url);

export function findSharedSkillsPackage(projectRoot?: string) {

  const installed = projectRoot ? findInstalledPackage(projectRoot, '@jfdevelops/skills', projectRoot) : undefined;

  return installed ?? dirname(require.resolve('@jfdevelops/skills/package.json'));
}
