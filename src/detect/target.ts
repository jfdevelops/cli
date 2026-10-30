import type { PackageManifest } from './manifest.js';

export type TargetKind = 'app' | 'library' | 'unknown';

// Dependencies that only make sense in a deployable application.
const appFrameworks = [
  '@react-router/dev',
  '@remix-run/dev',
  '@sveltejs/kit',
  '@tanstack/react-start',
  '@tanstack/solid-start',
  'astro',
  'electron',
  'expo',
  'next',
  'nuxt',
];

const entryFields = ['exports', 'main', 'module', 'types', 'bin'] as const;

function createClassification(kind: TargetKind, reasons: string[]) {

  return { kind, reasons };
}

export function classifyTarget(manifest: PackageManifest) {
  const dependencies = { ...manifest.devDependencies, ...manifest.dependencies };
  const appReasons = appFrameworks.filter((name) => name in dependencies).map((name) => `depends on ${name}`);
  const entries = entryFields.filter((field) => manifest[field] !== undefined);
  const isPublishable = manifest.private !== true && manifest.name !== undefined;
  const libraryReasons = isPublishable ? [entries.length > 0 ? `publishes ${entries.join(', ')}` : 'is not private'] : [];

  if (appReasons.length > 0 && libraryReasons.length > 0) {

    return createClassification('unknown', [...appReasons, ...libraryReasons]);
  }

  if (appReasons.length > 0) {

    return createClassification('app', appReasons);
  }

  if (libraryReasons.length > 0) {

    return createClassification('library', libraryReasons);
  }

  return createClassification('unknown', ['is private without an app framework']);
}
