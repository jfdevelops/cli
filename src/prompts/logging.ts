import { PromptCancelledError, type Prompter } from './prompter.js';

function unsupported(kind: string): never {
  throw new Error(`Cannot ${kind} without a terminal. Pass flags for every choice, or run the command interactively.`);
}

/**
 * Writes progress to stdout/stderr for non-interactive runs. Interactive methods throw so a missing
 * flag surfaces as a clear failure instead of hanging.
 */
export function createLoggingPrompter(): Prompter {

  return {
    intro: (title) => {
      console.log(title);
    },
    outro: (message) => {
      console.log(message);
    },
    cancel: (message) => {
      console.error(message);
    },
    note: (message, title) => {
      console.log(title ? `${title}\n${message}` : message);
    },
    info: (message) => {
      console.log(message);
    },
    warn: (message) => {
      console.warn(message);
    },
    success: (message) => {
      console.log(message);
    },
    error: (message) => {
      console.error(message);
    },
    text: async () => unsupported('prompt for text'),
    select: async () => unsupported('prompt for a selection'),
    multiselect: async () => unsupported('prompt for selections'),
    confirm: async () => {
      throw new PromptCancelledError('Cannot confirm without --yes.');
    },
  };
}
