/**
 * The data export (`GET /api/account/export`) carries the member's personal best history (s05-04),
 * read for the caller only. A table missing from the export is personal data the person cannot see.
 */
import { describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() =>
  vi.fn(async (_args: unknown) => [
    {
      gameId: 'snake',
      score: 120,
      previous: null,
      progress: 3,
      createdAt: new Date('2026-11-01T10:00:00Z'),
    },
    {
      gameId: 'snake',
      score: 200,
      previous: 120,
      progress: null,
      createdAt: new Date('2026-11-02T10:00:00Z'),
    },
  ]),
);

const emptyModel = new Proxy(
  {},
  {
    get: (_t, method: string) =>
      vi.fn(async () => (method === 'findUnique' || method === 'findFirst' ? null : [])),
  },
);

vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy(
    {},
    { get: (_t, model: string) => (model === 'gamePersonalBest' ? { findMany } : emptyModel) },
  ),
}));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: 'u1' }, session: { id: 's1', userId: 'u1' } })) } },
}));
vi.mock('@/lib/rmhvibe/account-data.server', () => ({ exportVibeData: vi.fn(async () => ({})) }));
vi.mock('@/lib/rmhmusic/learn/account-data.server', () => ({ exportMusicData: vi.fn(async () => ({})) }));
vi.mock('@/lib/listings/listings.server', () => ({ cardListingsForExport: vi.fn(async () => []) }));

const { route } = await import('@/lib/account/api/account.export.server');

describe('account export: personal best history', () => {
  it('lists the caller’s records with the score before each', async () => {
    const request = new Request('https://rmhstudios.com/api/account/export', {
      headers: { cookie: 'better-auth.session_token=t', 'x-forwarded-for': '203.0.113.11' },
    });
    const res = await route.handlers.GET!({ request, params: {} });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { personalBests: Record<string, unknown>[] };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }));
    expect(body.personalBests).toEqual([
      { gameId: 'snake', score: 120, previous: null, progress: 3, createdAt: '2026-11-01T10:00:00.000Z' },
      { gameId: 'snake', score: 200, previous: 120, progress: null, createdAt: '2026-11-02T10:00:00.000Z' },
    ]);
  });
});
