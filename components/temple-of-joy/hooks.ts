/**
 * How the temple reads its own state.
 *
 * The game ticks on every animation frame, so the naive
 * `useTempleStore(s => s.joy)` would re-render the tree sixty times a second —
 * and the blessing list is three hundred rows. Three access patterns instead,
 * chosen by what the value actually is:
 *
 * - `useTempleValue` — discrete state that changes on a user action (the open
 *   tab, the theme, a dialog flag). Straight zustand subscription; instant.
 * - `useTempleSnapshot` — continuous state that only needs to *look* live
 *   (prices, affordability, cooldowns, growth). Sampled on a shared interval.
 * - `<LiveValue>` (in `ui.tsx`) — the headline figures, written straight into a
 *   DOM node every frame with no React render at all.
 */
'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';

type Store = ReturnType<typeof useTempleStore.getState>;

/**
 * Discrete state. Re-renders only when the selected value actually changes.
 *
 * Written against `useSyncExternalStore` rather than calling the zustand hook,
 * for one reason: zustand v5 serves `getInitialState()` as the *server*
 * snapshot, so anything selected through it reads the state as of store
 * creation during a server render — which is invisible in the browser and
 * quietly wrong everywhere else, including in a render test. The temple is
 * lazy-loaded behind an auth gate and never server-renders in anger, so there
 * is no hydration mismatch to protect against and reading the live state is
 * simply more correct.
 *
 * `select` must return a primitive or a stable reference. A selector that
 * builds a fresh object on every call will loop — the same constraint zustand
 * itself imposes, and the reason `useTempleSnapshot` exists for derived state.
 */
export function useTempleValue<T>(select: (s: Store) => T): T {
  const latest = useRef(select);
  latest.current = select;
  const read = () => latest.current(useTempleStore.getState());
  return useSyncExternalStore(useTempleStore.subscribe, read, read);
}

/**
 * A shared heartbeat. One interval per cadence for the whole tree rather than
 * one per component, so twenty rows sampling at 250ms cost one timer.
 */
const beats = new Map<number, { listeners: Set<() => void>; timer: number }>();

function subscribeBeat(ms: number, onChange: () => void): () => void {
  let beat = beats.get(ms);
  if (!beat) {
    beat = { listeners: new Set(), timer: 0 };
    beats.set(ms, beat);
    beat.timer = window.setInterval(() => {
      for (const listener of [...beat!.listeners]) listener();
    }, ms);
  }
  beat.listeners.add(onChange);

  return () => {
    const current = beats.get(ms);
    if (!current) return;
    current.listeners.delete(onChange);
    if (current.listeners.size === 0) {
      window.clearInterval(current.timer);
      beats.delete(ms);
    }
  };
}

/**
 * Sample derived game state on a fixed cadence.
 *
 * `read` runs against the live store on every beat; the component re-renders
 * only when the result differs from last time (shallow-compared), so a row
 * whose price and affordability are unchanged costs nothing but the read.
 */
export function useTempleSnapshot<T>(read: (s: Store) => T, ms = 250): T {
  const [value, setValue] = useState(() => read(useTempleStore.getState()));
  const latest = useRef(read);
  latest.current = read;
  const previous = useRef(value);
  previous.current = value;

  useEffect(() => {
    const sample = () => {
      const next = latest.current(useTempleStore.getState());
      if (!shallowEqual(previous.current, next)) {
        previous.current = next;
        setValue(next);
      }
    };
    sample();
    return subscribeBeat(ms, sample);
  }, [ms]);

  return value;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) =>
    Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/**
 * Flag a row for one animation after a purchase.
 *
 * A list where every row looks identical before and after a click reads as
 * broken, and the price change alone is too subtle to notice while scrolling.
 * Returns the id currently flashing, plus the setter to call on purchase.
 */
export function useFlash(ms = 420): [string | null, (id: string) => void] {
  const [id, setId] = useState<string | null>(null);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flash = (next: string) => {
    window.clearTimeout(timer.current);
    setId(next);
    timer.current = window.setTimeout(() => setId(null), ms);
  };

  return [id, flash];
}
