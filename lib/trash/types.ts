/**
 * The recycle bin — the pure half (plan I1).
 *
 * `RMHark` and `RMHarkComment` are the only two models in the schema carrying a
 * `deletedAt`, and until now nothing could clear it: the row sat on disk with
 * its media, its reactions and its thread, unreachable. This module holds the
 * decision logic for giving it back, deliberately separated from
 * `trash.server.ts` so the rules are testable without a database.
 *
 * Nothing here imports Prisma or a `.server` module — `lib/entitlements/features`
 * is the client-safe registry, not the Prisma-backed `lib/entitlements`.
 */

import { canUse } from '@/lib/entitlements/features';
import type { Tier } from '@/lib/entitlements/tiers';

/** The two soft-deletable models. */
export type TrashKind = 'post' | 'comment';

export const TRASH_KINDS: readonly TrashKind[] = ['post', 'comment'];

export function isTrashKind(value: unknown): value is TrashKind {
  return value === 'post' || value === 'comment';
}

/**
 * Who performed the deletion. Persisted in `RMHark.deletedBy` /
 * `RMHarkComment.deletedBy` (`VarChar(12)`).
 *
 * Only `'author'` is restorable: a moderator removal that the moderated account
 * could undo is not a moderation system.
 */
export type DeletedBy = 'author' | 'moderator' | 'system';

/**
 * Resolve the discriminator for a row, including rows written before the column
 * existed.
 *
 * The two delete routes that predate this feature
 * (`app/routes/api/rmharks/$id.ts` and `.../comment/$commentId.ts`) still write
 * only the older boolean `deletedByAdmin`, so `deletedBy` is `null` on every
 * historical row and on everything those routes delete today. Treating `null`
 * as "unknown, therefore not restorable" would make the whole feature inert;
 * treating it as "author" unconditionally would hand moderated users an undo
 * button. `deletedByAdmin` answers exactly that question for the legacy rows, so
 * it is the fallback — and it fails **closed**, toward `'moderator'`.
 */
export function resolveDeletedBy(row: {
  deletedBy?: string | null;
  deletedByAdmin?: boolean | null;
}): DeletedBy {
  if (row.deletedBy === 'author' || row.deletedBy === 'moderator' || row.deletedBy === 'system') {
    return row.deletedBy;
  }
  return row.deletedByAdmin ? 'moderator' : 'author';
}

/* -------------------------------------------------------------------------- */
/* Retention window                                                           */
/* -------------------------------------------------------------------------- */

/** Free accounts keep deleted content recoverable for this long. */
export const TRASH_WINDOW_DAYS_FREE = 30;
/** Members (the `trash-extended` feature) get the longer window. */
export const TRASH_WINDOW_DAYS_MEMBER = 90;

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long this account's deleted content stays restorable.
 *
 * Derived from the feature registry rather than a second tier table, so the
 * membership page and this window can never disagree about who gets 90 days.
 */
export function trashWindowDays(tier: Tier): number {
  return canUse(tier, 'trash-extended') ? TRASH_WINDOW_DAYS_MEMBER : TRASH_WINDOW_DAYS_FREE;
}

/** The instant an item drops out of the bin for good. */
export function trashExpiresAt(deletedAt: Date, windowDays: number): Date {
  return new Date(deletedAt.getTime() + windowDays * DAY_MS);
}

/**
 * Whole days left before expiry, rounded **up** and floored at 0 — a row with
 * four hours left reads "1 day", never "0 days" beside a still-working Restore
 * button.
 */
export function daysRemaining(deletedAt: Date, windowDays: number, now: Date): number {
  const remaining = trashExpiresAt(deletedAt, windowDays).getTime() - now.getTime();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / DAY_MS);
}

/* -------------------------------------------------------------------------- */
/* Restore eligibility                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Why a restore was refused. A code rather than a sentence: the API returns it,
 * the UI maps it to a translated string, and the acceptance criteria ask for "a
 * specific reason, not a generic 400".
 */
export type RestoreRefusal =
  /** No such row (already hard-deleted by the sweep, or never existed). */
  | 'not-found'
  /** The row belongs to somebody else — ids are attacker-supplied. */
  | 'not-owner'
  /** Not in the bin at all; restoring a live row is a no-op, not a success. */
  | 'not-deleted'
  /** Removed by a moderator or by automod. Never restorable by the author. */
  | 'moderated'
  /** Past the retention window; the sweep may already have taken the media. */
  | 'expired'
  /** The post this comment replied to (or the quoted post) is hard-gone. */
  | 'parent-missing'
  /** The parent is itself in the bin — restore it first, then this. */
  | 'parent-deleted';

/** The parent chain state a caller resolves before asking about eligibility. */
export interface ParentState {
  /** Human label for the parent, used only in log/debug context. */
  label: 'post' | 'comment';
  /** False when the parent row is gone from the database entirely. */
  exists: boolean;
  /** Set when the parent row exists but is itself soft-deleted. */
  deletedAt: Date | null;
}

export interface RestoreCandidate {
  /** The row's author. */
  ownerId: string;
  deletedAt: Date | null;
  deletedBy?: string | null;
  deletedByAdmin?: boolean | null;
  /**
   * Every ancestor the restored row would point at: a comment's post and its
   * parent comment, a quote-repost's original, a thread segment's root. Empty
   * for a standalone post.
   */
  parents?: readonly ParentState[];
}

export type RestoreEligibility = { ok: true } | { ok: false; reason: RestoreRefusal };

/**
 * Can `userId` restore this row, right now?
 *
 * Ordered so the most specific answer wins: ownership before state, state
 * before policy, policy before the parent chain. A user who is not the owner
 * must not be able to distinguish "moderated" from "expired" on someone else's
 * post, which is why `not-owner` is checked first and returned unadorned.
 */
export function checkRestoreEligibility(
  userId: string,
  candidate: RestoreCandidate,
  now: Date,
  windowDays: number,
): RestoreEligibility {
  if (candidate.ownerId !== userId) return { ok: false, reason: 'not-owner' };
  if (!candidate.deletedAt) return { ok: false, reason: 'not-deleted' };
  if (resolveDeletedBy(candidate) !== 'author') return { ok: false, reason: 'moderated' };
  if (daysRemaining(candidate.deletedAt, windowDays, now) <= 0) {
    return { ok: false, reason: 'expired' };
  }
  for (const parent of candidate.parents ?? []) {
    if (!parent.exists) return { ok: false, reason: 'parent-missing' };
    if (parent.deletedAt) return { ok: false, reason: 'parent-deleted' };
  }
  return { ok: true };
}

/**
 * Can `userId` destroy this row right now?
 *
 * Deliberately *not* `checkRestoreEligibility` with the parent checks skipped:
 * purge has a different shape. Expiry does not block it (an expired row is
 * still listed until the sweep gets to it, and letting the owner finish the job
 * early is the point of "Delete forever"), but moderation does — `cleanup.server`
 * retains admin-deleted posts as moderation evidence, and a purge button that
 * shredded that evidence on request would be a hole straight through it.
 */
export function checkPurgeEligibility(
  userId: string,
  candidate: Pick<RestoreCandidate, 'ownerId' | 'deletedAt' | 'deletedBy' | 'deletedByAdmin'>,
): RestoreEligibility {
  if (candidate.ownerId !== userId) return { ok: false, reason: 'not-owner' };
  if (!candidate.deletedAt) return { ok: false, reason: 'not-deleted' };
  if (resolveDeletedBy(candidate) !== 'author') return { ok: false, reason: 'moderated' };
  return { ok: true };
}

/**
 * HTTP status for a refusal — the API maps codes to statuses in one place.
 *
 * `not-owner` is a **404**, not a 403: a 403 confirms that the id the caller
 * guessed is a real row belonging to someone, which is exactly what an attacker
 * enumerating ids is trying to learn.
 */
export function refusalStatus(reason: RestoreRefusal): number {
  switch (reason) {
    case 'not-found':
    case 'not-owner':
      return 404;
    case 'moderated':
      return 403;
    default:
      return 409;
  }
}

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                */
/* -------------------------------------------------------------------------- */

/** One row in the bin, as the API serialises it. */
export interface TrashItem {
  kind: TrashKind;
  id: string;
  /** First ~160 characters of the content, for the row's preview line. */
  excerpt: string;
  createdAt: string;
  deletedAt: string;
  expiresAt: string;
  daysRemaining: number;
  /** False when the row is in the bin but cannot be put back. */
  restorable: boolean;
  /** Populated exactly when `restorable` is false. */
  reason: RestoreRefusal | null;
  /** Posts: how many images would come back with it. */
  imageCount?: number;
  /** Comments: the post the comment lives under, for the "view thread" link. */
  postId?: string;
}

export interface TrashPage {
  items: TrashItem[];
  nextCursor: string | null;
  /** The caller's current window, so the UI can explain "30 days" vs "90". */
  windowDays: number;
}

/** How many rows one page of the bin returns. */
export const TRASH_PAGE_SIZE = 30;

/** Longest excerpt stored on a `TrashItem`. */
export const TRASH_EXCERPT_CHARS = 160;

/** Collapse content to a single-line preview. */
export function excerptOf(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > TRASH_EXCERPT_CHARS ? `${flat.slice(0, TRASH_EXCERPT_CHARS - 1)}…` : flat;
}
