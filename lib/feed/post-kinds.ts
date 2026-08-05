/**
 * Post kinds (F1) — megathreads and AMAs. Client-safe and pure.
 *
 * A 400-reply discussion and a Q&A are not different *objects* from a post;
 * they are the same object whose comment tree wants reading differently. So
 * `RMHark.kind` is a column and this is a lookup table, rather than two new
 * models with their own routes, permissions and moderation paths to keep in
 * step.
 *
 * The one genuinely new behaviour is `answered-first`. It IS the AMA feature:
 * a Q&A where the host's replies are scattered among a thousand questions is
 * unreadable, and sorting answered questions to the top — with a filter to show
 * only those — is the whole difference between "a thread" and "an AMA".
 */

export type PostKind = 'standard' | 'megathread' | 'ama';

/** How a kind's comment tree is ordered. */
export type CommentSort =
  /** Oldest first — a conversation read top to bottom. */
  | 'chronological'
  /** Engagement-weighted with a recency decay; the default for a big thread. */
  | 'hot'
  /** Questions the host has replied to first, then the rest by `hot`. */
  | 'answered-first';

export interface PostKindRules {
  readonly kind: PostKind;
  readonly commentSort: CommentSort;
  /**
   * How deep replies may nest.
   *
   * Deliberately shallow (2) for the big formats. Past two levels a thread
   * renders as a staircase on a phone, and the interesting content — the
   * host's answer — ends up indented off the right edge.
   */
  readonly maxDepth: number;
  /** Score at or below which a comment collapses behind a "show" control. */
  readonly collapseBelow: number;
  /** Whether the author's own replies get a visible host badge. */
  readonly hostBadge: boolean;
  /**
   * Whether top-level comments are treated as questions — which turns on the
   * answered/unanswered filter and the "N answered" count.
   */
  readonly questionMode: boolean;
  /** i18n key for the kind's label, in the `feed` namespace. */
  readonly labelKey: string;
}

const RULES: Record<PostKind, PostKindRules> = {
  standard: {
    kind: 'standard',
    commentSort: 'chronological',
    maxDepth: 6,
    // Only genuinely buried comments collapse; a normal thread should read
    // whole.
    collapseBelow: -5,
    hostBadge: false,
    questionMode: false,
    labelKey: 'post-kind-standard',
  },
  megathread: {
    kind: 'megathread',
    commentSort: 'hot',
    maxDepth: 2,
    collapseBelow: -2,
    hostBadge: true,
    questionMode: false,
    labelKey: 'post-kind-megathread',
  },
  ama: {
    kind: 'ama',
    commentSort: 'answered-first',
    maxDepth: 2,
    collapseBelow: -2,
    hostBadge: true,
    questionMode: true,
    labelKey: 'post-kind-ama',
  },
};

export const POST_KINDS: readonly PostKind[] = ['standard', 'megathread', 'ama'];

/**
 * Rules for a kind. Falls back to `standard` for an unknown value rather than
 * throwing: `kind` is a varchar with a default, so a row written by an older
 * deploy (or a future kind read by an older client) must render as an ordinary
 * post instead of blanking the thread.
 */
export function rulesFor(kind: string | null | undefined): PostKindRules {
  return RULES[(kind ?? 'standard') as PostKind] ?? RULES.standard;
}

export function isPostKind(value: unknown): value is PostKind {
  return typeof value === 'string' && value in RULES;
}

/** The subset of comment data the ordering needs. Kept minimal so it is testable. */
export interface SortableComment {
  readonly id: string;
  readonly createdAt: Date;
  readonly score: number;
  /** Null for a top-level comment. */
  readonly parentId: string | null;
  /** True when the post's author has replied anywhere beneath this comment. */
  readonly answeredByHost: boolean;
}

/** Engagement with a recency decay, so a good new comment can still surface. */
function hotScore(comment: SortableComment, now: number): number {
  const ageHours = Math.max(0, (now - comment.createdAt.getTime()) / 3_600_000);
  // A gentle decay: halves roughly every two days. Steeper and a megathread
  // becomes a treadmill where nothing survives a night.
  return comment.score / Math.pow(1 + ageHours / 48, 1.2);
}

/**
 * Order top-level comments for a kind.
 *
 * Pure and total — the same input always gives the same output, and ties break
 * on `id` so a re-render never reshuffles the page under someone mid-read.
 */
export function sortComments<T extends SortableComment>(
  comments: readonly T[],
  kind: string | null | undefined,
  now: number = 0,
): T[] {
  const { commentSort } = rulesFor(kind);
  const stamp = now || Date.now();

  const byId = (a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  switch (commentSort) {
    case 'chronological':
      return [...comments].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || byId(a, b),
      );
    case 'hot':
      return [...comments].sort((a, b) => hotScore(b, stamp) - hotScore(a, stamp) || byId(a, b));
    case 'answered-first':
      return [...comments].sort((a, b) => {
        // The one rule that matters: an answered question outranks every
        // unanswered one regardless of score, because the answer is the thing
        // the reader came for.
        if (a.answeredByHost !== b.answeredByHost) return a.answeredByHost ? -1 : 1;
        return hotScore(b, stamp) - hotScore(a, stamp) || byId(a, b);
      });
  }
}

/** Counts for the AMA header — "12 of 340 answered". */
export function answeredSummary(comments: readonly SortableComment[]): {
  total: number;
  answered: number;
} {
  const top = comments.filter((c) => c.parentId === null);
  return { total: top.length, answered: top.filter((c) => c.answeredByHost).length };
}
