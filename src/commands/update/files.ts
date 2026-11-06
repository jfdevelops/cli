import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ProjectConfig } from '../../config/schema.js';
import { readPackageManifest } from '../../detect/manifest.js';
import type { DesiredFile } from '../../plan/create.js';
import { createTemplateFiles, createJsonFile } from '../create/templates.js';
import { readPackageManagerVersion, type PackageManagerVersionReader } from '../create/lifecycle.js';
import { createWorkspaceFiles } from '../create/workspace.js';

// Rebuild tooling from recorded templates; application source and documentation belong to the project now.
export async function createProjectUpdateFiles(root: string, config: ProjectConfig, version: string, readVersion: PackageManagerVersionReader = readPackageManagerVersion) {
  const formatter = config.formatter;

  if (formatter !== 'prettier' && formatter !== 'biome') {

    return [];
  }

  const rootManifest = await readPackageManifest(root);
  const generatedTargets = config.targets.filter((target) => target.template);
  let files: DesiredFile[] = [];
  const single = generatedTargets.find((target) => target.path === '.');

  if (single?.template) {
    files = createTemplateFiles(config.project.name, single.template, version, formatter);
  } else if (generatedTargets.length > 0) {
    const packages = await Promise.all(generatedTargets.map(async (target) => ({
      name: (await readPackageManifest(join(root, target.path)))?.name ?? target.path.split('/').at(-1) ?? target.path,
      directory: target.path,
      kind: target.kind,
    })));
    const apps = packages.filter((target) => target.kind === 'app');
    const libraries = packages.filter((target) => target.kind === 'library');
    const recordedVersion = rootManifest?.packageManager?.match(new RegExp(`^${config.project.packageManager}@([0-9]+\\.[0-9]+\\.[0-9]+\\S*)$`))?.[1];
    const packageManagerVersion = recordedVersion ?? await readVersion(config.project.packageManager);

    files = createWorkspaceFiles({
      projectName: config.project.name,
      version,
      formatter,
      packageManager: config.project.packageManager,
      packageManagerVersion,
      layout: {
        appsDirectory: apps[0] ? dirname(apps[0].directory) : undefined,
        packagesDirectory: libraries[0] ? dirname(libraries[0].directory) : 'packages',
        apps,
        libraries,
      },
    });
  }

  const tooling = files.filter((file) => (!/(^|\/)(src|test)\//.test(file.path) || !existsSync(join(root, file.path))) && !/(^|\/)(README\.md|\.gitignore|pnpm-workspace\.yaml)$/.test(file.path));

  return Promise.all(tooling.map(async (file) => {
    if (!file.path.endsWith('package.json')) {

      return file;
    }

    const generated = JSON.parse(String(file.content)) as Record<string, unknown> & { scripts?: Record<string, string>; devDependencies?: Record<string, string> };
    const current = await readPackageManifest(join(root, dirname(file.path)));
    const currentScripts = current?.scripts;
    const scripts = typeof currentScripts === 'object' && currentScripts !== null ? currentScripts : {};
    const hasTaskConfig = files.some((candidate) => candidate.path === (dirname(file.path) === '.' ? 'vite.config.ts' : `${dirname(file.path)}/vite.config.ts`));
    const retainedScripts = Object.fromEntries(Object.entries(scripts).filter(([name]) => !hasTaskConfig || !['build', 'typecheck', 'test'].includes(name)));
    const runtimeDependencies = { ...current?.dependencies, ...current?.optionalDependencies };
    const developmentDependencies = Object.fromEntries(Object.entries(generated.devDependencies ?? {}).filter(([name]) => !(name in runtimeDependencies)));

    return createJsonFile(file.path, {
      ...current,
      ...generated,
      ...(current?.name ? { name: current.name } : {}),
      ...(current?.version ? { version: current.version } : {}),
      ...(current?.private !== undefined ? { private: current.private } : {}),
      ...(current?.workspaces ? { workspaces: current.workspaces } : {}),
      scripts: { ...retainedScripts, ...generated.scripts },
      devDependencies: { ...current?.devDependencies, ...developmentDependencies },
    });
  }));
}
