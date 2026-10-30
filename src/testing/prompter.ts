import { PromptCancelledError, type Choice, type Prompter } from '../prompts/prompter.js';

export type Question =
  | { kind: 'select'; message: string; choices: Choice<string>[]; initialValue: string | undefined }
  | { kind: 'multiselect'; message: string; choices: Choice<string>[]; initialValues: string[] | undefined }
  | { kind: 'confirm'; message: string; initialValue: boolean | undefined };

// Returning `cancel` simulates the user cancelling the prompt.
export type Respond = (question: Question) => string | string[] | boolean | 'cancel';

/**
 * Prompter double that answers through a callback and records every message and question in order,
 * so tests can assert on the conversation.
 */
export function createScriptedPrompter(respond: Respond) {
  const transcript: string[] = [];

  function ask(question: Question) {
    transcript.push(`? ${question.message}`);

    const answer = respond(question);

    if (answer === 'cancel') {
      throw new PromptCancelledError('Cancelled');
    }

    return answer;
  }

  function record(kind: string) {

    return (message: string, title?: string) => {
      transcript.push(`${kind}${title ? ` [${title}]` : ''}: ${message}`);
    };
  }

  const prompter: Prompter = {
    intro: record('intro'),
    outro: record('outro'),
    cancel: record('cancel'),
    note: record('note'),
    info: record('info'),
    warn: record('warn'),
    success: record('success'),
    error: record('error'),
    select: async <Value extends string>({ message, choices, initialValue }: { message: string; choices: Choice<Value>[]; initialValue?: Value }) =>
      ask({ kind: 'select', message, choices, initialValue }) as Value,
    multiselect: async <Value extends string>({ message, choices, initialValues }: { message: string; choices: Choice<Value>[]; initialValues?: Value[] }) =>
      ask({ kind: 'multiselect', message, choices, initialValues }) as Value[],
    confirm: async ({ message, initialValue }) => ask({ kind: 'confirm', message, initialValue }) as boolean,
  };

  return { prompter, transcript };
}
