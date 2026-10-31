/**
 * Balatro multiplayer — late results (HUD-24): the result of a finished match
 * for a player who left it before the end.
 *
 * The referee runs in the host's browser, so a player who left (Leave, a
 * forfeit, a closed tab) never hears how the match ended over P2P. When the
 * referee finishes, the room's current host sends `balatro:match:result`; the
 * hub works out each departed roster player's own line (`resultFor`) and
 * either pushes it to that account's Balatro pages (sockets that asked with
 * `balatro:match:pending`) or keeps it here until one asks.
 *
 * Bounded memory: a notice lives `TTL_MS`, an account keeps at most
 * `PER_USER` (oldest dropped), and at most `MAX_USERS` accounts hold any
 * (the least recently queued account is dropped). Single process, in memory
 * (server/CLAUDE.md gotcha 1). Relative imports only (gotcha 7).
 */

import type { BalatroC2SPayload, BalatroS2CPayload } from '../../../lib/balatro/net/events';

export type LateResult = BalatroS2CPayload<'balatro:match:result'>;
export type MatchResult = BalatroC2SPayload<'balatro:match:result'>;

export const LATE_RESULT_LIMITS = {
  /** How long a queued notice waits for its player to come back. */
  TTL_MS: 10 * 60_000,
  PER_USER: 4,
  MAX_USERS: 5_000,
  /** Balatro pages one account can have listening at once. */
  SOCKETS_PER_USER: 8,
} as const;

/** One receiver's line of a finished match. */
export function resultFor(m: MatchResult, userId: string): LateResult {
  if (m.draw) return { runId: m.runId, r: 'draw' };
  if (m.winners.includes(userId)) return { runId: m.runId, r: 'won' };
  const place = Object.prototype.hasOwnProperty.call(m.places, userId) ? m.places[userId] : undefined;
  return place !== undefined && place > 1 ? { runId: m.runId, r: 'lost', place } : { runId: m.runId, r: 'lost' };
}

const queued = new Map<string, { n: LateResult; at: number }[]>();
const listening = new Map<string, Set<string>>();

/** This socket shows `userId`'s results from now on (until it disconnects). */
export function listen(userId: string, socketId: string): void {
  let set = listening.get(userId);
  if (!set) listening.set(userId, (set = new Set()));
  set.delete(socketId);
  set.add(socketId);
  while (set.size > LATE_RESULT_LIMITS.SOCKETS_PER_USER) set.delete(set.values().next().value as string);
}

export function unlisten(userId: string, socketId: string): void {
  const set = listening.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) listening.delete(userId);
}

/** The sockets showing this account's results. */
export function listenersOf(userId: string): string[] {
  return [...(listening.get(userId) ?? [])];
}

/** Keep `n` for `userId` until a page of theirs asks (or it expires). */
export function enqueue(userId: string, n: LateResult, now: number): void {
  const list = (queued.get(userId) ?? []).filter((q) => now - q.at < LATE_RESULT_LIMITS.TTL_MS && q.n.runId !== n.runId);
  list.push({ n, at: now });
  while (list.length > LATE_RESULT_LIMITS.PER_USER) list.shift();
  queued.delete(userId);
  queued.set(userId, list);
  while (queued.size > LATE_RESULT_LIMITS.MAX_USERS) queued.delete(queued.keys().next().value as string);
}

/** The unexpired notices waiting for `userId`, oldest first; they are handed over once. */
export function take(userId: string, now: number): LateResult[] {
  const list = queued.get(userId);
  if (!list) return [];
  queued.delete(userId);
  return list.filter((q) => now - q.at < LATE_RESULT_LIMITS.TTL_MS).map((q) => q.n);
}

/** Accounts with queued notices (tests, metrics). */
export function queuedCount(): number {
  return queued.size;
}

/** Test seam. */
export function resetLateResultsForTests(): void {
  queued.clear();
  listening.clear();
}
