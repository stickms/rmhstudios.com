/**
 * RMH Study — Toast Notification Store
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
}

let toastCounter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (type, message, duration = 4000) => {
    const id = `toast-${++toastCounter}`;
    const newToast: Toast = { id, type, message, duration };

    set((state) => ({
      toasts: [...state.toasts.slice(-4), newToast],
    }));

    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.map((t) =>
          t.id === id ? { ...t, exiting: true } : t,
        ),
      }));
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, 200);
    }, duration);
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.map((t) =>
        t.id === id ? { ...t, exiting: true } : t,
      ),
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 200);
  },
}));

export const toast = {
  success: (msg: string, dur?: number) => useToastStore.getState().addToast('success', msg, dur),
  error: (msg: string, dur?: number) => useToastStore.getState().addToast('error', msg, dur ?? 6000),
  warning: (msg: string, dur?: number) => useToastStore.getState().addToast('warning', msg, dur),
  info: (msg: string, dur?: number) => useToastStore.getState().addToast('info', msg, dur),
};
