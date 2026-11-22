import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

// A ban, an unban and an account deletion change who may be on a Daily board (banned and deleted
// learners never are), so each drops the boards of today and yesterday and the learner's friends
// list at once instead of leaving them on (or off) every board for the cache's lifetime.
const h = vi.hoisted(() => ({
  drop: vi.fn(async (_userId: string, _now: number) => {}),
  session: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  tx: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock('@/lib/rmhmusic/learn/social/board-cache.server', () => ({
  dropLearnerBoardCaches: h.drop,
}));
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: h.session,
    },
  },
}));
vi.mock('@/lib/admin-audit.server', () => ({
  logAdminAction: vi.fn(async () => {}),
}));
vi.mock('@/lib/rate-limit.server', () => ({
  withRateLimitAsync: async () => null,
}));
vi.mock('@/lib/prisma.server', () => {
  // Any other model or method answers a harmless empty value.
  const any = (): unknown =>
    new Proxy(() => {}, {
      get: (_t, k) => (k === 'then' ? undefined : any()),
      apply: () =>
        Promise.resolve({
          count: 0,
        }),
    });
  const prisma = new Proxy(
    {
      user: {
        findUnique: h.findUnique,
        updateMany: h.updateMany,
        update: () => ({}),
      },
      session: {
        deleteMany: () =>
          Promise.resolve({
            count: 0,
          }),
      },
      $transaction: h.tx,
    } as Record<string, unknown>,
    {
      get: (t, k: string) => (k in t ? t[k] : any()),
    },
  );
  return {
    prisma,
  };
});

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { route as banRoute } from '@/lib/admin/api/admin.users.$id.ban.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const ban = handlersOf<Handler>(banRoute).POST!;
const request = (body: unknown) =>
  new Request('https://rmhstudios.com/api/admin/users/u1/ban', {
    method: 'POST',
    headers: {
      cookie: 'better-auth.session_token=abc',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.session.mockResolvedValue({
    user: {
      id: 'admin',
      isAdmin: true,
    },
  });
  h.findUnique.mockResolvedValue({
    id: 'u1',
    isAdmin: false,
    banReason: null,
  });
  h.updateMany.mockResolvedValue({
    count: 1,
  });
});

describe('a change of standing drops the Daily board caches', () => {
  it('a ban', async () => {
    const res = await ban({
      request: request({
        reason: 'spam',
      }),
      params: {
        id: 'u1',
      },
    });
    expect(res.status).toBe(200);
    expect(h.drop).toHaveBeenCalledWith('u1', expect.any(Number));
  });

  it('an unban', async () => {
    const res = await ban({
      request: request({
        unban: true,
      }),
      params: {
        id: 'u1',
      },
    });
    expect(res.status).toBe(200);
    expect(h.drop).toHaveBeenCalledWith('u1', expect.any(Number));
  });

  it('a ban that changed nothing (a tombstone) drops nothing', async () => {
    h.updateMany.mockResolvedValue({
      count: 0,
    });
    await ban({
      request: request({
        reason: 'spam',
      }),
      params: {
        id: 'u1',
      },
    });
    expect(h.drop).not.toHaveBeenCalled();
  });

  it('an account deletion, after the anonymising transaction', async () => {
    await anonymizeAccount('u1');
    expect(h.tx).toHaveBeenCalledTimes(1);
    expect(h.drop).toHaveBeenCalledWith('u1', expect.any(Number));
  });
});
