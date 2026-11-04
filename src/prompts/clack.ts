import type { Readable, Writable } from 'node:stream';
import * as clack from '@clack/prompts';
import { PromptCancelledError, type Choice, type Prompter } from './prompter.js';

// Streams default to the process's stdin and stdout; tests pass their own to drive prompts with keystrokes.
export type ClackStreams = { input?: Readable; output?: Writable };

function unwrap<Result>(result: Result) {
  if (clack.isCancel(result)) {
    throw new PromptCancelledError('Cancelled');
  }

  return result as Exclude<Result, symbol>;
}

function withDefined<Options extends object>(options: Options) {

  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as {
    [Key in keyof Options]: Exclude<Options[Key], undefined>;
  };
}

export function createClackPrompter({ input, output }: ClackStreams = {}): Prompter {
  const streams = withDefined({ input, output });
  const outputOptions = withDefined({ output });

  return {
    intro: (title) => clack.intro(title, outputOptions),
    outro: (message) => clack.outro(message, outputOptions),
    cancel: (message) => clack.cancel(message, outputOptions),
    note: (message, title) => clack.note(message, title, outputOptions),
    info: (message) => clack.log.info(message, outputOptions),
    warn: (message) => clack.log.warn(message, outputOptions),
    success: (message) => clack.log.success(message, outputOptions),
    error: (message) => clack.log.error(message, outputOptions),
    text: async ({ message, defaultValue, placeholder }) =>
      unwrap(await clack.text(withDefined({ message, defaultValue, placeholder: placeholder ?? defaultValue, ...streams }))),
    // Clack's option types are conditional on the value type, so prompts run with strings and narrow back
    // to the caller's value type, which only the provided choices can produce.
    select: async <Value extends string>({ message, choices, initialValue }: { message: string; choices: Choice<Value>[]; initialValue?: Value }) =>
      unwrap(await clack.select<string>(withDefined({ message, options: choices, initialValue, ...streams }))) as Value,
    multiselect: async <Value extends string>({ message, choices, initialValues }: { message: string; choices: Choice<Value>[]; initialValues?: Value[] }) =>
      unwrap(await clack.multiselect<string>(withDefined({ message, options: choices, initialValues, required: false, ...streams }))) as Value[],
    confirm: async ({ message, initialValue }) => unwrap(await clack.confirm(withDefined({ message, initialValue, ...streams }))),
  };
}
