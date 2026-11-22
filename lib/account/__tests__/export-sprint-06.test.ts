/**
 * The data export carries the `sprint06` key: the object the Sprint 06 features
 * add their personal-data sections to, built by `exportSprint06`
 * (lib/account/export-sprint-06.server.ts).
 */
import { describe, expect, it, vi } from 'vitest';

const emptyModel = new Proxy(
  {},
  {
    get: (_t, method: string) => vi.fn(async () => (method === 'findUnique' || method === 'findFirst' ? null : [])),
  },
);

vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy(
    {},
    {
      get: () => emptyModel,
    },
  ),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: 'u1',
        },
        session: {
          id: 's1',
          userId: 'u1',
        },
      })),
    },
  },
}));

vi.mock('@/lib/rmhvibe/account-data.server', () => ({
  exportVibeData: vi.fn(async () => ({})),
}));
vi.mock('@/lib/rmhmusic/learn/account-data.server', () => ({
  exportMusicData: vi.fn(async () => ({})),
}));
vi.mock('@/lib/listings/listings.server', () => ({
  cardListingsForExport: vi.fn(async () => []),
}));

const { route } = await import('@/lib/account/api/account.export.server');

describe('account export: sprint 06 data', () => {
  it('carries the sprint06 key, built for the caller only', async () => {
    const request = new Request('https://rmhstudios.com/api/account/export', {
      headers: {
        cookie: 'better-auth.session_token=t',
        'x-forwarded-for': '203.0.113.9',
      },
    });
    const res = await route.handlers.GET!({
      request,
      params: {},
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('sprint06');
    // Each feature adds one property; s06-01 contributes the member's own community sanctions (none here).
    expect(body.sprint06).toMatchObject({
      communitySanctions: [],
      groupInvites: expect.anything(),
      jamFeedback: expect.anything(),
      feedback: expect.anything(),
      eventUpdates: [],
      buildComments: expect.anything(),
      matchResults: expect.anything(),
    });
  });
});
