import type { DesiredFile } from '../../plan/create.js';

export type ProjectKind = 'app' | 'library';

export type ProjectTemplate = {
  name: string;
  label: string;
  description: string;
  kind: ProjectKind;
};

export const projectTemplates = [
  {
    name: 'node-app',
    label: 'Node.js app',
    description: 'Minimal TypeScript application compiled for Node.js',
    kind: 'app',
  },
  {
    name: 'typescript-library',
    label: 'TypeScript library',
    description: 'Publishable ESM library with declarations',
    kind: 'library',
  },
] as const satisfies ProjectTemplate[];

const projectOwner = { type: 'project' as const };

function createJsonFile(path: string, value: unknown): DesiredFile {

  return { path, owner: projectOwner, content: `${JSON.stringify(value, null, 2)}\n` };
}

function createCommonFiles(projectName: string, template: ProjectTemplate): DesiredFile[] {

  return [
    { path: '.gitignore', owner: projectOwner, content: 'dist/\nnode_modules/\n' },
    { path: 'README.md', owner: projectOwner, content: `# ${projectName}\n\nGenerated from the ${template.label} template with @jfdevelops/cli.\n` },
  ];
}

function createAppFiles(projectName: string, template: ProjectTemplate, cliVersion: string): DesiredFile[] {
  const manifest = {
    name: projectName,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: { build: 'tsc', start: 'node dist/index.js' },
    devDependencies: { '@jfdevelops/cli': cliVersion, '@types/node': '^22.20.5', typescript: '^7.0.2' },
  };
  const compiler = {
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

  return [
    ...createCommonFiles(projectName, template),
    createJsonFile('package.json', manifest),
    createJsonFile('tsconfig.json', compiler),
    { path: 'src/index.ts', owner: projectOwner, content: "console.log('Hello from your jfdevelops app.');\n" },
  ];
}

function createLibraryFiles(projectName: string, template: ProjectTemplate, cliVersion: string): DesiredFile[] {
  const manifest = {
    name: projectName,
    version: '0.0.0',
    type: 'module',
    files: ['dist'],
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
    scripts: { build: 'tsc', prepack: 'tsc' },
    devDependencies: { '@jfdevelops/cli': cliVersion, typescript: '^7.0.2' },
  };
  const compiler = {
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

  return [
    ...createCommonFiles(projectName, template),
    createJsonFile('package.json', manifest),
    createJsonFile('tsconfig.json', compiler),
    { path: 'src/index.ts', owner: projectOwner, content: 'export function greet(name: string) {\n\n  return `Hello, ${name}.`;\n}\n' },
  ];
}

export function createTemplateFiles(projectName: string, templateName: string, cliVersion = '0.1.0') {
  const template = projectTemplates.find((candidate) => candidate.name === templateName);

  if (!template) {
    throw new Error(`Unknown project template: ${templateName}`);
  }

  return template.kind === 'app' ? createAppFiles(projectName, template, cliVersion) : createLibraryFiles(projectName, template, cliVersion);
}
