/**
 * Review item 13 (OG): the public, hour-cached post card printed a PRIVATE
 * community's name in its eyebrow. The name is members-only, so the card route
 * must hand the renderer `null` for it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ findUnique: vi.fn(), render: vi.fn() }));

vi.mock('@/lib/prisma.server', () => ({ prisma: { rMHark: { findUnique: h.findUnique } } }));
vi.mock('@/lib/og/post-image.server', () => ({ renderPostOgImage: h.render }));
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_o: unknown, fn: (c: unknown) => unknown) => fn,
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import { postCardCommunityName } from '@/lib/og/post-visibility';
import { Route } from '@/app/routes/api/og/post/$id';

const post = (community: { name: string; isPrivate: boolean } | null) => ({
  id: 'p1',
  content: 'hello',
  gifUrl: null,
  imageUrls: [],
  isSensitive: false,
  deletedAt: null,
  audience: 'PUBLIC',
  unlockPrice: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  likeCount: 0,
  commentCount: 0,
  repostCount: 0,
  user: { id: 'u1', name: 'Ada', handle: 'ada', image: null, profile: null },
  poll: null,
  community,
  original: null,
});

async function card(community: { name: string; isPrivate: boolean } | null) {
  h.findUnique.mockResolvedValue(post(community));
  const handler = (Route as unknown as {
    options: { server: { handlers: { GET: (c: unknown) => Promise<Response> } } };
  }).options.server.handlers.GET;
  await handler({ params: { id: 'p1' } });
  return h.render.mock.calls[0][0] as { community: string | null; revision: string };
}

beforeEach(() => {
  h.findUnique.mockReset();
  h.render.mockReset().mockResolvedValue(Buffer.from('png'));
});

describe('post card community name', () => {
  it('helper: private and missing communities yield no name', () => {
    expect(postCardCommunityName({ community: { name: 'Secret', isPrivate: true } })).toBeNull();
    expect(postCardCommunityName({ community: null })).toBeNull();
    expect(postCardCommunityName(null)).toBeNull();
    expect(postCardCommunityName({ community: { name: 'Open', isPrivate: false } })).toBe('Open');
  });

  it('route: a private community name never reaches the renderer', async () => {
    expect((await card({ name: 'Secret', isPrivate: true })).community).toBeNull();
  });

  it('route: a public community name is still shown', async () => {
    expect((await card({ name: 'Open', isPrivate: false })).community).toBe('Open');
  });
});
