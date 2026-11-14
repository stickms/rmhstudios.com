import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  users: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  ensure: vi.fn(),
  find: vi.fn(),
  tx: vi.fn(),
}));
vi.mock('@/lib/sitewide-announcement.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/sitewide-announcement.server')>()),
  ensureAnnouncementPost: mocks.ensure,
  invalidateCurrentAnnouncement: vi.fn(async () => {}),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    // `findUnique` is the edit path's read of the announcement state; a missing post reads as null.
    blogPost: { create: mocks.create, update: mocks.update, findUnique: mocks.find },
    blogAnnouncementSeen: { deleteMany: vi.fn() },
    $transaction: mocks.tx,
    user: { findMany: mocks.users },
  },
}));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: mocks.audit }));
vi.mock('@/lib/seo/indexnow.server', () => ({ pingIndexNow: vi.fn() }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));

import { route as blogRoute } from '@/lib/admin/api/admin.blog.server';
import { route as usersRoute } from '@/lib/admin/api/admin.users.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const handler = (route: unknown, method: string): Handler =>
  handlersOf<Handler>(route)[
    method
  ];
const post = handler(blogRoute, 'POST');
const patchUser = handler(usersRoute, 'PATCH');
const listUsers = handler(usersRoute, 'GET');
const validPost = {
  title: 'A post',
  slug: 'a-post',
  description: 'Description',
  date: '2026-10-24',
  content: '# Draft',
};
const request = (method: string, body?: unknown, url = 'https://rmhstudios.com/api/admin/blog') =>
  new Request(url, {
    method,
    headers: { cookie: 'better-auth.session_token=abc', 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'admin', isAdmin: true } });
  mocks.create.mockResolvedValue({});
  mocks.update.mockResolvedValue({});
  mocks.find.mockResolvedValue(null);
  mocks.ensure.mockResolvedValue('rmhark-1');
  mocks.tx.mockResolvedValue([]);
});

describe('announcement discussion post on blog save', () => {
  it('creates the discussion post when a new post is announced', async () => {
    mocks.create.mockResolvedValue({ id: 'bp1' });
    const response = await post({ request: request('POST', { ...validPost, announcement: true }), params: {} });
    expect(response.status).toBe(200);
    expect(mocks.ensure).toHaveBeenCalledWith({ blogPostId: 'bp1', authorId: 'admin' });
  });
  it('creates a new one when an edit re-announces, clearing the old link in the same write', async () => {
    mocks.find.mockResolvedValue({ id: 'bp2', announcement: false, announcedAt: new Date() });
    const response = await post({
      request: request('POST', { ...validPost, isEdit: true, announcement: true }),
      params: {},
    });
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ announcementPostId: null }) }),
    );
    expect(mocks.ensure).toHaveBeenCalledWith({ blogPostId: 'bp2', authorId: 'admin' });
  });
  it('does nothing extra on an ordinary save or when the announcement stays on', async () => {
    await post({ request: request('POST', validPost), params: {} });
    mocks.find.mockResolvedValue({ id: 'bp3', announcement: true, announcedAt: new Date() });
    await post({ request: request('POST', { ...validPost, isEdit: true, announcement: true }), params: {} });
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
  it('still saves when the discussion post fails', async () => {
    mocks.create.mockResolvedValue({ id: 'bp1' });
    mocks.ensure.mockRejectedValue(new Error('boom'));
    const response = await post({ request: request('POST', { ...validPost, announcement: true }), params: {} });
    expect(response.status).toBe(200);
    expect(mocks.audit).toHaveBeenCalled();
  });
});

describe('admin mutation boundaries', () => {
  it('checks admin access before parsing malformed JSON', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'member', isAdmin: false } });
    const response = await post({ request: request('POST', '{'), params: {} });
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('returns 400 for malformed JSON and wrong field types', async () => {
    for (const body of ['{', { ...validPost, tags: [123] }, { ...validPost, isEdit: 'false' }]) {
      expect((await post({ request: request('POST', body), params: {} })).status).toBe(400);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('creates atomically and treats a concurrent slug conflict as 409', async () => {
    mocks.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const response = await post({ request: request('POST', validPost), params: {} });
    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('does not recreate a deleted post when editing it', async () => {
    mocks.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'test' }),
    );
    expect(
      (await post({ request: request('POST', { ...validPost, isEdit: true }), params: {} })).status,
    ).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejects invalid user ids, flag types and empty updates before any user query', async () => {
    for (const body of [
      { userId: 3, isAdmin: true },
      { userId: 'u', isAdmin: 'false' },
      { userId: 'u' },
    ]) {
      expect((await patchUser({ request: request('PATCH', body), params: {} })).status).toBe(400);
    }
  });
  it('keeps a deterministic id tie-breaker for admin user pagination', async () => {
    mocks.users.mockResolvedValue([]);
    await listUsers({
      request: request('GET', undefined, 'https://rmhstudios.com/api/admin/users'),
      params: {},
    });
    expect(mocks.users).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    );
  });
});
