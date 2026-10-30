export type Choice<Value extends string> = { value: Value; label: string; hint?: string };

/**
 * Terminal input and output used by commands, so flows can run against Clack or a scripted test double.
 * Prompts reject with PromptCancelledError when the user cancels.
 */
export type Prompter = {
  intro: (title: string) => void;
  outro: (message: string) => void;
  cancel: (message: string) => void;
  note: (message: string, title?: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  select: <Value extends string>(options: { message: string; choices: Choice<Value>[]; initialValue?: Value }) => Promise<Value>;
  multiselect: <Value extends string>(options: { message: string; choices: Choice<Value>[]; initialValues?: Value[] }) => Promise<Value[]>;
  confirm: (options: { message: string; initialValue?: boolean }) => Promise<boolean>;
};

export class PromptCancelledError extends Error {
  override name = 'PromptCancelledError';
}
