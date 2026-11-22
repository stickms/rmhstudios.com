import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/lib/toast';

export interface CopyFallbackOptions {
  /** Heading, the sentence the native prompt showed ("Copy this link:"). */
  title: string;
  /** The text to copy. */
  text: string;
  /** Copy button text. Defaults to "Copy". */
  copyLabel?: string;
  /** Close button text. Defaults to "Close". */
  closeLabel?: string;
}

type ShowCopyFn = (options: CopyFallbackOptions) => void;

const CopyFallbackContext = React.createContext<ShowCopyFn | null>(null);

type CopyFallbackView = typeof import('./copy-fallback-view').CopyFallbackView;

let viewLoad: Promise<CopyFallbackView> | undefined;

/** The dialog itself, fetched once. A failed fetch is forgotten so the next call tries again. */
function loadCopyFallbackView(): Promise<CopyFallbackView> {
  viewLoad ??= import('./copy-fallback-view').then(
    (m) => m.CopyFallbackView,
    (error: unknown) => {
      viewLoad = undefined;
      throw error;
    },
  );
  return viewLoad;
}

/**
 * The "copy this by hand" dialog for when the clipboard API is refused: the text in a read-only
 * field, selected on open, with a Copy button. Replaces `window.prompt(label, text)`, which the
 * Discord activity's sandboxed frame suppresses.
 *
 * Mount `<CopyFallbackProvider>` once near the app root, then:
 *
 * ```tsx
 * const showCopy = useCopyFallback();
 * navigator.clipboard.writeText(url).catch(() => showCopy({ title, text: url }));
 * ```
 *
 * The dialog is fetched on first use, as the confirm dialog is.
 */
export function CopyFallbackProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('c-ui');
  const [pending, setPending] = React.useState<CopyFallbackOptions | null>(null);
  const [View, setView] = React.useState<CopyFallbackView | null>(null);

  const showCopy = React.useCallback<ShowCopyFn>(
    (options) => {
      setPending(options);
      loadCopyFallbackView().then(
        (view) => setView(() => view),
        () => {
          setPending((current) => (current === options ? null : current));
          toast.error(
            t('prompt-unavailable', {
              defaultValue: "Couldn't open the dialog. Check your connection and try again.",
            }),
          );
        },
      );
    },
    [t],
  );

  const close = React.useCallback(() => setPending(null), []);

  return (
    <CopyFallbackContext value={showCopy}>
      {children}
      {View && <View pending={pending} close={close} />}
    </CopyFallbackContext>
  );
}

/** Returns `showCopy(options)`. Requires `<CopyFallbackProvider>` above the caller. */
export function useCopyFallback(): ShowCopyFn {
  const ctx = React.useContext(CopyFallbackContext);
  if (!ctx) throw new Error('useCopyFallback must be used within a <CopyFallbackProvider>');
  return ctx;
}
