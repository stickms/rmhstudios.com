/**
 * The pure numbers behind the off-peak bot queue (design:
 * docs/superpowers/specs/2026-11-20-bot-offpeak-queue-design.md). No I/O, so
 * the sizing and pacing rules are unit-tested on their own.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;

/** The share of bot posts that are ordinary ("usual") rather than reactions. Conservative: a slightly big buffer is harmless. */
export const USUAL_POST_SHARE = 0.7;
/** Hours of usual posts a bot keeps queued: the longest stretch with no off-peak fill run (06:00-10:00 UTC plus the hour before the next run). */
export const BUFFER_HOURS = 5;
/** Model calls (posts and comments together) one fill run may make. */
export const FILL_CAP = 60;
/** A queued post nobody used is deleted this long after it was written. */
export const QUEUE_TTL_MS = 48 * HOUR;
/** At most this many pre-written top-level comments per queued post, on average. */
export const MAX_COMMENT_MEAN = 3;

/** Queued usual posts to keep for a bot that posts `perDay` times a day (multiplier applied). */
export function bufferTarget(perDay: number): number {
  if (!(perDay > 0)) return 0;
  return Math.ceil(((perDay * USUAL_POST_SHARE) / 24) * BUFFER_HOURS) + 1;
}

/**
 * Mean pre-written top-level comments per queued post: today's live seeding
 * rate (`proactiveProb` x multiplier per reply tick) spread over the bot posts
 * made in an hour, capped at `MAX_COMMENT_MEAN`.
 */
export function commentMean(
  proactiveProb: number,
  multiplier: number,
  replyTickMs: number,
  botPostsPerHour: number,
): number {
  if (!(botPostsPerHour > 0) || !(replyTickMs > 0)) return 0;
  const seedsPerHour = proactiveProb * multiplier * (HOUR / replyTickMs);
  return Math.min(MAX_COMMENT_MEAN, Math.max(0, seedsPerHour / botPostsPerHour));
}

/** A top-level comment lands 5-180 minutes after its post. `rnd` is uniform [0,1). */
export function commentDelayMs(rnd: number): number {
  return Math.round((5 + rnd * 175) * MIN);
}

/** A reply lands 2-60 minutes after the comment it answers. `rnd` is uniform [0,1). */
export function replyDelayMs(rnd: number): number {
  return Math.round((2 + rnd * 58) * MIN);
}
