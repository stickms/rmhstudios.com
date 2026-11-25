/**
 * s14-17: a moderator's timeout holds for a developer API key. `POST /api/v1/posts` checks `post` and
 * `POST /api/v1/posts/{id}/comments` checks `comment`; both answer 403 `feature_restricted` in the developer
 * envelope before anything is written, and a member who is not timed out posts as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { ERROR_TYPES } from '@/lib/api/errors';

const h = vi.hoisted(() => ({
  rows: [] as { userId: string; feature: string; expiresAt: Date | null }[],
  createPost: vi.fn(),
  createComment: vi.fn(),
}));

vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked({
    featureRestriction: {
      findMany: async (args: { where: { userId: string } }) =>
        h.rows
          .filter((r) => r.userId === args.where.userId && (r.expiresAt === null || r.expiresAt > new Date()))
          .map((r) => ({ feature: r.feature, expiresAt: r.expiresAt })),
    },
    rMHark: { findUnique: async () => ({ communityId: null, audience: 'PUBLIC', userId: 'u2', deletedAt: null }) },
  }),
}));
vi.mock('@/lib/cached.server', () => ({
  cached: (_k: string, _ttl: number, load: () => Promise<unknown>) => load(),
  invalidateCached: async () => undefined,
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: async () => undefined }));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: async () => undefined }));
// The developer wrapper's own work (keys, quotas) is not under test: it hands the handler its context.
vi.mock('@/lib/api/with-developer-api.server', () => ({
  apiOptions: () => new Response(null, { status: 204 }),
  withDeveloperApi: async (request: Request, fn: (ctx: unknown) => Promise<Response>): Promise<Response> =>
    fn({
      userId: 'u1',
      scopes: ['write:posts', 'write:comments'],
      requestId: 'req_test',
      request,
      json: (data: unknown, status = 200) => Response.json(data, { status }),
      error: (code: string, message: string, status = 400) =>
        Response.json(
          { error: { type: ERROR_TYPES[code] ?? 'api_error', code, message, request_id: 'req_test' } },
          { status },
        ),
    }),
}));
vi.mock('@/lib/social/engagement.server', () => ({ createPost: h.createPost, createComment: h.createComment }));
vi.mock('@/lib/api/v1/communities.server', () => ({ createCommunityPostForKey: vi.fn() }));
vi.mock('@/lib/feed/profile-pins.server', () => ({ pinnedOrderFor: vi.fn(async () => new Map()) }));
vi.mock('@/lib/feed/audience.server', () => ({ canReadThread: vi.fn(async () => true) }));
vi.mock('@/lib/communities/bans.server', () => ({ activeSanction: vi.fn(async () => null) }));

import { Route as PostsRoute } from '../../../app/routes/api/v1/posts';
import { Route as CommentsRoute } from '../../../app/routes/api/v1/posts/$id/comments';
import { clearRestrictionCache } from '@/lib/moderation/restrictions-core';

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const posts = handlersOf<Handler>(PostsRoute);
const comments = handlersOf<Handler>(CommentsRoute);

const send = (path: string, body: unknown) =>
  new Request(`https://x.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  h.rows = [];
  clearRestrictionCache();
  h.createPost.mockReset();
  h.createComment.mockReset();
});

describe('POST /api/v1/posts', () => {
  it('answers 403 feature_restricted for a member timed out of posting, and writes nothing', async () => {
    h.rows = [{ userId: 'u1', feature: 'post', expiresAt: new Date(Date.now() + DAY) }];
    const res = await posts.POST!({ request: send('/api/v1/posts', { content: 'hi' }), params: {} });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { type: string; code: string; message: string } };
    assertJsonSafe(body);
    expect(body.error).toMatchObject({ type: 'authorization_error', code: 'feature_restricted' });
    expect(body.error.message).toContain('restricted on your account until');
    expect(h.createPost).not.toHaveBeenCalled();
  });

  it('is not stopped by a timeout on replying', async () => {
    h.rows = [{ userId: 'u1', feature: 'comment', expiresAt: null }];
    h.createPost.mockResolvedValue({ id: 'p1', content: 'hi', audience: 'PUBLIC', createdAt: new Date(0) });
    const res = await posts.POST!({ request: send('/api/v1/posts', { content: 'hi' }), params: {} });
    expect(res.status).not.toBe(403);
    expect(h.createPost).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/v1/posts/{id}/comments', () => {
  it('answers 403 feature_restricted for a member timed out of replying, and writes nothing', async () => {
    h.rows = [{ userId: 'u1', feature: 'comment', expiresAt: null }];
    const res = await comments.POST!({
      request: send('/api/v1/posts/p1/comments', { content: 'hi' }),
      params: { id: 'p1' },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('feature_restricted');
    expect(body.error.message).toBe('This is restricted on your account. See Settings, Account status');
    expect(h.createComment).not.toHaveBeenCalled();
  });

  it('is not stopped by a timeout on posting', async () => {
    h.rows = [{ userId: 'u1', feature: 'post', expiresAt: null }];
    h.createComment.mockResolvedValue({ found: false, comment: null });
    const res = await comments.POST!({
      request: send('/api/v1/posts/p1/comments', { content: 'hi' }),
      params: { id: 'p1' },
    });
    expect(res.status).toBe(404);
    expect(h.createComment).toHaveBeenCalledTimes(1);
  });
});
