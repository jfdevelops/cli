export type AddonDefinition = { name: string; package: string; isDevelopment: boolean; description: string };

// Integrations offered for installation. Individual TanStack and jfdevelops libraries are also accepted by package name.
export const knownAddons: AddonDefinition[] = [
  { name: 'convex', package: 'convex', isDevelopment: false, description: 'Convex backend' },
  { name: 'portless', package: 'portless', isDevelopment: true, description: 'Named local development URLs' },
];

const reservedPackages = new Set(['@jfdevelops/cli', '@jfdevelops/skills']);

/** Resolves a supported addon by name; addon names match the integration names reported by detection. */
export function resolveAddon(name: string): AddonDefinition | undefined {
  const known = knownAddons.find((addon) => addon.name === name);

  if (known) {

    return known;
  }

  const isLibrary = /^@(tanstack|jfdevelops)\/[a-z0-9][a-z0-9._-]*$/.test(name) && !reservedPackages.has(name);

  return isLibrary ? { name, package: name, isDevelopment: false, description: `${name} library` } : undefined;
}
