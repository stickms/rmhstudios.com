/**
 * How the temple reads its own state.
 *
 * The game ticks on every animation frame, so the naive `useTempleStore(s =>
 * s.happiness)` would re-render the tree 60 times a second — and the codex is
 * hundreds of rows. Three access patterns instead, picked by what the value
 * actually is:
 *
 * - `useTempleValue` — discrete state that changes on a user action (the open
 *   tab, the theme, a modal flag). Straight zustand subscription; instant.
 * - `useTempleSnapshot` — continuous state that only needs to *look* live
 *   (affordability, cooldowns, counts). Sampled on an interval, shared by all
 *   consumers at the same cadence.
 * - `<LiveValue>` (in `ui.tsx`) — the headline figures, written straight into a
 *   DOM node every frame with no React render at all.
 */

'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import type { GameState } from '@/lib/temple-of-joy/types';

type Store = ReturnType<typeof useTempleStore.getState>;

/** Discrete state. Re-renders only when the selected value actually changes. */
export function useTempleValue<T>(select: (s: Store) => T): T {
  return useTempleStore(select);
}

/**
 * A shared heartbeat. One interval per cadence for the whole tree rather than
 * one per component, so twenty rows sampling at 250ms cost one timer.
 */
const beats = new Map<number, { listeners: Set<() => void>; timer: number; version: number }>();

function subscribeBeat(ms: number, onChange: () => void): () => void {
  let beat = beats.get(ms);
  if (!beat) {
    beat = { listeners: new Set(), timer: 0, version: 0 };
    beats.set(ms, beat);
    beat.timer = window.setInterval(() => {
      beat!.version++;
      for (const listener of beat!.listeners) listener();
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
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) =>
    Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/**
 * Subscribe to a value written outside React's render cycle without tearing —
 * used for the animation-frame-driven readouts.
 */
export function useGameState(): GameState {
  return useSyncExternalStore(
    useTempleStore.subscribe,
    useTempleStore.getState,
    useTempleStore.getState,
  );
}

/**
 * True while the player is mid-ritual (a burst of fast clicks). Drives the
 * sanctum's brighter halo; sampled rather than subscribed because it is
 * derived from a rolling window of click timestamps.
 */
export function useRitualActive(): boolean {
  return useTempleSnapshot((s) => s.ritualCooldown > 0, 300);
}
