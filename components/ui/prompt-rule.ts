/**
 * The prompt dialog's options and its submit rule, shared by the provider
 * (`prompt-dialog.tsx`) and the lazily loaded view (`prompt-dialog-view.tsx`).
 * Their own module so the view does not import the provider that imports it.
 */

export interface PromptOptions {
  /** Heading: the question the native `prompt()` asked. */
  title: string;
  /** Visible label of the field. Omitted, the title names the field for assistive technology. */
  label?: string;
  /** Text the field opens with, selected so typing replaces it. */
  initialValue?: string;
  /** Submit button text. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Cancel button text. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Returns an already-translated error to block the submit, or null when the text is fine. */
  validate?: (value: string) => string | null;
}

/**
 * What a submit does with the field's text: the text itself, or the error that keeps the dialog
 * open. Pure so the rule is tested without a browser.
 */
export function submitPrompt(
  value: string,
  validate?: PromptOptions['validate'],
): { ok: true; value: string } | { ok: false; error: string } {
  const error = validate?.(value) ?? null;
  return error ? { ok: false, error } : { ok: true, value };
}
