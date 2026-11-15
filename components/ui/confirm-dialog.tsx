import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/lib/toast';

export interface ConfirmOptions {
  /** Heading — a short question ("Remove this passkey?"). */
  title: React.ReactNode;
  /** Supporting sentence describing the consequence. */
  description?: React.ReactNode;
  /** Confirm button text. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Cancel button text. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Style the confirm button as destructive and show a warning icon. */
  danger?: boolean;
  /** Override the leading icon (defaults to a warning triangle when danger). */
  icon?: LucideIcon;
}

type ConfirmFn =
  (
    options: ConfirmOptions,
  ) => Promise<boolean>;

const ConfirmContext =
  React.createContext<ConfirmFn | null>(
    null,
  );

interface PendingState extends ConfirmOptions {
  resolve: (
    value: boolean,
  ) => void;
}

type ConfirmDialogView =
  typeof import('./confirm-dialog-view').ConfirmDialogView;

let viewLoad:
  | Promise<ConfirmDialogView>
  | undefined;

/** The dialog itself, fetched once. A failed fetch is forgotten so the next confirmation tries again. */
function loadConfirmDialogView(): Promise<ConfirmDialogView> {
  viewLoad ??=
    import('./confirm-dialog-view').then(
      (
        m,
      ) =>
        m.ConfirmDialogView,
      (
        error: unknown,
      ) => {
        viewLoad =
          undefined;
        throw error;
      },
    );
  return viewLoad;
}

/**
 * Themed, accessible replacement for the native `window.confirm`.
 *
 * Mount `<ConfirmProvider>` once near the app root, then call `useConfirm()`
 * from anywhere:
 *
 * ```tsx
 * const confirm = useConfirm();
 * if (await confirm({ title: 'Delete draft?', danger: true })) deleteDraft();
 * ```
 *
 * Built on the shared `Dialog` primitive, so it inherits focus-trapping,
 * Escape-to-dismiss, the `--site-*` token styling (works across every theme),
 * and i18n — none of which the native `confirm()` dialog provides.
 *
 * The provider is in the shell; the dialog is not. `confirm-dialog-view.tsx`
 * (and the Radix dialog stack under it) is imported by the first `confirm()`,
 * which is always behind a click. If that import fails the confirmation
 * resolves `false` (nothing destructive runs unconfirmed) and says so.
 */
export function ConfirmProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-ui',
    );
  const [
    pending,
    setPending,
  ] =
    React.useState<PendingState | null>(
      null,
    );
  const [
    View,
    setView,
  ] =
    React.useState<ConfirmDialogView | null>(
      null,
    );

  const confirm =
    React.useCallback<ConfirmFn>(
      (
        options,
      ) => {
        return new Promise<boolean>(
          (
            resolve,
          ) => {
            setPending(
              {
                ...options,
                resolve,
              },
            );
            loadConfirmDialogView().then(
              (
                view,
              ) =>
                setView(
                  () =>
                    view,
                ),
              () => {
                setPending(
                  (
                    current,
                  ) =>
                    current?.resolve ===
                    resolve
                      ? null
                      : current,
                );
                resolve(
                  false,
                );
                toast.error(
                  t(
                    'confirm-unavailable',
                    {
                      defaultValue:
                        "Couldn't open the confirmation. Check your connection and try again.",
                    },
                  ),
                );
              },
            );
          },
        );
      },
      [
        t,
      ],
    );

  const settle =
    React.useCallback(
      (
        value: boolean,
      ) => {
        setPending(
          (
            current,
          ) => {
            current?.resolve(
              value,
            );
            return null;
          },
        );
      },
      [],
    );

  return (
    <ConfirmContext.Provider
      value={
        confirm
      }
    >
      {
        children
      }
      {View && (
        <View
          pending={
            pending
          }
          settle={
            settle
          }
        />
      )}
    </ConfirmContext.Provider>
  );
}

/**
 * Returns an async `confirm(options) => Promise<boolean>`. Resolves `true` when
 * the user confirms, `false` on cancel/dismiss. Requires `<ConfirmProvider>`
 * to be mounted above the caller (it is, at the app root).
 */
export function useConfirm(): ConfirmFn {
  const ctx =
    React.useContext(
      ConfirmContext,
    );
  if (
    !ctx
  ) {
    throw new Error(
      'useConfirm must be used within a <ConfirmProvider>',
    );
  }
  return ctx;
}
