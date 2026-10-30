import { basename, join, resolve } from 'node:path';
import { readProjectConfig } from '../config/read.js';
import { detectAgentFiles } from './agent-files.js';
import { ManifestError, readPackageManifest } from './manifest.js';
import { detectPackageManager } from './package-manager.js';
import { classifyTarget } from './target.js';
import { detectWorkspace } from './workspace.js';

async function detectTarget(projectRoot: string, path: string) {
  const manifest = await readPackageManifest(join(projectRoot, path));

  if (!manifest) {
    throw new ManifestError(`Missing package.json in ${path}`);
  }

  return { path, name: manifest.name, ...classifyTarget(manifest) };
}

export async function detectProject(directory: string) {
  const projectRoot = resolve(directory);
  const manifest = await readPackageManifest(projectRoot);

  if (!manifest) {
    throw new ManifestError(`No package.json found in ${projectRoot}`);
  }

  const packageManagerDetection = detectPackageManager(projectRoot, manifest);
  const workspaceDetection = await detectWorkspace(projectRoot, manifest, packageManagerDetection.packageManager?.name);
  const targetPaths = workspaceDetection.workspace?.packagePaths ?? ['.'];

  return {
    root: projectRoot,
    name: manifest.name ?? basename(projectRoot),
    packageManager: packageManagerDetection.packageManager,
    lockfiles: packageManagerDetection.lockfiles,
    workspace: workspaceDetection.workspace,
    targets: await Promise.all(targetPaths.map((path) => detectTarget(projectRoot, path))),
    agentFiles: detectAgentFiles(projectRoot),
    config: await readProjectConfig(projectRoot),
    warnings: [...packageManagerDetection.warnings, ...workspaceDetection.warnings],
  };
}

export type ProjectDetection = Awaited<ReturnType<typeof detectProject>>;
