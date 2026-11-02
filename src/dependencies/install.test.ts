import { describe, expect, it } from 'vitest';
import { describeDevelopmentDependency } from './install.js';

describe('describeDevelopmentDependency', () => {
  it.each([
    ['npm', 'npm install --save-dev --save-exact @jfdevelops/cli@0.1.0'],
    ['pnpm', 'pnpm add --save-dev --save-exact @jfdevelops/cli@0.1.0'],
    ['yarn', 'yarn add --dev --exact @jfdevelops/cli@0.1.0'],
    ['bun', 'bun add --dev --exact @jfdevelops/cli@0.1.0'],
  ] as const)('describes the %s command', (packageManager, expected) => {
    expect(describeDevelopmentDependency(packageManager, '@jfdevelops/cli', '0.1.0')).toBe(expected);
  });
});
