/**
 * The overlay the three sharing dialogs share: the Studio's own modal (painted with `--app-*` tokens, portalled into
 * the app root) with a title and a close button. The body is whatever the dialog puts in it.
 */
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
// The shared overlay owns the full-viewport layer (one audited place for iOS's edge contract).
import { DialogOverlay } from '@/components/ui/dialog';
import { appRoot } from '@/components/studio/app-root';

/** Button classes shared by the sharing dialogs (app tier: `--app-*` tokens, 36 px high, 44 px on touch). */
export const SHARE_BUTTON =
  'min-h-9 rounded-app-sm border border-app-border px-3 text-sm font-medium hover:bg-app-surface-hover pointer-coarse:min-h-11';
export const SHARE_PRIMARY_BUTTON =
  'min-h-9 rounded-app-sm bg-app-accent px-3 text-sm font-medium text-app-accent-fg hover:bg-app-accent-hover disabled:opacity-60 pointer-coarse:min-h-11';

export function ShareDialogFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('studio-share');
  return (
    <DialogPrimitive.Root open onOpenChange={(next) => !next && onClose()}>
      {/* Into the app root, where the --app-* tokens are defined (a body-level portal would lose them). */}
      <DialogPrimitive.Portal container={appRoot()}>
        <DialogOverlay className="app-overlay" style={{ background: 'var(--app-scrim)' }} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="app-modal border border-app-border bg-app-surface text-app-text fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100dvw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden outline-none"
          style={{ borderRadius: 'var(--app-radius-lg)' }}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-4">
            <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={t('close', { defaultValue: 'Close' })}
              className="flex size-9 items-center justify-center rounded-app-sm text-app-text-muted hover:bg-app-surface-hover hover:text-app-text pointer-coarse:size-11"
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-app-border">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
