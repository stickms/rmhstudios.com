/**
 * ToastContainer — Renders toast notifications for Altair.
 */
'use client';

import { useAltairToastStore, Toast } from '@/lib/altair/stores/toast-store';

const typeColors: Record<Toast['type'], string> = {
  info: 'var(--altair-info)',
  success: 'var(--altair-success)',
  warning: 'var(--altair-warning)',
  error: 'var(--altair-danger)',
};

export default function ToastContainer() {
  const toasts = useAltairToastStore((s) => s.toasts);
  const removeToast = useAltairToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg cursor-pointer ${
            toast.exiting ? 'altair-toast-exit' : 'altair-toast-enter'
          }`}
          style={{
            backgroundColor: 'var(--altair-toast-bg)',
            border: `1px solid ${typeColors[toast.type]}`,
            color: 'var(--altair-text)',
          }}
          onClick={() => removeToast(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
