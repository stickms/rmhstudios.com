/**
 * Following a news story (s13-12) — the pure rules, client-safe. A follower is told once when an admin links a
 * published article to the story. The database side is `story-follows.server.ts`; the strings are the components'.
 */

/** A member follows at most this many stories. */
export const NEWS_STORY_FOLLOW_LIMIT = 200;
/** The fan-out reads this many followers per batch. */
export const STORY_FANOUT_BATCH = 200;
/** The most followers one article notice reaches (a runaway guard; a story rarely has thousands). */
export const STORY_FANOUT_MAX = 50_000;

/** The work queue the article notice rides (`server/jobs/index.ts`). */
export const STORY_FANOUT_QUEUE = 'news.story-article-fanout';
/** The notification's entity type (labelled in the inbox). */
export const STORY_NOTICE_ENTITY = 'news_story';

export interface StoryFanoutJob {
  storyId: string;
  articleSlug: string;
}

/** The run's subject: one run per (story, article), so linking the same article again tells nobody twice. */
export function storyFanoutSubject(storyId: string, articleSlug: string): string {
  return `${storyId}:${articleSlug}`;
}

/** The inverse of {@link storyFanoutSubject}. A story id is a cuid (no colon), so the first colon splits it. */
export function parseStoryFanoutSubject(subject: string): StoryFanoutJob | null {
  const at = subject.indexOf(':');
  if (at <= 0 || at === subject.length - 1) return null;
  return { storyId: subject.slice(0, at), articleSlug: subject.slice(at + 1) };
}

/** One job per (story, article): enqueueing the same pair twice is one job. */
export function storyFanoutJobKey(storyId: string, articleSlug: string): string {
  return `news-story-article:${storyFanoutSubject(storyId, articleSlug)}`;
}

/** Where the notice leads, and what "already told" matches on. */
export function storyNoticeLink(articleSlug: string): string {
  return `/news/${articleSlug}`;
}

/** True when the member is at the cap and a new story would be the 201st. */
export function atStoryFollowCap(count: number): boolean {
  return count >= NEWS_STORY_FOLLOW_LIMIT;
}

/** A banned or pending-deletion (also erased, whose account is locked far ahead) member is not told. */
export function isFollowerReachable(
  user: { bannedUntil: Date | null; deletionScheduledAt: Date | null },
  now: Date,
): boolean {
  if (user.deletionScheduledAt) return false;
  return !(user.bannedUntil && user.bannedUntil.getTime() > now.getTime());
}

/** The ids among `candidates` who may be told. */
export function eligibleFollowers(
  candidates: readonly { id: string; bannedUntil: Date | null; deletionScheduledAt: Date | null }[],
  now: Date,
): string[] {
  return candidates.filter((c) => isFollowerReachable(c, now)).map((c) => c.id);
}
