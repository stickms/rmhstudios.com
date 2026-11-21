/**
 * The data export (`GET /api/account/export`) carries the member's post alert choices (s05-17),
 * read for the caller only. A table missing from the export is personal data the person cannot see.
 */
import { describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() =>
  vi.fn(async (_args: unknown) => [
    { communityId: 'c1', community: { name: 'Quiet Group' } },
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
    { get: (_t, model: string) => (model === 'communityMember' ? { findMany } : emptyModel) },
  ),
}));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: 'u1' }, session: { id: 's1', userId: 'u1' } })) } },
}));
vi.mock('@/lib/rmhvibe/account-data.server', () => ({ exportVibeData: vi.fn(async () => ({})) }));
vi.mock('@/lib/rmhmusic/learn/account-data.server', () => ({ exportMusicData: vi.fn(async () => ({})) }));
vi.mock('@/lib/listings/listings.server', () => ({ cardListingsForExport: vi.fn(async () => []) }));

const { route } = await import('@/lib/account/api/account.export.server');

describe('account export: community post alerts', () => {
  it('lists the communities the caller asked to be alerted for', async () => {
    const request = new Request('https://rmhstudios.com/api/account/export', {
      headers: { cookie: 'better-auth.session_token=t', 'x-forwarded-for': '203.0.113.12' },
    });
    const res = await route.handlers.GET!({ request, params: {} });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { postAlerts: Record<string, unknown>[] };
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', postAlerts: 'all' } }),
    );
    expect(body.postAlerts).toEqual([{ communityId: 'c1', communityName: 'Quiet Group', level: 'all' }]);
  });
});
