import type { DesiredFile } from '../../plan/create.js';

export type ProjectKind = 'app' | 'library';
export type FormatterName = 'prettier' | 'biome';

export type ProjectTemplate = {
  name: string;
  label: string;
  description: string;
  kind: ProjectKind;
};

export const libraryTemplateName = 'typescript-library';

export const projectTemplates = [
  {
    name: 'node-app',
    label: 'Node.js app',
    description: 'Minimal TypeScript application compiled for Node.js',
    kind: 'app',
  },
  {
    name: libraryTemplateName,
    label: 'TypeScript library',
    description: 'Publishable ESM library with declarations',
    kind: 'library',
  },
] as const satisfies ProjectTemplate[];

export const projectOwner = { type: 'project' as const };

// typescript-eslint, which the style policy runs on, supports TypeScript below 6.1.
export const typescriptVersion = '^6.0.3';

// Files rewritten by the CLI or package managers; formatting them would make managed copies look locally edited.
const unformattedPaths = ['.agents', '.claude/skills', 'jfdevelops.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'dist'];

export const appCompiler = {
  compilerOptions: {
    target: 'ES2024',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    rootDir: 'src',
    outDir: 'dist',
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    skipLibCheck: true,
  },
  include: ['src'],
};

export const appEntry = "console.log('Hello from your jfdevelops app.');\n";

const libraryCompiler = {
  compilerOptions: {
    target: 'ES2024',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    rootDir: 'src',
    outDir: 'dist',
    declaration: true,
    declarationMap: true,
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    skipLibCheck: true,
  },
  include: ['src'],
};

const libraryEntry = 'export function greet(name: string) {\n  return `Hello, ${name}.`;\n}\n';

// Workspace packages build, test, and run their tasks with Vite+, which bundles tsdown and Vitest.
export const vitePlusVersion = '^1.5.0';

const nodeTypesVersion = '^22.20.5';

// Type checks sources and tests together; tsconfig.build.json narrows it to the sources that are compiled.
const packageCompiler = {
  compilerOptions: {
    target: 'ES2024',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    noEmit: true,
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    skipLibCheck: true,
  },
  include: ['src', 'test'],
};

// `vp run` caches these tasks and first builds the workspace packages a package depends on.
function createPackageTasks(buildCommand: string) {
  const dependencyBuilds = "dependsOn: [{ task: 'build', from: ['dependencies', 'devDependencies'] }]";

  return `  run: {
    tasks: {
      build: { command: '${buildCommand}', ${dependencyBuilds} },
      typecheck: { command: 'tsc', ${dependencyBuilds} },
      test: { command: 'vp test run', ${dependencyBuilds} },
    },
  },`;
}

const libraryViteConfig = `import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: 'src/index.ts',
    format: 'esm',
    platform: 'neutral',
    fixedExtension: true,
    dts: true,
    sourcemap: true,
    tsconfig: 'tsconfig.build.json',
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
${createPackageTasks('vp pack')}
});
`;

const appViteConfig = `import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
${createPackageTasks('tsc -p tsconfig.build.json')}
});
`;

const libraryTest = `import { describe, expect, it } from 'vite-plus/test';
import { greet } from '../src/index.js';

describe('greet', () => {
  it('greets by name', () => {
    expect(greet('Ada')).toBe('Hello, Ada.');
  });
});
`;

const appTest = `import { it } from 'vite-plus/test';

it.todo('describes what the app does');
`;

type PackageFile = { path: string; content: string };

function createPackageFile(path: string, value: unknown): PackageFile {

  return { path, content: `${JSON.stringify(value, null, 2)}\n` };
}

function createPackageBuildCompiler(compilerOptions: Record<string, unknown>) {

  return { extends: './tsconfig.json', compilerOptions: { noEmit: false, rootDir: 'src', outDir: 'dist', ...compilerOptions }, include: ['src'] };
}

export function createJsonFile(path: string, value: unknown): DesiredFile {

  return { path, owner: projectOwner, content: `${JSON.stringify(value, null, 2)}\n` };
}

export function createCommonFiles(projectName: string, template: ProjectTemplate): DesiredFile[] {

  return [
    { path: '.gitignore', owner: projectOwner, content: 'dist/\nnode_modules/\n' },
    { path: 'README.md', owner: projectOwner, content: `# ${projectName}\n\nGenerated from the ${template.label} template with @jfdevelops/cli.\n` },
  ];
}

export function createFormattingFiles(formatter: FormatterName): DesiredFile[] {
  const eslintConfig = `import stylistic from '@stylistic/eslint-plugin';
import typescriptEslint from 'typescript-eslint';

export default [
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    languageOptions: { parser: typescriptEslint.parser },
    plugins: { '@stylistic': stylistic },
    rules: {
      curly: ['error', 'all'],
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'any', prev: 'import', next: 'import' },
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: 'block-like', next: '*' },
        { blankLine: 'always', prev: '*', next: 'block-like' },
      ],
    },
  },
];
`;
  const formatterFiles =
    formatter === 'prettier'
      ? [
          createJsonFile('.prettierrc.json', { singleQuote: true, printWidth: 140 }),
          { path: '.prettierignore', owner: projectOwner, content: `${unformattedPaths.join('\n')}\n` },
        ]
      : [
          createJsonFile('biome.json', {
            files: { includes: ['**', ...unformattedPaths.map((path) => `!${path}`)] },
            formatter: { enabled: true, indentStyle: 'space', indentWidth: 2, lineWidth: 140 },
            javascript: { formatter: { quoteStyle: 'single' } },
          }),
        ];

  return [{ path: 'eslint.config.js', owner: projectOwner, content: eslintConfig }, ...formatterFiles];
}

export function getFormattingManifest(formatter: FormatterName) {
  const formatterCommand = formatter === 'prettier' ? 'prettier' : 'biome format';

  return {
    scripts: {
      format: `${formatterCommand} --write . && eslint --fix .`,
      'format:check': `${formatterCommand} ${formatter === 'prettier' ? '--check ' : ''}. && eslint .`,
    },
    devDependencies: {
      '@stylistic/eslint-plugin': '^5.10.0',
      eslint: '^10.14.0',
      'typescript-eslint': '^8.72.1',
      ...(formatter === 'prettier' ? { prettier: '^3.9.10' } : { '@biomejs/biome': '^2.6.4' }),
    },
  };
}

function createAppFiles(projectName: string, template: ProjectTemplate, cliVersion: string, formatter: FormatterName): DesiredFile[] {
  const formatting = getFormattingManifest(formatter);
  const manifest = {
    name: projectName,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: { build: 'tsc', start: 'node dist/index.js', ...formatting.scripts },
    devDependencies: { '@jfdevelops/cli': cliVersion, '@types/node': nodeTypesVersion, typescript: typescriptVersion, ...formatting.devDependencies },
  };
  return [
    ...createCommonFiles(projectName, template),
    ...createFormattingFiles(formatter),
    createJsonFile('package.json', manifest),
    createJsonFile('tsconfig.json', appCompiler),
    { path: 'src/index.ts', owner: projectOwner, content: appEntry },
  ];
}

function createLibraryFiles(projectName: string, template: ProjectTemplate, cliVersion: string, formatter: FormatterName): DesiredFile[] {
  const formatting = getFormattingManifest(formatter);
  const manifest = {
    name: projectName,
    version: '0.0.0',
    type: 'module',
    files: ['dist'],
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
    scripts: { build: 'tsc', prepack: 'tsc', ...formatting.scripts },
    devDependencies: { '@jfdevelops/cli': cliVersion, typescript: typescriptVersion, ...formatting.devDependencies },
  };

  return [
    ...createCommonFiles(projectName, template),
    ...createFormattingFiles(formatter),
    createJsonFile('package.json', manifest),
    createJsonFile('tsconfig.json', libraryCompiler),
    { path: 'src/index.ts', owner: projectOwner, content: libraryEntry },
  ];
}

/**
 * Files for a library package inside a workspace, laid out like the jfdevelops libraries: sources in `src` and tests in
 * `test`, built with `vp pack` and tested with `vp test`. Formatting, linting, and the CLI dependency stay at the workspace root.
 */
export function createWorkspacePackageFiles(packageName: string, { isPrivate = false } = {}): PackageFile[] {
  const manifest = {
    name: packageName,
    ...(isPrivate ? { private: true } : {}),
    version: '0.0.0',
    type: 'module',
    files: ['dist'],
    exports: { '.': { types: './dist/index.d.mts', import: './dist/index.mjs' }, './package.json': './package.json' },
    scripts: { prepack: 'vp pack' },
    devDependencies: { typescript: typescriptVersion, 'vite-plus': vitePlusVersion },
  };

  return [
    { path: 'README.md', content: `# ${packageName}\n\nWorkspace library generated with @jfdevelops/cli.\n` },
    createPackageFile('package.json', manifest),
    createPackageFile('tsconfig.json', packageCompiler),
    createPackageFile('tsconfig.build.json', createPackageBuildCompiler({ declaration: true, declarationMap: true })),
    { path: 'vite.config.ts', content: libraryViteConfig },
    { path: 'src/index.ts', content: libraryEntry },
    { path: 'test/index.test.ts', content: libraryTest },
  ];
}

/** Files for an app inside a workspace, with the same `src` and `test` layout as its libraries. */
export function createWorkspaceAppFiles(packageName: string): PackageFile[] {
  const manifest = {
    name: packageName,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: { start: 'node dist/index.js' },
    devDependencies: { '@types/node': nodeTypesVersion, typescript: typescriptVersion, 'vite-plus': vitePlusVersion },
  };

  return [
    { path: 'README.md', content: `# ${packageName}\n\nWorkspace app generated with @jfdevelops/cli.\n` },
    createPackageFile('package.json', manifest),
    createPackageFile('tsconfig.json', packageCompiler),
    createPackageFile('tsconfig.build.json', createPackageBuildCompiler({})),
    { path: 'vite.config.ts', content: appViteConfig },
    { path: 'src/index.ts', content: appEntry },
    { path: 'test/index.test.ts', content: appTest },
  ];
}

export function createTemplateFiles(projectName: string, templateName: string, cliVersion = '0.1.0', formatter: FormatterName = 'prettier') {
  const template = projectTemplates.find((candidate) => candidate.name === templateName);

  if (!template) {
    throw new Error(`Unknown project template: ${templateName}`);
  }

  return template.kind === 'app'
    ? createAppFiles(projectName, template, cliVersion, formatter)
    : createLibraryFiles(projectName, template, cliVersion, formatter);
}
