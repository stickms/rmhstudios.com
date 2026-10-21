/**
 * POST /api/rmharks/:id/repost must not let a viewer republish a post they
 * cannot see (PRIVATE, someone else's FOLLOWERS/CIRCLE, deleted, by a blocked
 * author). Before, the route created the repost row for any post id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evalWhere, type Row } from './where-eval';

const h = vi.hoisted(() => ({
  posts: [] as Record<string, unknown>[],
  following: [] as string[],
  hidden: [] as string[],
  created: [] as unknown[],
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => ({ user: { id: 'viewer' }, session: {} }) } },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/feed-sse', () => ({ feedEventBus: { publish: vi.fn() } }));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async () => {}),
  removeNotification: vi.fn(async () => {}),
}));
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: async () => h.following }));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: async () => h.hidden }));
vi.mock('@/lib/prisma.server', () => {
  const prisma: Record<string, unknown> = {
    closeFriend: { findMany: async () => [] },
    rMHark: {
      findFirst: async (a: { where: Row }) => h.posts.find((p) => evalWhere(p, a.where)) ?? null,
      findUnique: async () => ({ userId: 'author', content: 'x' }),
      update: vi.fn(),
    },
    rMHarkRepost: {
      findUnique: async () => null,
      create: vi.fn((a) => {
        h.created.push(a);
        return a;
      }),
      findMany: async () => [],
    },
    $transaction: async () => [null, { repostCount: 1 }],
  };
  return { prisma };
});

import { Route } from '../../../app/routes/api/rmharks/$id/repost';

const POST = (
  Route as unknown as {
    options: {
      server: {
        handlers: {
          POST: (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
        };
      };
    };
  }
).options.server.handlers.POST;

async function repost(id: string) {
  const request = new Request(`https://x.test/api/rmharks/${id}/repost`, {
    method: 'POST',
    headers: { 'cf-connecting-ip': String(Math.random()) },
  });
  return POST({ request, params: { id } });
}

beforeEach(() => {
  h.following = ['friend'];
  h.hidden = ['blocked'];
  h.created.length = 0;
  h.posts = [
    { id: 'pub', userId: 'author', audience: 'PUBLIC', deletedAt: null },
    { id: 'priv', userId: 'author', audience: 'PRIVATE', deletedAt: null },
    { id: 'fol', userId: 'author', audience: 'FOLLOWERS', deletedAt: null },
    { id: 'fol-friend', userId: 'friend', audience: 'FOLLOWERS', deletedAt: null },
    { id: 'circle', userId: 'author', audience: 'CIRCLE', deletedAt: null },
    { id: 'gone', userId: 'author', audience: 'PUBLIC', deletedAt: new Date() },
    { id: 'blocked-post', userId: 'blocked', audience: 'PUBLIC', deletedAt: null },
  ];
});

describe('repost visibility', () => {
  it('reposts a post the viewer can see', async () => {
    expect((await repost('pub')).status).toBe(200);
    expect((await repost('fol-friend')).status).toBe(200);
  });

  it.each(['priv', 'fol', 'circle', 'gone', 'blocked-post', 'missing'])(
    '404s and writes nothing for %s',
    async (id) => {
      h.created.length = 0;
      expect((await repost(id)).status).toBe(404);
      expect(h.created).toHaveLength(0);
    },
  );
});
