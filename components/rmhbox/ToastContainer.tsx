/**
 * ToastContainer — Renders toast notifications for RMHbox.
 *
 * Fixed position at top-center, renders from the toast store.
 * Uses CSS animations defined in rmhbox.css.
 */
'use client';

import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useToastStore, type ToastType } from '@/lib/rmhbox/toast-store';

const ICON_MAP: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 shrink-0" />,
  error: <AlertCircle className="h-4 w-4 shrink-0" />,
  warning: <AlertTriangle className="h-4 w-4 shrink-0" />,
  info: <Info className="h-4 w-4 shrink-0" />,
};

const COLOR_MAP: Record<ToastType, string> = {
  success: 'border-l-(--rmhbox-success) text-(--rmhbox-success)',
  error: 'border-l-(--rmhbox-danger) text-(--rmhbox-danger)',
  warning: 'border-l-(--rmhbox-warning) text-(--rmhbox-warning)',
  info: 'border-l-(--rmhbox-info) text-(--rmhbox-info)',
};

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-4 z-100 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 rounded-lg border-l-4 px-4 py-3 shadow-lg backdrop-blur-sm ${
            t.exiting ? 'rmhbox-toast-exit' : 'rmhbox-toast-enter'
          } ${COLOR_MAP[t.type]}`}
          style={{
            backgroundColor: 'var(--rmhbox-toast-bg)',
            maxWidth: '420px',
            width: '90vw',
          }}
        >
          {ICON_MAP[t.type]}
          <span className="flex-1 text-sm font-medium text-(--rmhbox-text)">
            {t.message}
          </span>
          <button
            onClick={() => dismissToast(t.id)}
            className="shrink-0 rounded p-0.5 text-(--rmhbox-text-muted) transition-colors hover:text-(--rmhbox-text)"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
