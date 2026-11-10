/**
 * Host migration (PLAN §0.3, NET-05, R-10).
 *
 * The hub alone promotes (one successor token): after `MIGRATE_GRACE_MS` it
 * sends `promote` to the host-named successor and `host-changed` to everyone
 * else, then re-sends every connected member's join request to the new host.
 * The new host:
 *
 *  1. restores the referee from the newest checkpoint it holds for this run
 *     (every peer keeps the host's `checkpoint` broadcasts), or rebuilds one
 *     from its own caches when it has none (REF-19);
 *  2. numbers its outcomes above every `hs` it has seen, so members (and
 *     Lua's own dedupe) never drop a new host's outcome as a duplicate;
 *  3. re-admits the members as they reconnect (each gets `rejoined` → the
 *     referee resyncs lives, pairing, targets and roster to it), forfeits
 *     anyone still absent after the seat grace, and broadcasts a fresh
 *     checkpoint.
 *
 * A host that learns another peer was promoted (`host-changed` while it still
 * hosts: a network split it survived) demotes itself and rejoins.
 */

import { checkpointUsable, refRebuild } from './referee/checkpoint';
import type { Id, RefCheckpoint, StartedMatch } from './types';

/** Gap left between the old host's `hs` and the new host's first one. */
export const HS_MIGRATION_GAP = 10_000;

export function successorHs(lastSeenHs: number): number {
  return Math.max(0, Math.floor(lastSeenHs)) + HS_MIGRATION_GAP;
}

export interface TakeoverCache {
  lives: Record<Id, number>;
  teamLives?: { A?: number; B?: number };
  pairing?: { pairing: Record<Id, Id | ''>; ante: number } | null;
  forfeited?: Id[];
}

/** The checkpoint a new host restores from: the newest it holds, else a rebuild. */
export function takeoverCheckpoint(
  match: StartedMatch,
  held: RefCheckpoint | null,
  cache: TakeoverCache,
  at: number,
  rngSeed: number,
): { checkpoint: RefCheckpoint; rebuilt: boolean } {
  if (checkpointUsable(held, match)) return { checkpoint: held, rebuilt: false };
  const checkpoint = refRebuild(match, {
    at,
    rngSeed,
    lives: cache.lives,
    teamLives: cache.teamLives,
    forfeited: cache.forfeited,
    ...(cache.pairing ? { pairing: cache.pairing } : {}),
  });
  return { checkpoint, rebuilt: true };
}
