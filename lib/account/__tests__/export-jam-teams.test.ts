/**
 * The data export (`GET /api/account/export`) carries the jam team invitations and credits (s05-15), read for the caller only. A table missing from the export is personal data the person cannot
 * see, which is why this is a main-suite test.
 */
import { describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() =>
  vi.fn(async (_args: unknown) => [
    {
      entryId: 'e1',
      status: 'accepted',
      invitedAt: new Date('2026-11-01T10:00:00Z'),
      respondedAt: new Date('2026-11-02T10:00:00Z'),
      entry: { build: { title: 'Game night' }, jam: { title: 'Jam A' } },
    },
    {
      entryId: 'e2',
      status: 'invited',
      invitedAt: new Date('2026-11-03T10:00:00Z'),
      respondedAt: null,
      entry: { build: { title: 'Build day' }, jam: { title: 'Jam B' } },
    },
  ]),
);

const emptyModel = new Proxy(
  {},
  {
    get: (_t, method: string) => vi.fn(async () => (method === 'findUnique' || method === 'findFirst' ? null : [])),
  },
);

vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy({}, { get: (_t, model: string) => (model === 'gameJamTeamMember' ? { findMany } : emptyModel) }),
}));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: 'u1' }, session: { id: 's1', userId: 'u1' } })) } },
}));
vi.mock('@/lib/rmhvibe/account-data.server', () => ({ exportVibeData: vi.fn(async () => ({})) }));
vi.mock('@/lib/rmhmusic/learn/account-data.server', () => ({ exportMusicData: vi.fn(async () => ({})) }));
vi.mock('@/lib/listings/listings.server', () => ({ cardListingsForExport: vi.fn(async () => []) }));

const { route } = await import('@/lib/account/api/account.export.server');

describe('account export: game jam teams', () => {
  it('lists the caller’s jam team memberships, invited and accepted, with the jam named', async () => {
    const request = new Request('https://rmhstudios.com/api/account/export', {
      headers: { cookie: 'better-auth.session_token=t', 'x-forwarded-for': '203.0.113.10' },
    });
    const res = await route.handlers.GET!({ request, params: {} });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jamTeams: Record<string, unknown>[] };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }));
    expect(body.jamTeams).toEqual([
      {
        entryId: 'e1',
        entryTitle: 'Game night',
        jamTitle: 'Jam A',
        status: 'accepted',
        invitedAt: '2026-11-01T10:00:00.000Z',
        respondedAt: '2026-11-02T10:00:00.000Z',
      },
      {
        entryId: 'e2',
        entryTitle: 'Build day',
        jamTitle: 'Jam B',
        status: 'invited',
        invitedAt: '2026-11-03T10:00:00.000Z',
        respondedAt: null,
      },
    ]);
  });
});
