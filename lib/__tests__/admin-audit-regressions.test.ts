import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  users: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    blogPost: { create: mocks.create, update: mocks.update },
    user: { findMany: mocks.users },
  },
}));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: mocks.audit }));
vi.mock('@/lib/seo/indexnow.server', () => ({ pingIndexNow: vi.fn() }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));

import { Route as blogRoute } from '@/app/routes/api/admin/blog';
import { Route as usersRoute } from '@/app/routes/api/admin/users';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const handler = (route: unknown, method: string): Handler =>
  (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server.handlers[
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
