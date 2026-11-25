import type { Prompter } from '../../prompts/prompter.js';

export const scriptResolutions = ['keep', 'replace', 'merge'] as const;

export type ScriptResolution = (typeof scriptResolutions)[number];

/** A package.json script whose current command differs from the one the CLI generates. */
export type ScriptConflict = { manifestPath: string; name: string; current: string; generated: string };

export type ScriptConflictResolver = (conflict: ScriptConflict) => Promise<ScriptResolution>;

// Merged scripts run the project's command first, then the CLI's.
export function mergeScript(current: string, generated: string) {

  return `${current} && ${generated}`;
}

/** Chooses each generated script's command, asking the resolver only when the project's command differs. */
export async function resolveScripts(
  manifestPath: string,
  current: object,
  generated: Record<string, string>,
  resolveConflict: ScriptConflictResolver,
) {
  const scripts: Record<string, string> = {};
  const currentScripts = new Map<string, unknown>(Object.entries(current));

  for (const [name, script] of Object.entries(generated)) {
    const existing = currentScripts.get(name);

    if (typeof existing !== 'string' || existing === script) {
      scripts[name] = script;
      continue;
    }

    // An earlier merge already runs the generated command, so it is not asked about again.
    if (existing.endsWith(` && ${script}`)) {
      scripts[name] = existing;
      continue;
    }

    const resolution = await resolveConflict({ manifestPath, name, current: existing, generated: script });

    scripts[name] = resolution === 'keep' ? existing : resolution === 'merge' ? mergeScript(existing, script) : script;
  }

  return scripts;
}

const mergeWarning = 'Merged scripts run your command and then the CLI\'s. They can fail, conflict, or run work twice, so review them before committing.';

/**
 * Applies one resolution to every conflict when a policy is given; otherwise asks about each
 * conflicting script. Warns once when any script is merged.
 */
export function createScriptConflictResolver(prompter: Prompter, policy?: ScriptResolution): ScriptConflictResolver {
  let hasWarned = false;

  function warnOnMerge(resolution: ScriptResolution) {
    if (resolution === 'merge' && !hasWarned) {
      hasWarned = true;
      prompter.warn(mergeWarning);
    }

    return resolution;
  }

  return async (conflict) => {
    if (policy) {

      return warnOnMerge(policy);
    }

    const resolution = await prompter.select<ScriptResolution>({
      message: `The "${conflict.name}" script in ${conflict.manifestPath} differs from the CLI's. Which should be kept?`,
      choices: [
        { value: 'keep', label: 'Keep yours', hint: conflict.current },
        { value: 'replace', label: 'Use the CLI\'s', hint: conflict.generated },
        { value: 'merge', label: 'Merge both', hint: mergeScript(conflict.current, conflict.generated) },
      ],
      initialValue: 'keep',
    });

    return warnOnMerge(resolution);
  };
}
