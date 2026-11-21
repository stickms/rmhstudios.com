import { describe, expect, it } from 'vitest';
import type { FeedItem } from '@/lib/feed-types';
import { REPOST_MUTE_LIMIT, repostMuteTarget, withoutRepostsBy } from '@/lib/feed/repost-mutes';

type Card = Pick<FeedItem, 'user' | 'repostedBy'> & {
  id: string;
};
const person = (id: string, name = id) =>
  ({
    id,
    name,
    handle: `${id}-h`,
    username: null,
    image: null,
  }) as NonNullable<FeedItem['user']>;

describe('withoutRepostsBy (the optimistic removal the timeline applies)', () => {
  const items: Card[] = [
    {
      id: 'own-a',
      user: person('a'),
    },
    {
      id: 'rp-a',
      user: person('x'),
      repostedBy: person('a'),
    },
    {
      id: 'rp-b',
      user: person('a'),
      repostedBy: person('b'),
    },
    {
      id: 'rp-a-2',
      user: person('y'),
      repostedBy: person('a'),
    },
    {
      id: 'own-b',
      user: person('b'),
    },
  ];

  it('removes every item whose repostedBy is that person', () => {
    expect(withoutRepostsBy(items, 'a').map((i) => i.id)).toEqual(['own-a', 'rp-b', 'own-b']);
  });

  it("keeps the person's own posts and other people's reposts of them", () => {
    const kept = withoutRepostsBy(items, 'a').map((i) => i.id);
    expect(kept).toContain('own-a');
    expect(kept).toContain('rp-b');
  });

  it('returns the same items when nothing matches, and does not mutate the input', () => {
    const before = items.map((i) => i.id);
    expect(withoutRepostsBy(items, 'nobody')).toHaveLength(items.length);
    expect(items.map((i) => i.id)).toEqual(before);
  });
});

describe('repostMuteTarget (whose reposts the menu acts on)', () => {
  it('is the reposter on a repost', () => {
    expect(
      repostMuteTarget(
        {
          user: person('author'),
          repostedBy: person('rp', 'Rae'),
        },
        'me',
      ),
    ).toEqual({
      id: 'rp',
      name: 'Rae',
    });
  });

  it('is the author on any other post', () => {
    expect(
      repostMuteTarget(
        {
          user: person('author', 'Ada'),
        },
        'me',
      ),
    ).toEqual({
      id: 'author',
      name: 'Ada',
    });
  });

  it('falls back to the handle, and is null for your own card', () => {
    expect(
      repostMuteTarget(
        {
          user: {
            ...person('u'),
            name: '',
          },
        },
        'me',
      ),
    ).toEqual({
      id: 'u',
      name: 'u-h',
    });
    expect(
      repostMuteTarget(
        {
          user: person('me'),
        },
        'me',
      ),
    ).toBeNull();
    expect(
      repostMuteTarget(
        {
          user: person('author'),
          repostedBy: person('me'),
        },
        'me',
      ),
    ).toBeNull();
  });
});

describe('limit', () => {
  it('is 1,000 people', () => {
    expect(REPOST_MUTE_LIMIT).toBe(1000);
  });
});
