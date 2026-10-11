/**
 * RmhTube — what this client's sync is doing right now, for the status chip.
 *
 * Written by VideoPlayer's tick four times a second. A plain module object, not
 * store state: a store write would re-render every subscriber at tick rate,
 * and the only reader — `SyncStatus` — polls it on its own slower timer.
 */

import { SYNC_SOFT_TOLERANCE_S } from './constants';

export interface SyncStats {
  role: 'leader' | 'viewer' | null;
  /** This player minus the room, in seconds (+ = ahead). Null when there is no timeline. */
  driftS: number | null;
  /** The rate the element is actually running at (a nudge shows here). */
  rate: number;
  /** Correction seeks since the item started. */
  seeks: number;
  /** Measured cost of one seek on this player, in seconds. */
  seekLeadS: number;
  buffering: boolean;
  /** `Date.now()` of the last write; stale stats read as idle. */
  updatedAt: number;
}

export const syncStats: SyncStats = {
  role: null,
  driftS: null,
  rate: 1,
  seeks: 0,
  seekLeadS: 0,
  buffering: false,
  updatedAt: 0,
};

export type SyncHealth = 'idle' | 'leader' | 'buffering' | 'synced' | 'catching-up';

const STALE_MS = 2_000;

/** One word for the chip. */
export function syncHealth(stats: SyncStats, now: number): SyncHealth {
  if (!stats.role || now - stats.updatedAt > STALE_MS) return 'idle';
  if (stats.role === 'leader') return 'leader';
  if (stats.buffering) return 'buffering';
  if (stats.driftS === null || Math.abs(stats.driftS) <= SYNC_SOFT_TOLERANCE_S) return 'synced';
  return 'catching-up';
}

let resync: (() => void) | null = null;

/** VideoPlayer registers how to resync itself; returns the unregister. */
export function registerResync(fn: () => void): () => void {
  resync = fn;
  return () => {
    if (resync === fn) resync = null;
  };
}

/** Ask the mounted player to snap to the room now. */
export function requestResync(): void {
  resync?.();
}
