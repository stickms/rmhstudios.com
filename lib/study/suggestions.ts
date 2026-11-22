/**
 * Suggested corrections to a public deck's cards (s10-04). Pure and client-safe: the limits, the gates that need no
 * database, the no-change test and the word-level diff the author reads. The database side is `suggestions.server.ts`.
 */
import type { CardKind } from '@/lib/study/card-types';
import { diffStat, diffWords, type DiffPart } from '@/lib/feed/word-diff';

/** Open suggestions one member may have on one deck. */
export const MAX_OPEN_PER_MEMBER_DECK = 20;
/** Open suggestions one deck may hold in total: the author's inbox is bounded. */
export const MAX_OPEN_PER_DECK = 200;
/** Suggestions one member may make in a day (the rate limit of the create endpoint). */
export const MAX_SUGGESTIONS_PER_DAY = 30;
/** An account must be at least this old (`User.createdAt`) to suggest. */
export const MIN_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Characters in the optional note. */
export const SUGGESTION_NOTE_MAX = 500;
/** Characters in the author's decline reason, the only author text a suggester sees. */
export const DECLINE_REASON_MAX = 200;

/** The card kinds a suggestion may target: text cards. Occlusion masks are out of scope. */
export const SUGGESTABLE_KINDS: readonly CardKind[] = ['basic', 'reversible', 'cloze'];

export type SuggestionStatus = 'open' | 'accepted' | 'declined' | 'withdrawn';

/** Why a suggestion was refused; the client maps each to a sentence (a `t()` call in a component). */
export type SuggestionRefusal =
  | 'not-found'
  | 'own-deck'
  | 'blocked'
  | 'banned'
  | 'too-new'
  | 'off'
  | 'not-suggestable'
  | 'invalid'
  | 'duplicate'
  | 'no-change'
  | 'member-cap'
  | 'deck-cap'
  | 'already-decided';

export function isSuggestable(kind: string): boolean {
  return (SUGGESTABLE_KINDS as readonly string[]).includes(kind);
}

/** Whether an account created at `createdAt` may suggest yet. */
export function accountOldEnough(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - createdAt.getTime() >= MIN_ACCOUNT_AGE_MS;
}

/** The text as stored and compared: both sides trimmed. */
export function normalizeSides(sides: { front: string; back?: string | null | undefined }): {
  front: string;
  back: string;
} {
  return { front: sides.front.trim(), back: (sides.back ?? '').trim() };
}

/** Same front and back after trimming. */
export function sameText(
  a: { front: string; back?: string | null },
  b: { front: string; back?: string | null },
): boolean {
  const x = normalizeSides(a);
  const y = normalizeSides(b);
  return x.front === y.front && x.back === y.back;
}

/* ------------------------------- word diff -------------------------------- */

/**
 * The word diff the author reads for one side of a card, with its text summary: "2 words changed" is the larger of
 * the words removed and the words added (a one-word replacement is one word changed, not two). The diff itself is the
 * site's one word differ (`lib/feed/word-diff.ts`), so a change shows the same way here as in an edit history.
 */
export function diffSummary(before: string, after: string): { parts: DiffPart[]; changed: number } {
  const parts = diffWords(before, after);
  const { added, removed } = diffStat(parts);
  return { parts, changed: Math.max(added, removed) };
}

/** A suggestion as a member sees it in their own list. */
export interface MySuggestion {
  id: string;
  cardId: string;
  front: string;
  back: string;
  note: string | null;
  status: SuggestionStatus;
  declineReason: string | null;
  createdAt: string;
}

/** A suggestion as the deck's author reviews it: against the card as it is now. */
export interface AuthorSuggestion {
  id: string;
  cardId: string;
  kind: CardKind;
  /** The card's current text. */
  currentFront: string;
  currentBack: string;
  /** The proposed text. */
  front: string;
  back: string;
  note: string | null;
  /** The card changed after the suggestion was made. */
  stale: boolean;
  createdAt: string;
  /** The suggester, for "Decline and block". */
  suggester: { id: string; name: string };
}
