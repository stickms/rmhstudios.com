import { useSyncExternalStore } from 'react';

const KEY = 'rmh-hide-bots';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setHideBots(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable — the preference just doesn't persist */
  }
  listeners.forEach((l) => l());
}

/** D4: per-device "hide automated accounts" feed preference. */
export function useHideBots(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => false,
  );
}
