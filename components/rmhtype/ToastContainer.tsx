/**
 * ToastContainer — Renders toast notifications for RmhType.
 */
'use client';

import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from "react-i18next";
import { useToastStore, type ToastType } from '@/lib/rmhtype/toast-store';

const ICON_MAP: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 shrink-0" />,
  error: <AlertCircle className="h-4 w-4 shrink-0" />,
  warning: <AlertTriangle className="h-4 w-4 shrink-0" />,
  info: <Info className="h-4 w-4 shrink-0" />,
};

const COLOR_MAP: Record<ToastType, string> = {
  success: 'border-l-(--rmhtype-success) text-(--rmhtype-success)',
  error: 'border-l-(--rmhtype-danger) text-(--rmhtype-danger)',
  warning: 'border-l-(--rmhtype-warning) text-(--rmhtype-warning)',
  info: 'border-l-(--rmhtype-info) text-(--rmhtype-info)',
};

export default function ToastContainer() {
  const { t: tr } = useTranslation("c-rmhtype");
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-4 z-100 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 rounded-lg border-l-4 px-4 py-3 shadow-lg backdrop-blur-sm ${
            t.exiting ? 'rmhtype-toast-exit' : 'rmhtype-toast-enter'
          } ${COLOR_MAP[t.type]}`}
          style={{
            backgroundColor: 'var(--rmhtype-toast-bg)',
            maxWidth: '420px',
            width: '90vw',
          }}
        >
          {ICON_MAP[t.type]}
          <span className="flex-1 text-sm font-medium text-(--rmhtype-text)">
            {t.message}
          </span>
          <button
            onClick={() => dismissToast(t.id)}
            className="shrink-0 rounded p-0.5 text-(--rmhtype-text-muted) transition-colors hover:text-(--rmhtype-text)"
            aria-label={tr("dismiss", { defaultValue: "Dismiss" })}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
