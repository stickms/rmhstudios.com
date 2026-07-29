/**
 * AppToaster — the toast surface for full-screen apps.
 *
 * One implementation for RMHbox, RMHType, RMHStudy and RMHTube (each shipped
 * an identical copy). Reads `lib/shared/app-toast` and paints with `--app-*`
 * tokens, so it inherits whichever palette the surrounding `.app-theme`
 * element declares.
 *
 * Mounted for you by `AppShell` — apps should not render it directly.
 */
'use client';

import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToastStore, type ToastType } from '@/lib/shared/app-toast';

const ICON: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />,
  error: <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />,
  info: <Info className="h-4 w-4 shrink-0" aria-hidden />,
};

const TONE: Record<ToastType, string> = {
  success: 'border-s-(--app-success) text-(--app-success)',
  error: 'border-s-(--app-danger) text-(--app-danger)',
  warning: 'border-s-(--app-warning) text-(--app-warning)',
  info: 'border-s-(--app-info) text-(--app-info)',
};

/**
 * Errors and warnings interrupt (`alert`); success and info wait for a gap in
 * whatever the screen reader is already saying (`status`). Announcing a
 * "copied!" over someone mid-sentence is worse than announcing it late.
 */
const LIVE: Record<ToastType, 'assertive' | 'polite'> = {
  success: 'polite',
  error: 'assertive',
  warning: 'assertive',
  info: 'polite',
};

export default function AppToaster() {
  const { t } = useTranslation('shared');
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  return (
    // The region is always mounted — an aria-live container inserted at the
    // same moment as its first message is not reliably announced.
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-100 flex flex-col items-center gap-2 px-3 pt-[calc(var(--app-safe-top)+1rem)]"
      role="region"
      aria-label={t('notifications', { defaultValue: 'Notifications' })}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={LIVE[toast.type] === 'assertive' ? 'alert' : 'status'}
          aria-live={LIVE[toast.type]}
          className={`pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-(--app-radius-sm) border-s-4 px-4 py-3 shadow-(--app-shadow) ${
            toast.exiting ? 'app-toast-exit' : 'app-toast-enter'
          } ${TONE[toast.type]}`}
          style={{ backgroundColor: 'var(--app-toast-bg)' }}
        >
          {ICON[toast.type]}
          {/* Server messages can carry a long unbroken token (a room code, a
              URL); without this one of them widens the toast off-screen. */}
          <span className="min-w-0 flex-1 text-sm font-medium break-words text-(--app-text)">
            {toast.message}
          </span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            className="-me-1 shrink-0 rounded-full p-1.5 text-(--app-text-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            aria-label={t('dismiss', { defaultValue: 'Dismiss' })}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
