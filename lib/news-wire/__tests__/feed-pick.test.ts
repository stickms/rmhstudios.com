/**
 * RMH News in the feed: the owner's rule is "don't spam the feed". What is pinned here is the cap: at most N picks in
 * any 24 hours, never two within the gap, none when switched off, and a pick that spreads across topics.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_FEED_PICK_POLICY, choosePick, feedPickPolicy, pickIsDue, type PickCandidate } from '../feed-pick';

const NOW = new Date('2026-11-23T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const policy = DEFAULT_FEED_PICK_POLICY;

function candidate(over: Partial<PickCandidate>): PickCandidate {
  return {
    id: 'a',
    category: 'World',
    publisher: 'BBC News',
    publishedAt: hoursAgo(1),
    hasImage: true,
    opened: false,
    comments: 0,
    reposts: 0,
    likes: 0,
    ...over,
  };
}

describe('pickIsDue', () => {
  it('allows the first pick, then waits out the gap', () => {
    expect(pickIsDue(policy, [], NOW)).toBe(true);
    expect(pickIsDue(policy, [hoursAgo(2.9)], NOW)).toBe(false);
    expect(pickIsDue(policy, [hoursAgo(3)], NOW)).toBe(true);
  });

  it('stops at the daily cap, counted over a rolling 24 hours', () => {
    const four = [hoursAgo(3), hoursAgo(8), hoursAgo(14), hoursAgo(20)];
    expect(pickIsDue(policy, four, NOW)).toBe(false);
    const oneAged = [hoursAgo(3), hoursAgo(8), hoursAgo(14), hoursAgo(25)];
    expect(pickIsDue(policy, oneAged, NOW)).toBe(true);
  });

  it('is off at 0 and never above 12 a day', () => {
    expect(pickIsDue(feedPickPolicy({ NEWS_FEED_PICKS_PER_DAY: '0' }), [], NOW)).toBe(false);
    expect(feedPickPolicy({ NEWS_FEED_PICKS_PER_DAY: '500' }).perDay).toBe(12);
    expect(feedPickPolicy({}).perDay).toBe(4);
  });
});

describe('choosePick', () => {
  it('prefers the story readers are engaging with', () => {
    const quiet = candidate({ id: 'quiet', publishedAt: hoursAgo(0.5) });
    const discussed = candidate({ id: 'discussed', publishedAt: hoursAgo(5), comments: 6, reposts: 2, opened: true });
    expect(choosePick([quiet, discussed], [], policy, NOW)?.id).toBe('discussed');
  });

  it('moves off a topic the last picks used, and skips stale stories', () => {
    const sports = candidate({ id: 'sports', category: 'Sports', publishedAt: hoursAgo(1) });
    const science = candidate({ id: 'science', category: 'Science', publishedAt: hoursAgo(2) });
    expect(choosePick([sports, science], [{ category: 'Sports', publisher: 'ESPN' }], policy, NOW)?.id).toBe('science');
    expect(choosePick([candidate({ publishedAt: hoursAgo(13) })], [], policy, NOW)).toBeNull();
  });
});
