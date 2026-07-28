'use client';

import { useSyncExternalStore } from 'react';

/**
 * Hydration-safe relative timestamps ("3h", "15 minutes ago").
 *
 * `Date.now()` advances between the SSR render and hydration, so any relative
 * string computed at render time can differ across the two — "14 minutes ago"
 * server-side, "15 minutes ago" on the client. React 19 treats a text mismatch
 * as a failed hydration: it throws away the server tree and re-renders the
 * whole thing on the client (visible as a flash, plus wasted work). Feed cards
 * and the notifications list did exactly this on every page load.
 *
 * The fix is to make the *first* render deterministic — a function of the
 * timestamp alone — and only switch to live relative time after mount:
 *
 *   - `getServerSnapshot` returns `null`, and it is what React uses both for
 *     SSR and for the hydrating client render, so the two agree by
 *     construction.
 *   - after hydration React reads `getSnapshot`, gets a real clock, and
 *     re-renders through the normal state path (not the hydration path).
 *
 * One shared ticker drives every mounted instance, so a feed of fifty cards
 * costs one interval, not fifty.
 */

/** Coarse enough that a minute-granularity label is never visibly stale. */
const TICK_MS = 30_000;

let clockNow = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (timer === null) {
    timer = setInterval(() => {
      clockNow = Date.now();
      for (const l of listeners) l();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getClientSnapshot = () => clockNow;
const getServerSnapshot = () => null;

/**
 * The current time in ms, or `null` on the server and during hydration.
 *
 * Render something derived only from your own data while it is `null` — never
 * a relative string, which is the whole point.
 */
export function useLiveNow(): number | null {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

export interface RelativeTimeProps {
  /** ISO string or epoch ms. */
  date: string | number | Date;
  /**
   * Formats the elapsed time once the clock is available. Receives the
   * timestamp and the current time, both in ms.
   */
  format: (timestampMs: number, nowMs: number) => string;
  /**
   * Rendered before hydration completes — must depend only on `date`. Defaults
   * to a short absolute date, which is meaningful on its own (so this also
   * reads correctly with JS off, in print, and in reader mode).
   */
  fallback?: (timestampMs: number) => string;
  className?: string;
}

function defaultFallback(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function RelativeTime({ date, format, fallback, className }: RelativeTimeProps) {
  const ms = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const now = useLiveNow();

  if (Number.isNaN(ms)) return null;

  const text = now === null ? (fallback ?? defaultFallback)(ms) : format(ms, now);

  return (
    <time dateTime={new Date(ms).toISOString()} className={className}>
      {text}
    </time>
  );
}
