import { describe, it, expect, vi } from 'vitest';
import { linkPostHashtags } from '@/lib/tags-extract.server';

// The tag feed is a keyset scan of post_hashtag(hashtagId, createdAt DESC,
// rmheetId DESC) that stands in for ORDER BY rmheet.createdAt, so a link must carry
// the POST's createdAt - never the time it was (re)linked.
function fakeTx(postCreatedAt: Date) {
  const createMany = vi.fn(async () => ({ count: 1 }));
  const findUnique = vi.fn(async () => ({ createdAt: postCreatedAt }));
  const tx = {
    hashtag: {
      createMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => [{ id: 'h1' }]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    postHashtag: { findMany: vi.fn(async () => []), createMany },
    rMHark: { findUnique },
  };
  return { tx: tx as never, createMany, findUnique };
}

describe('linkPostHashtags createdAt', () => {
  it('uses the createdAt the caller passes, with no extra read', async () => {
    const d = new Date('2026-01-02T03:04:05Z');
    const { tx, createMany, findUnique } = fakeTx(new Date(0));
    await linkPostHashtags(tx, 'p1', 'hello #world', d);
    expect(findUnique).not.toHaveBeenCalled();
    expect(
      (createMany.mock.calls[0] as unknown as [{ data: { createdAt: Date }[] }])[0].data[0]
        .createdAt,
    ).toBe(d);
  });
  it('reads the post createdAt on a re-link', async () => {
    const d = new Date('2025-05-05T00:00:00Z');
    const { tx, createMany, findUnique } = fakeTx(d);
    await linkPostHashtags(tx, 'p1', 'hello #world');
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(
      (createMany.mock.calls[0] as unknown as [{ data: { createdAt: Date }[] }])[0].data[0]
        .createdAt,
    ).toBe(d);
  });
});
