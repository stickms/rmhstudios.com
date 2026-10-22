/**
 * The hashtag registry (typeahead, trending, counts) is global and cached for
 * everyone, so it may only learn tags from posts anyone can read. A
 * FOLLOWERS / CIRCLE / SUPPORTERS / PRIVATE post, or one in a private
 * community, used to feed it and so surfaced its tags to strangers.
 */
import { describe, expect, it, vi } from 'vitest';
import { linkPostHashtagsIfPublic } from '@/lib/tags-extract.server';

function fakeTx(communityPrivate: boolean | null) {
  const hashtagCreate = vi.fn(async () => ({ count: 1 }));
  const tx = {
    hashtag: {
      createMany: hashtagCreate,
      findMany: vi.fn(async () => [{ id: 'h1' }]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    postHashtag: { findMany: vi.fn(async () => []), createMany: vi.fn(async () => ({ count: 1 })) },
    community: {
      findUnique: vi.fn(async () => (communityPrivate === null ? null : { isPrivate: communityPrivate })),
    },
  };
  return { tx: tx as never, linked: () => hashtagCreate.mock.calls.length > 0 };
}

const post = (over: Partial<{ audience: string; communityId: string | null }> = {}) => ({
  id: 'p1',
  content: 'hello #secret',
  createdAt: new Date(),
  audience: 'PUBLIC',
  communityId: null as string | null,
  ...over,
});

describe('linkPostHashtagsIfPublic', () => {
  it('links a public post', async () => {
    const { tx, linked } = fakeTx(null);
    await linkPostHashtagsIfPublic(tx, post());
    expect(linked()).toBe(true);
  });

  it('links a public post in a public community', async () => {
    const { tx, linked } = fakeTx(false);
    await linkPostHashtagsIfPublic(tx, post({ communityId: 'c1' }));
    expect(linked()).toBe(true);
  });

  it.each(['FOLLOWERS', 'CIRCLE', 'SUPPORTERS', 'PRIVATE'])('does not link a %s post', async (audience) => {
    const { tx, linked } = fakeTx(null);
    await linkPostHashtagsIfPublic(tx, post({ audience }));
    expect(linked()).toBe(false);
  });

  it('does not link a post in a private community, even a PUBLIC-audience one', async () => {
    const { tx, linked } = fakeTx(true);
    await linkPostHashtagsIfPublic(tx, post({ communityId: 'c1' }));
    expect(linked()).toBe(false);
  });

  it('does not link when the community cannot be resolved', async () => {
    const { tx, linked } = fakeTx(null);
    await linkPostHashtagsIfPublic(tx, post({ communityId: 'gone' }));
    expect(linked()).toBe(false);
  });
});
