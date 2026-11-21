/**
 * The data export (`GET /api/account/export`) carries the member's RMH Studio projects saved to the account
 * (s05-06), project data included, read for the caller only.
 */
import { describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() =>
  vi.fn(async (_args: unknown) => [
    {
      id: 'p1',
      name: 'Night drive',
      sizeBytes: 42,
      revision: 3,
      updatedAt: new Date('2026-11-02T10:00:00Z'),
      createdAt: new Date('2026-11-01T10:00:00Z'),
      data: { bpm: 120 },
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
  prisma: new Proxy({}, { get: (_t, model: string) => (model === 'studioProject' ? { findMany } : emptyModel) }),
}));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: 'u1' }, session: { id: 's1', userId: 'u1' } })) } },
}));
vi.mock('@/lib/rmhvibe/account-data.server', () => ({ exportVibeData: vi.fn(async () => ({})) }));
vi.mock('@/lib/rmhmusic/learn/account-data.server', () => ({ exportMusicData: vi.fn(async () => ({})) }));
vi.mock('@/lib/listings/listings.server', () => ({ cardListingsForExport: vi.fn(async () => []) }));

const { route } = await import('@/lib/account/api/account.export.server');

describe('account export: studio projects', () => {
  it('lists the caller’s cloud projects with their data', async () => {
    const request = new Request('https://rmhstudios.com/api/account/export', {
      headers: { cookie: 'better-auth.session_token=t', 'x-forwarded-for': '203.0.113.12' },
    });
    const res = await route.handlers.GET!({ request, params: {} });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { studioProjects: Record<string, unknown>[] };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }));
    expect(body.studioProjects).toEqual([
      {
        id: 'p1',
        name: 'Night drive',
        sizeBytes: 42,
        revision: 3,
        updatedAt: '2026-11-02T10:00:00.000Z',
        createdAt: '2026-11-01T10:00:00.000Z',
        data: { bpm: 120 },
      },
    ]);
  });
});
