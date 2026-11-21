/**
 * The feed row's kickers are literal `t()` calls (so `pnpm i18n:extract` sees
 * them), one per `FeedItemType`. A category the server sends that is not a feed
 * type is not translated: the row shows it humanised, never as a key.
 */
import { describe, expect, it } from 'vitest';
import { recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { feedKickerLabel } from '@/components/feed/kicker-labels';
import type { FeedItemType } from '@/lib/feed-types';

// `Record` forces this list to name every `FeedItemType`.
const ENGLISH: Record<FeedItemType, string> = {
  rmhark: 'Rmhark',
  game_announcement: 'Game announcement',
  app_announcement: 'App announcement',
  news: 'News',
  blog: 'Blog',
  research: 'Research',
  election_announcement: 'Election announcement',
};

describe('feed kicker labels', () => {
  it('translates every feed type under kicker.<type> in the feed namespace', () => {
    for (const [type, english] of Object.entries(ENGLISH)) {
      const { t, calls } = recordingT();
      expect(feedKickerLabel(t, type), type).toBe(english);
      expect(calls).toEqual([{ key: `kicker.${type}`, ns: 'feed', defaultValue: english }]);
    }
  });

  it('leaves a category it does not know to the caller', () => {
    const { t, calls } = recordingT();
    expect(feedKickerLabel(t, 'GAME_ANNOUNCEMENT')).toBeUndefined();
    expect(feedKickerLabel(t, 'constructor')).toBeUndefined();
    expect(calls).toEqual([]);
  });
});
