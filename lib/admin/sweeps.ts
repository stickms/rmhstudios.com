/**
 * Spam sweeps (sprint 08 18) — the pure half: limits, window checks and the rules both the server and the
 * page read. Client-safe: no Prisma, no zod. The server half is `sweeps.server.ts`.
 *
 * A sweep removes a member's posts and replies in a time window in one audited, durable, undoable run. The
 * numbers here are the contract the specification fixes; change one and the tests that name it should fail.
 */

/** A sweep never holds more than this many items; a bigger window is refused at the preview. */
export const SWEEP_MAX_ITEMS = 5000;
/** Items handled per batch of the run. */
export const SWEEP_BATCH_SIZE = 100;
/** The longest window a sweep may span. */
export const SWEEP_MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** The window a sweep covers when the admin names none. */
export const SWEEP_DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Confirms one admin may make per hour. */
export const SWEEP_CONFIRMS_PER_HOUR = 10;
export const SWEEP_CONFIRM_WINDOW_MS = 60 * 60 * 1000;
/** A preview older than this must be made again before it can be confirmed. */
export const SWEEP_PREVIEW_TTL_MS = 60 * 60 * 1000;
export const SWEEP_REASON_MIN = 10;
export const SWEEP_REASON_MAX = 500;
/** The confirmation names the account's age when it is older than this. */
export const SWEEP_OLD_ACCOUNT_DAYS = 90;
/** Two sweeps of one member inside this window share one notice while the first is unread. */
export const SWEEP_NOTICE_GROUP_MS = 60 * 60 * 1000;
/** Items shown in the preview, newest first. */
export const SWEEP_SAMPLE_SIZE = 10;

export const SWEEP_STATUSES = ['PREVIEW', 'RUNNING', 'DONE', 'FAILED', 'UNDONE'] as const;
export type SweepStatus = (typeof SWEEP_STATUSES)[number];
export type SweepPhase = 'remove' | 'undo';
export type SweepEntityType = 'rmhark' | 'comment';
/** The order a run walks the kinds in. */
export const SWEEP_ENTITY_ORDER: readonly SweepEntityType[] = ['rmhark', 'comment'];

/** Why a sweep call was refused; the page turns each into a sentence. */
export type SweepRefusal =
  | 'not-found'
  | 'subject-not-found'
  | 'subject-admin'
  | 'subject-deleted'
  | 'window-order'
  | 'window-too-long'
  | 'window-future'
  | 'over-limit'
  | 'nothing-to-remove'
  | 'not-a-preview'
  | 'preview-expired'
  | 'already-running'
  | 'confirm-limit'
  | 'not-undoable';

/** The HTTP status each refusal answers with. */
export const SWEEP_REFUSAL_STATUS: Record<SweepRefusal, number> = {
  'not-found': 404,
  'subject-not-found': 404,
  'subject-admin': 403,
  'subject-deleted': 409,
  'window-order': 400,
  'window-too-long': 400,
  'window-future': 400,
  'over-limit': 422,
  'nothing-to-remove': 422,
  'not-a-preview': 409,
  'preview-expired': 409,
  'already-running': 409,
  'confirm-limit': 429,
  'not-undoable': 409,
};

export type WindowResult =
  { ok: true; from: Date; to: Date } | { ok: false; reason: 'window-order' | 'window-too-long' | 'window-future' };

/**
 * The window a sweep covers. Both ends omitted: the last 24 hours. Only `from`: up to now. `to` may not be in
 * the future (a sweep removes what already exists), must be after `from`, and the span is at most 30 days.
 */
export function resolveWindow(input: { from?: Date | undefined; to?: Date | undefined }, now: Date): WindowResult {
  const to = input.to ?? now;
  const from = input.from ?? new Date(to.getTime() - SWEEP_DEFAULT_WINDOW_MS);
  if (to.getTime() > now.getTime() + 60_000) return { ok: false, reason: 'window-future' };
  if (from.getTime() >= to.getTime()) return { ok: false, reason: 'window-order' };
  if (to.getTime() - from.getTime() > SWEEP_MAX_WINDOW_MS) return { ok: false, reason: 'window-too-long' };
  return { ok: true, from, to };
}

/** Whole days since the account was created (never negative). */
export function accountAgeDays(createdAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000));
}

/** True when the confirmation should say how old the account is. */
export function isOldAccount(ageDays: number): boolean {
  return ageDays > SWEEP_OLD_ACCOUNT_DAYS;
}

/**
 * Whether undo may restore an item: only while it is still in the state this sweep left it, which is
 * `deletedBy: 'moderator'` with the `deletedAt` the removal wrote. A later removal by another moderator (or
 * the author, after a restore) writes a new `deletedAt`, so it is never undone by this sweep. An item the
 * author deleted themselves was never swept at all.
 */
export function canUndoItem(
  row: { deletedAt: Date | null; deletedBy: string | null } | null,
  removedAt: Date,
): boolean {
  return !!row && !!row.deletedAt && row.deletedBy === 'moderator' && row.deletedAt.getTime() === removedAt.getTime();
}

/** True when a counted window is too big to sweep. */
export function overLimit(posts: number, replies: number): boolean {
  return posts + replies > SWEEP_MAX_ITEMS;
}

/** English text of the one notice a finished run sends. */
export function removalNoticeText(count: number, reason: string, strike: boolean): string {
  const noun = count === 1 ? 'post or reply was' : 'posts and replies were';
  const note = strike
    ? ' A strike was added to your account; you can review or appeal it in Settings → Account status.'
    : '';
  return `${count} ${noun} removed by site moderation. Reason: ${reason}.${note}`.slice(0, 1000);
}

/** English text of the one notice an undo sends. */
export function restoreNoticeText(count: number): string {
  const noun = count === 1 ? 'post or reply was' : 'posts and replies were';
  return `${count} ${noun} restored by site moderation.`;
}

/** A short text excerpt for the preview. */
export function excerpt(text: string | null | undefined, max = 120): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** One line of the preview: a text excerpt of an item the run would remove. */
export interface SweepSampleItem {
  entityType: SweepEntityType;
  id: string;
  excerpt: string;
  createdAt: string;
}

export interface SweepPreview {
  posts: number;
  replies: number;
  total: number;
  overLimit: boolean;
  sample: SweepSampleItem[];
  account: {
    ageDays: number;
    old: boolean;
    strikes: number;
    activeStrikes: number;
    handle: string | null;
  };
  /** Items that have replies or likes from other members. */
  engaged: number;
}

export interface SweepView {
  id: string;
  subjectId: string;
  subjectName: string;
  adminId: string;
  adminName: string;
  from: string;
  to: string;
  includePosts: boolean;
  includeReplies: boolean;
  reason: string;
  withStrike: boolean;
  status: SweepStatus;
  phase: SweepPhase;
  postCount: number;
  replyCount: number;
  removedCount: number;
  restoredCount: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  undoneAt: string | null;
  /** Finished with removals, and not undone yet. */
  canUndo: boolean;
}
