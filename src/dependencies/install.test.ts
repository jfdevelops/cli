import { describe, expect, it } from 'vitest';
import { describeDevelopmentDependency, describePackageInstall, isExactVersion } from './install.js';

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

describe('describePackageInstall', () => {
  it.each([
    ['npm', 'npm install --save-dev --save-exact @jfdevelops/skills@latest'],
    ['pnpm', 'pnpm add --save-dev --save-exact --workspace-root @jfdevelops/skills@latest'],
    ['yarn', 'yarn add --dev --exact @jfdevelops/skills@latest'],
    ['bun', 'bun add --dev --exact @jfdevelops/skills@latest'],
  ] as const)('keeps an exact pin with %s', (packageManager, expected) => {
    expect(describePackageInstall(packageManager, '@jfdevelops/skills@latest', true, true, true)).toBe(expected);
  });

  it('leaves the range to the package manager by default', () => {
    expect(describePackageInstall('pnpm', '@acme/forms@latest', false)).toBe('pnpm add @acme/forms@latest');
  });
});

describe('isExactVersion', () => {
  it.each([
    ['1.2.3', true],
    ['0.11.0-beta.1', true],
    ['^1.2.3', false],
    ['~1.2.3', false],
    ['latest', false],
    ['workspace:*', false],
    [undefined, false],
  ] as const)('treats %s as exact: %s', (specifier, expected) => {
    expect(isExactVersion(specifier)).toBe(expected);
  });
});
