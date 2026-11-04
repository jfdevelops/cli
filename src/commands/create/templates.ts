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
    devDependencies: { '@jfdevelops/cli': cliVersion, '@types/node': '^22.20.5', typescript: typescriptVersion, ...formatting.devDependencies },
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
 * Files for a library package inside an existing workspace. Formatting, linting, and the CLI
 * dependency stay at the workspace root, so the package only declares what it builds with.
 */
export function createWorkspacePackageFiles(packageName: string, { isPrivate = false } = {}) {
  const manifest = {
    name: packageName,
    ...(isPrivate ? { private: true } : {}),
    version: '0.0.0',
    type: 'module',
    files: ['dist'],
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
    scripts: { build: 'tsc', prepack: 'tsc' },
    devDependencies: { typescript: typescriptVersion },
  };

  return [
    { path: 'README.md', content: `# ${packageName}\n\nWorkspace library generated with @jfdevelops/cli.\n` },
    { path: 'package.json', content: `${JSON.stringify(manifest, null, 2)}\n` },
    { path: 'tsconfig.json', content: `${JSON.stringify(libraryCompiler, null, 2)}\n` },
    { path: 'src/index.ts', content: libraryEntry },
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
