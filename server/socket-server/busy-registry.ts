/**
 * "Is this person already on a call?" — one answer, shared by both call features.
 *
 * ## Why this exists
 *
 * `handlers/call.ts` and `handlers/group-call.ts` each keep their own
 * `userId → callId` index, because each needs to find *its own* live call for a
 * user on a disconnect. What neither can answer alone is the question that
 * actually matters to a person: am I in a call *at all*. Without a shared
 * answer, a user standing in a community voice room still rings for a 1:1 — and
 * accepting it would leave one browser holding two microphones, two sets of
 * peer connections, and two call UIs stacked on top of each other.
 *
 * So the busy bit lives here, in one Map that both handlers claim from and
 * release into. It is deliberately tiny and deliberately not a lock: it holds
 * no timers, no sockets and no call state, and losing it (a restart) loses
 * nothing that is not already lost with the calls themselves.
 *
 * ## Semantics
 *
 * A claim is identified by `(kind, id)` so a release can only ever clear the
 * claim it made. That is the property that makes the two features safe to
 * interleave: if a group call claims a user in the window between a 1:1's busy
 * check and its own claim, the 1:1's later `releaseBusy` is a no-op rather than
 * a hijack, and the user stays correctly busy in the room they are actually in.
 *
 * Re-claiming the same `(userId, kind, id)` succeeds — joining a room you are
 * already in is idempotent everywhere else in these handlers, and it would be
 * strange for the busy bit alone to refuse it.
 *
 * Single process, no Redis (server/CLAUDE.md §Gotchas 1).
 */

/** Which feature holds the claim. Used only for logging and for idempotence. */
export type BusyKind = 'call' | 'gcall';

export interface BusyClaim {
  kind: BusyKind;
  /** The `Call.id` or `GroupCall.id` the user is occupied by. */
  id: string;
}

const busy = new Map<string, BusyClaim>();

/**
 * Mark a user as being in a call.
 *
 * Returns `false` when they already are in a *different* one — the caller's cue
 * to refuse with `busy`. Returns `true` when the claim was taken, or when this
 * exact claim was already held.
 */
export function claimBusy(userId: string, kind: BusyKind, id: string): boolean {
  const current = busy.get(userId);
  if (current) return current.kind === kind && current.id === id;
  busy.set(userId, { kind, id });
  return true;
}

/**
 * Release a claim.
 *
 * Scoped by `id`: a release for a call the user is no longer in does nothing,
 * so a late teardown cannot free a user who has since joined something else.
 */
export function releaseBusy(userId: string, id: string): void {
  const current = busy.get(userId);
  if (current && current.id === id) busy.delete(userId);
}

/** What the user is busy with, or `null`. */
export function getBusy(userId: string): BusyClaim | null {
  return busy.get(userId) ?? null;
}

/** Test seam: how many users are currently claimed. */
export function __busyCount(): number {
  return busy.size;
}
