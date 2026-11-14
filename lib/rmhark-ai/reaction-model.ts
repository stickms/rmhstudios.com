/**
 * The probability model behind bot reactions to sitewide announcements and to
 * outside-world headlines. Pure: no Prisma, no I/O, no clock, no Math.random —
 * every function takes the time and the random draw it needs, so the worker
 * ticks (`./bot-worker.server.ts`) stay deterministic under test.
 *
 * The shape it imitates is how a real feed reacts to news: a burst in the first
 * hours, a long thin tail, most accounts saying nothing, and attention moving on
 * to the next story instead of every account covering the same one.
 *
 *  - What a due bot posts is drawn from a three-way distribution (`postKindPmf`):
 *    react to the live announcement, react to a headline, or post as usual.
 *    The announcement's share starts at one post in two and decays with a
 *    time constant of 18 hours; headlines take 30% of what is left.
 *  - Which headline is chosen is weighted by freshness and by how few bots have
 *    already covered it (`headlineWeight`).
 *  - How many bot comments land under the announcement's post in a tick is a
 *    Poisson draw whose rate falls from about seven an hour to a trickle
 *    (`announcementCommentsPerHour`), and each new comment answers another
 *    bot's comment 45% of the time, which is what makes it a conversation.
 *  - A headline reaction always carries the headline's link, on its own line after the
 *    text and outside the 280-character text limit; an announcement reaction carries its
 *    link `REACTION_LINK_PROB` of the time, within the limit (`withReactionLink`).
 */

/** A headline fetched from an outside feed, as the worker and the prompts see it. */
export interface Headline {
  /** Stable id for dedupe and `BotReaction.refKey` (a hash of the link). */
  key: string;
  title: string;
  /** Short description from the feed; may be empty. Plain text. */
  summary: string;
  /** Publisher name, e.g. "BBC News". */
  source: string;
  url: string;
  /** Publication time, epoch milliseconds. */
  publishedAt: number;
}

export type PostKind = 'announcement' | 'news' | 'usual';

export interface PostKindPmf {
  announcement: number;
  news: number;
  usual: number;
}

const HOUR = 3_600_000;

/** Bots stop writing new posts about an announcement after this long. */
export const ANNOUNCEMENT_REACTION_WINDOW_H = 72;
/** Share of bot posts about the announcement at the moment it goes live. */
export const ANNOUNCEMENT_PEAK_SHARE = 0.5;
/** Hours for that share to fall to 1/e. */
export const ANNOUNCEMENT_SHARE_TAU_H = 18;
/** Share of the remaining posts that react to a headline, when any are fresh. */
export const NEWS_SHARE = 0.3;

/** A headline older than this is no longer news to react to. */
export const HEADLINE_MAX_AGE_H = 36;
/** Hours for a headline's pull to fall to 1/e. */
export const HEADLINE_TAU_H = 10;
/** How sharply a story that bots already covered loses its pull. */
export const HEADLINE_CROWDING_EXPONENT = 1.5;

/** Expected bot comments per hour under a fresh announcement post. */
export const ANNOUNCEMENT_COMMENT_PEAK_PER_H = 7;
/** Hours for the comment burst to fall to 1/e. */
export const ANNOUNCEMENT_COMMENT_TAU_H = 6;
/** The long tail: comments per hour once the burst is over, until the window closes. */
export const ANNOUNCEMENT_COMMENT_FLOOR_PER_H = 0.4;
/** Chance a new comment answers another bot's comment instead of the post. */
export const THREAD_REPLY_PROB = 0.45;
/** Bots stop adding to an announcement thread at this many bot comments. */
export const MAX_BOT_COMMENTS_PER_ANNOUNCEMENT = 40;
/** One bot says at most this much in one announcement thread. */
export const MAX_COMMENTS_PER_BOT_PER_THREAD = 2;
/**
 * Chance an ANNOUNCEMENT reaction carries the link to the post it reacts to (the link then
 * counts against the 280-character limit). Headline reactions ignore this: they always carry
 * their link, outside the limit.
 */
export const REACTION_LINK_PROB = 0.5;
/** Longest outside link a reaction will carry; a longer one is left off (matches `/api/oembed`'s cap). */
export const MAX_REACTION_LINK_LENGTH = 2048;

/** Hours between two epoch-millisecond instants, never negative. */
export function ageHours(now: number, then: number): number {
  return Math.max(0, now - then) / HOUR;
}

/**
 * What a bot that is due to post writes about. `announcementAgeH` is null when
 * no announcement is live; `headlineCount` is how many fresh headlines exist.
 * The three probabilities always sum to 1.
 */
export function postKindPmf(input: {
  announcementAgeH: number | null;
  headlineCount: number;
}): PostKindPmf {
  const { announcementAgeH, headlineCount } = input;
  const announcement =
    announcementAgeH !== null &&
    announcementAgeH >= 0 &&
    announcementAgeH <= ANNOUNCEMENT_REACTION_WINDOW_H
      ? ANNOUNCEMENT_PEAK_SHARE * Math.exp(-announcementAgeH / ANNOUNCEMENT_SHARE_TAU_H)
      : 0;
  const news = headlineCount > 0 ? NEWS_SHARE * (1 - announcement) : 0;
  return { announcement, news, usual: 1 - announcement - news };
}

/** Draw a kind from the distribution with a uniform `u` in [0, 1). */
export function sampleKind(pmf: PostKindPmf, u: number): PostKind {
  if (u < pmf.announcement) return 'announcement';
  if (u < pmf.announcement + pmf.news) return 'news';
  return 'usual';
}

/**
 * A headline's pull: fresh stories that few bots have covered win. Zero once
 * the story is older than `HEADLINE_MAX_AGE_H`.
 */
export function headlineWeight(ageH: number, reactions: number): number {
  if (!Number.isFinite(ageH) || ageH < 0 || ageH > HEADLINE_MAX_AGE_H) return 0;
  const crowding = Math.pow(1 + Math.max(0, reactions), HEADLINE_CROWDING_EXPONENT);
  return Math.exp(-ageH / HEADLINE_TAU_H) / crowding;
}

/**
 * Pick one item in proportion to its weight with a uniform `u` in [0, 1).
 * Null when there is nothing to pick (no items, or every weight is zero).
 */
export function pickWeighted<T>(
  items: readonly T[],
  weights: readonly number[],
  u: number,
): T | null {
  // A missing, negative or non-finite (NaN) weight counts as zero: one NaN must not poison the total.
  const weightAt = (i: number): number => {
    const w = weights[i] ?? 0;
    return Number.isFinite(w) && w > 0 ? w : 0;
  };
  let total = 0;
  for (let i = 0; i < items.length; i++) total += weightAt(i);
  if (total <= 0) return null;
  let cursor = u * total;
  let last: T | null = null;
  for (let i = 0; i < items.length; i++) {
    const w = weightAt(i);
    if (w <= 0) continue;
    last = items[i] as T;
    if (cursor < w) return last;
    cursor -= w;
  }
  return last;
}

/** Expected bot comments per hour under an announcement post of this age. */
export function announcementCommentsPerHour(ageH: number): number {
  if (!Number.isFinite(ageH) || ageH < 0 || ageH > ANNOUNCEMENT_REACTION_WINDOW_H) return 0;
  return (
    ANNOUNCEMENT_COMMENT_FLOOR_PER_H +
    ANNOUNCEMENT_COMMENT_PEAK_PER_H * Math.exp(-ageH / ANNOUNCEMENT_COMMENT_TAU_H)
  );
}

/** Expected bot comments in one reply tick of `tickMs`. */
export function announcementCommentsPerTick(ageH: number, tickMs: number): number {
  return announcementCommentsPerHour(ageH) * (Math.max(0, tickMs) / HOUR);
}

/**
 * A Poisson draw with mean `lambda` (Knuth's method), fed by `random`. Capped
 * so a misconfigured rate can never flood a thread in one tick.
 */
export function samplePoisson(lambda: number, random: () => number, cap = 20): number {
  if (!Number.isFinite(lambda) || lambda <= 0) return 0;
  const limit = Math.exp(-Math.min(lambda, 30));
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= random();
  } while (p > limit && k <= cap);
  return Math.min(k - 1, cap);
}
