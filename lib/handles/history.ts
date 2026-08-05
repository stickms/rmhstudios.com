/**
 * Handle-change rules (J2) — the pure half.
 *
 * `lib/handle.ts` owns what a handle may *look* like. This module owns what
 * happens when one *moves*, which is a trust question rather than a formatting
 * one: an account can build a reputation as `@alice`, hand the handle over, and
 * without a record the history is simply gone. Three rules, all of them here so
 * they can be tested without a database:
 *
 *  1. **Cooldown** — one change per 30 days. (`lib/handle.ts` still carries the
 *     older 14-day `HANDLE_COOLDOWN_MS` used by `PATCH /api/profile`; J2 asks
 *     for 30, and this module is the J2 path. See the note on
 *     {@link HANDLE_CHANGE_COOLDOWN_MS}.)
 *  2. **Reclaim block** — a handle released in the last 30 days cannot be
 *     taken by anyone else. Without it, "wait for @alice to rename, grab it,
 *     impersonate her" is a thirty-second attack.
 *  3. **Previously known as** — the last few handles surface on the profile for
 *     30 days after a change, which defeats the most common impersonation play
 *     at essentially no cost.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One handle change per 30 days (J2).
 *
 * Deliberately longer than `HANDLE_COOLDOWN_MS` in `lib/handle.ts` (14 days),
 * which predates this feature and still governs the legacy
 * `PATCH /api/profile` path. Two cooldowns is one too many: the legacy route
 * should call {@link canChangeHandleNow} and this constant should become the
 * only answer.
 */
export const HANDLE_CHANGE_COOLDOWN_MS = 30 * DAY_MS;

/** A released handle is frozen for 30 days before anyone else may claim it. */
export const HANDLE_RECLAIM_BLOCK_MS = 30 * DAY_MS;

/** How long a former handle is shown under "previously known as". */
export const PREVIOUS_HANDLE_WINDOW_MS = 30 * DAY_MS;

/** How many former handles the profile surfaces at most. */
export const MAX_PREVIOUS_HANDLES = 3;

/** The subset of a `HandleChange` row this module reasons about. */
export interface HandleChangeRecord {
  userId: string;
  oldHandle: string;
  newHandle: string;
  createdAt: Date;
}

/** Milliseconds until this user may change their handle again; 0 when free. */
export function handleChangeCooldownRemaining(
  lastChangeAt: Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!lastChangeAt) return 0;
  const elapsed = now.getTime() - lastChangeAt.getTime();
  return Math.max(0, HANDLE_CHANGE_COOLDOWN_MS - elapsed);
}

/**
 * Whether a user may change their handle right now.
 *
 * Admins bypass, matching `canChangeHandle` in `lib/handle.ts` — moderation has
 * to be able to rename an impersonating account immediately, and a 30-day wait
 * on that is a 30-day-long impersonation.
 */
export function canChangeHandleNow(
  lastChangeAt: Date | null | undefined,
  isAdmin = false,
  now: Date = new Date(),
): boolean {
  if (isAdmin) return true;
  return handleChangeCooldownRemaining(lastChangeAt, now) === 0;
}

/**
 * Is `handle` frozen because somebody released it recently?
 *
 * `claimantId` is exempted: taking your own old handle back is a *correction*,
 * not a hijack, and blocking it would punish the person the rule protects. The
 * newest release wins — a handle can have been released more than once.
 */
export function isHandleReclaimBlocked(
  releases: readonly HandleChangeRecord[],
  handle: string,
  options: { claimantId?: string | null; now?: Date } = {},
): boolean {
  const { claimantId = null, now = new Date() } = options;
  const wanted = handle.trim().toLowerCase();
  if (!wanted) return false;

  const relevant = releases
    .filter((row) => row.oldHandle.toLowerCase() === wanted)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latest = relevant[0];
  if (!latest) return false;
  if (claimantId && latest.userId === claimantId) return false;
  return now.getTime() - latest.createdAt.getTime() < HANDLE_RECLAIM_BLOCK_MS;
}

/** Milliseconds until a frozen handle becomes claimable; 0 when it is free. */
export function reclaimBlockRemaining(
  releases: readonly HandleChangeRecord[],
  handle: string,
  options: { claimantId?: string | null; now?: Date } = {},
): number {
  const { claimantId = null, now = new Date() } = options;
  const wanted = handle.trim().toLowerCase();
  const latest = releases
    .filter((row) => row.oldHandle.toLowerCase() === wanted)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!latest) return 0;
  if (claimantId && latest.userId === claimantId) return 0;
  return Math.max(0, HANDLE_RECLAIM_BLOCK_MS - (now.getTime() - latest.createdAt.getTime()));
}

export interface PreviousHandle {
  handle: string;
  changedAt: Date;
}

/**
 * The "previously known as" list for a profile.
 *
 * Newest first, de-duplicated (renaming a→b→a→b should not print `a` twice),
 * capped at {@link MAX_PREVIOUS_HANDLES}, and windowed to
 * {@link PREVIOUS_HANDLE_WINDOW_MS}. A handle the account currently holds is
 * never listed as a former one.
 */
export function previousHandles(
  changes: readonly HandleChangeRecord[],
  options: { currentHandle?: string | null; now?: Date } = {},
): PreviousHandle[] {
  const { currentHandle = null, now = new Date() } = options;
  const cutoff = now.getTime() - PREVIOUS_HANDLE_WINDOW_MS;
  const current = currentHandle?.toLowerCase() ?? null;

  const seen = new Set<string>();
  const out: PreviousHandle[] = [];
  const ordered = [...changes].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  for (const row of ordered) {
    if (row.createdAt.getTime() < cutoff) continue;
    const handle = row.oldHandle.toLowerCase();
    if (!handle || handle === current || seen.has(handle)) continue;
    seen.add(handle);
    out.push({ handle: row.oldHandle, changedAt: row.createdAt });
    if (out.length >= MAX_PREVIOUS_HANDLES) break;
  }
  return out;
}
