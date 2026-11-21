import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/lib/toast';
import type { PromptOptions } from '@/components/ui/prompt-rule';

export { submitPrompt, type PromptOptions } from '@/components/ui/prompt-rule';

type PromptFn = (options: PromptOptions) => Promise<string | null>;

const PromptContext = React.createContext<PromptFn | null>(null);

interface PendingState extends PromptOptions {
  resolve: (value: string | null) => void;
}

type PromptDialogView = typeof import('./prompt-dialog-view').PromptDialogView;

let viewLoad: Promise<PromptDialogView> | undefined;

/** The dialog itself, fetched once. A failed fetch is forgotten so the next prompt tries again. */
function loadPromptDialogView(): Promise<PromptDialogView> {
  viewLoad ??= import('./prompt-dialog-view').then(
    (m) => m.PromptDialogView,
    (error: unknown) => {
      viewLoad = undefined;
      throw error;
    },
  );
  return viewLoad;
}

/**
 * Themed, accessible replacement for the native `window.prompt`.
 *
 * Mount `<PromptProvider>` once near the app root, then call `usePrompt()` from anywhere:
 *
 * ```tsx
 * const prompt = usePrompt();
 * const name = await prompt({ title: renameTitle, initialValue: pl.name }); // title: a t() string
 * if (name === null) return; // cancelled, Escape or dismissed
 * ```
 *
 * Like `ConfirmProvider`, the provider is in the shell and the dialog is not: the Radix dialog
 * stack is imported by the first `prompt()`, which is always behind a click. If that import fails
 * the prompt resolves `null` (nothing runs unanswered) and says so. A second prompt asked while one
 * is open cancels the first.
 */
export function PromptProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('c-ui');
  const [pending, setPending] = React.useState<PendingState | null>(null);
  const [View, setView] = React.useState<PromptDialogView | null>(null);

  const prompt = React.useCallback<PromptFn>(
    (options) =>
      new Promise<string | null>((resolve) => {
        setPending((current) => {
          current?.resolve(null);
          return { ...options, resolve };
        });
        loadPromptDialogView().then(
          (view) => setView(() => view),
          () => {
            setPending((current) => (current?.resolve === resolve ? null : current));
            resolve(null);
            toast.error(
              t('prompt-unavailable', {
                defaultValue: "Couldn't open the dialog. Check your connection and try again.",
              }),
            );
          },
        );
      }),
    [t],
  );

  const settle = React.useCallback((value: string | null) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  return (
    <PromptContext value={prompt}>
      {children}
      {View && <View pending={pending} settle={settle} />}
    </PromptContext>
  );
}

/**
 * Returns an async `prompt(options) => Promise<string | null>`: the submitted text, or `null` when
 * the person cancels, presses Escape or dismisses it. Requires `<PromptProvider>` above the caller.
 */
export function usePrompt(): PromptFn {
  const ctx = React.useContext(PromptContext);
  if (!ctx) throw new Error('usePrompt must be used within a <PromptProvider>');
  return ctx;
}
