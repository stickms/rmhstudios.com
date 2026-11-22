/**
 * The data export (`GET /api/account/export`) carries the co-host roles a member holds or was invited to
 * (s05-05), read for the caller only. A table missing from the export is personal data the person cannot
 * see, which is why this is a main-suite test.
 */
import { describe, expect, it, vi } from 'vitest';

const findMany = vi.hoisted(() =>
  vi.fn(async (_args: unknown) => [
    {
      eventId: 'e1',
      status: 'accepted',
      invitedAt: new Date('2026-11-01T10:00:00Z'),
      respondedAt: new Date('2026-11-02T10:00:00Z'),
      event: { title: 'Game night', startsAt: new Date('2026-12-01T19:00:00Z') },
    },
    {
      eventId: 'e2',
      status: 'invited',
      invitedAt: new Date('2026-11-03T10:00:00Z'),
      respondedAt: null,
      event: { title: 'Build day', startsAt: new Date('2026-12-05T19:00:00Z') },
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
  prisma: new Proxy({}, { get: (_t, model: string) => (model === 'eventCohost' ? { findMany } : emptyModel) }),
}));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: 'u1' }, session: { id: 's1', userId: 'u1' } })) } },
}));
vi.mock('@/lib/rmhvibe/account-data.server', () => ({ exportVibeData: vi.fn(async () => ({})) }));
vi.mock('@/lib/rmhmusic/learn/account-data.server', () => ({ exportMusicData: vi.fn(async () => ({})) }));
vi.mock('@/lib/listings/listings.server', () => ({ cardListingsForExport: vi.fn(async () => []) }));

const { route } = await import('@/lib/account/api/account.export.server');

describe('account export: event co-host roles', () => {
  it('lists the caller’s co-host roles, invited and accepted, with the event named', async () => {
    const request = new Request('https://rmhstudios.com/api/account/export', {
      headers: { cookie: 'better-auth.session_token=t', 'x-forwarded-for': '203.0.113.10' },
    });
    const res = await route.handlers.GET!({ request, params: {} });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { eventCohosts: Record<string, unknown>[] };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }));
    expect(body.eventCohosts).toEqual([
      {
        eventId: 'e1',
        title: 'Game night',
        startsAt: '2026-12-01T19:00:00.000Z',
        status: 'accepted',
        invitedAt: '2026-11-01T10:00:00.000Z',
        respondedAt: '2026-11-02T10:00:00.000Z',
      },
      {
        eventId: 'e2',
        title: 'Build day',
        startsAt: '2026-12-05T19:00:00.000Z',
        status: 'invited',
        invitedAt: '2026-11-03T10:00:00.000Z',
        respondedAt: null,
      },
    ]);
  });
});
