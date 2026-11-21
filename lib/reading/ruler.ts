/**
 * Reading ruler preference (Y2) — a per-device setting, off by default.
 * Stored in localStorage and shared through useSyncExternalStore so the toggle in
 * the reader, the article tools and the ruler itself stay in step. Every storage
 * access is guarded: private windows and blocked storage just read as "off".
 */

import { useSyncExternalStore } from 'react';

const KEY = 'rmh-reading-ruler';
const listeners = new Set<() => void>();
let cached: boolean | null = null;

function read(): boolean {
  if (cached !== null) return cached;
  try {
    cached = typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1';
  } catch {
    cached = false;
  }
  return cached;
}

export function setReadingRuler(on: boolean): void {
  cached = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable — the setting just lasts for this page view */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cached = null;
      cb();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function useReadingRuler(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  return [on, setReadingRuler];
}
