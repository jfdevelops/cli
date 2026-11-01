import * as clack from '@clack/prompts';
import { PromptCancelledError, type Choice, type Prompter } from './prompter.js';

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

export function createClackPrompter(): Prompter {

  return {
    intro: (title) => clack.intro(title),
    outro: (message) => clack.outro(message),
    cancel: (message) => clack.cancel(message),
    note: (message, title) => clack.note(message, title),
    info: (message) => clack.log.info(message),
    warn: (message) => clack.log.warn(message),
    success: (message) => clack.log.success(message),
    error: (message) => clack.log.error(message),
    // Clack's option types are conditional on the value type, so prompts run with strings and narrow back
    // to the caller's value type, which only the provided choices can produce.
    select: async <Value extends string>({ message, choices, initialValue }: { message: string; choices: Choice<Value>[]; initialValue?: Value }) =>
      unwrap(await clack.select<string>(withDefined({ message, options: choices, initialValue }))) as Value,
    multiselect: async <Value extends string>({ message, choices, initialValues }: { message: string; choices: Choice<Value>[]; initialValues?: Value[] }) =>
      unwrap(await clack.multiselect<string>(withDefined({ message, options: choices, initialValues, required: false }))) as Value[],
    confirm: async ({ message, initialValue }) => unwrap(await clack.confirm(withDefined({ message, initialValue }))),
  };
}
