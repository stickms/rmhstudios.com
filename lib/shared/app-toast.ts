/**
 * app-toast — the toast store shared by the full-screen apps.
 *
 * RMHbox, RMHType, RMHStudy and RMHTube each shipped a byte-for-byte copy of
 * this store and its container. They are one implementation now; the per-app
 * `toast-store.ts` modules re-export it so existing imports keep working.
 *
 * Why not sonner (the site-wide toaster)? These apps render outside the
 * `_site` shell, so the global `<Toaster>` is not mounted on their routes and
 * their palettes are `--app-*`, not `--site-*`. This store is the app-tier
 * equivalent: same idea, app tokens, no provider to mount beyond the shell.
 */

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  exiting?: boolean;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

/** Matches the exit animation in `app-theme.css` (`--app-duration-fast`). */
const EXIT_MS = 200;
/** Most toasts read in well under this; errors get longer (see `toast.error`). */
const DEFAULT_MS = 4000;
const ERROR_MS = 6000;
/** Beyond this the stack covers the app it is reporting on. */
const MAX_VISIBLE = 5;

let toastCounter = 0;

/**
 * Pending timers, keyed by toast id. Without this a toast dismissed by hand
 * still had two timers in flight that woke up later to mutate a list it had
 * already left — and a route change left them running against an unmounted
 * tree.
 */
const timers = new Map<string, ReturnType<typeof setTimeout>[]>();

function clearTimers(id: string) {
  timers.get(id)?.forEach(clearTimeout);
  timers.delete(id);
}

function track(id: string, handle: ReturnType<typeof setTimeout>) {
  const existing = timers.get(id);
  if (existing) existing.push(handle);
  else timers.set(id, [handle]);
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  addToast: (type, message, duration = DEFAULT_MS) => {
    const id = `toast-${++toastCounter}`;
    set((state) => ({
      toasts: [...state.toasts.slice(-(MAX_VISIBLE - 1)), { id, type, message, duration }],
    }));

    track(
      id,
      setTimeout(() => get().dismissToast(id), duration),
    );
  },

  dismissToast: (id) => {
    // Ignore a second dismiss (auto-timer racing a click) so the exit
    // animation isn't restarted halfway through.
    const current = get().toasts.find((t) => t.id === id);
    if (!current || current.exiting) return;

    set((state) => ({
      toasts: state.toasts.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    }));

    track(
      id,
      setTimeout(() => {
        clearTimers(id);
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, EXIT_MS),
    );
  },

  clearToasts: () => {
    for (const id of timers.keys()) clearTimers(id);
    set({ toasts: [] });
  },
}));

// ─── Convenience helpers ──────────────────────────────────────────────────

export const toast = {
  success: (msg: string, dur?: number) => useToastStore.getState().addToast('success', msg, dur),
  error: (msg: string, dur?: number) =>
    useToastStore.getState().addToast('error', msg, dur ?? ERROR_MS),
  warning: (msg: string, dur?: number) => useToastStore.getState().addToast('warning', msg, dur),
  info: (msg: string, dur?: number) => useToastStore.getState().addToast('info', msg, dur),
  dismiss: (id: string) => useToastStore.getState().dismissToast(id),
  clear: () => useToastStore.getState().clearToasts(),
};
