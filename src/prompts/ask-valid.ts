import type { Prompter } from './prompter.js';

export type Validated<Value> = { value: Value } | { error: string };

/**
 * Asks a text question until the trimmed answer passes validation, showing the reason after each
 * rejected answer. Cancelling still rejects, so a wrong answer never discards the answers before it.
 */
export async function askValidText<Value>(
  prompter: Prompter,
  options: Parameters<Prompter['text']>[0],
  validate: (answer: string) => Validated<Value>,
) {
  while (true) {
    const result = validate((await prompter.text(options)).trim());

    if ('value' in result) {

      return result.value;
    }

    prompter.warn(result.error);
  }
}
