/**
 * The flash ledger (docs/plans/plasmatic-jelly/03-arcs.md §5.1, master plan R13, WCAG 2.3.1): a sliding window of
 * flash-onset timestamps shared by every arc — ambient, click, fizz, API — and any rim pulse bright enough to count.
 *
 * `tryOnset(now)` admits an onset only while fewer than `maxOnsets` were admitted in the preceding `windowMs`, so no
 * window of that length, anywhere on the timeline, ever holds more than `maxOnsets` onsets: a 20-clicks-per-second
 * storm still produces at most 3 flashes per second. Callers degrade in order — skip re-strikes, then extra bolts,
 * then the bolt itself — and keep the non-flash feedback (the press, the contact flare).
 *
 * Pure: the caller passes the time. One ledger instance must be shared site-wide (the arc runtime owns it).
 */

import { FLASH_LEDGER } from '../tiers';

export interface FlashLedgerOptions {
  maxOnsets?: number;
  windowMs?: number;
}

export interface FlashLedger {
  readonly maxOnsets: number;
  readonly windowMs: number;
  /** Would an onset at `now` be admitted? (Does not record it.) */
  canOnset(now: number): boolean;
  /** Admit and record an onset at `now`, or refuse it. */
  tryOnset(now: number): boolean;
  /** Onsets recorded within the window ending at `now`. */
  count(now: number): number;
  /** Earliest time an onset would be admitted (≤ `now` when one would be admitted now). */
  nextFreeAt(now: number): number;
  /** Forget every onset (teardown, hidden tab). */
  reset(): void;
}

export function createFlashLedger(opts: FlashLedgerOptions = {}): FlashLedger {
  const maxOnsets = Math.max(0, Math.floor(opts.maxOnsets ?? FLASH_LEDGER.maxOnsets));
  const windowMs = Math.max(0, opts.windowMs ?? FLASH_LEDGER.windowMs);
  let onsets: number[] = [];
  // A clock that runs backwards (a test, a resumed tab) must not reopen the window.
  let latest = -Infinity;

  const clock = (now: number) => {
    latest = Math.max(latest, now);
    return latest;
  };
  const prune = (t: number) => {
    let i = 0;
    while (i < onsets.length && t - onsets[i] >= windowMs) i++;
    if (i > 0) onsets = onsets.slice(i);
  };

  return {
    maxOnsets,
    windowMs,
    canOnset(now) {
      const t = Math.max(latest, now);
      prune(t);
      return onsets.length < maxOnsets;
    },
    tryOnset(now) {
      const t = clock(now);
      prune(t);
      if (onsets.length >= maxOnsets) return false;
      onsets.push(t);
      return true;
    },
    count(now) {
      const t = Math.max(latest, now);
      prune(t);
      return onsets.length;
    },
    nextFreeAt(now) {
      const t = Math.max(latest, now);
      prune(t);
      if (onsets.length < maxOnsets) return t;
      if (maxOnsets === 0) return Infinity;
      return onsets[onsets.length - maxOnsets] + windowMs;
    },
    reset() {
      onsets = [];
    },
  };
}
