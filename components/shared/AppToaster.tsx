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
  success: 'text-(--app-success)',
  error: 'text-(--app-danger)',
  warning: 'text-(--app-warning)',
  info: 'text-(--app-info)',
};

/**
 * The tone stripe. Inline because the toast is an `.app-glass` host (Plasmatic Jelly coverage, 04 §1 "App toasts"),
 * whose unlayered `border` shorthand would otherwise beat a `border-s-*` utility and erase the stripe.
 */
const STRIPE: Record<ToastType, string> = {
  success: 'var(--app-success)',
  error: 'var(--app-danger)',
  warning: 'var(--app-warning)',
  info: 'var(--app-info)',
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
      data-jelly-arcs="off"
      aria-label={t('notifications', { defaultValue: 'Notifications' })}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={LIVE[toast.type] === 'assertive' ? 'alert' : 'status'}
          aria-live={LIVE[toast.type]}
          // `.app-glass`: the toast is jelly like every other app surface (04 §1 "App toasts", tier S) — the engine
          // draws its rim and haze, the static floor stands in without WebGL, and `relative` gives those layers their
          // box. It keeps its opaque fill: it lands over a running game, where a translucent message would ghost.
          className={`app-glass pointer-events-auto relative flex w-full max-w-[420px] items-center gap-3 rounded-(--app-radius-sm) px-4 py-3 ${
            toast.exiting ? 'app-toast-exit' : 'app-toast-enter'
          } ${TONE[toast.type]}`}
          style={{
            backgroundColor: 'var(--app-toast-bg)',
            borderInlineStartWidth: 4,
            borderInlineStartColor: STRIPE[toast.type],
          }}
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
            className="-me-2 grid size-9 shrink-0 place-items-center rounded-full text-(--app-text-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
            aria-label={t('dismiss', { defaultValue: 'Dismiss' })}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
