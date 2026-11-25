/**
 * The data export carries the `sprint12` key: the object the Sprint 12 features
 * add their personal-data sections to, built by `exportSprint12`
 * (lib/account/export-sprint-12.server.ts).
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

describe('account export: sprint 12 data', () => {
  it('carries the sprint12 key, an object features fill in', async () => {
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
    expect(body).toHaveProperty('sprint12');
    // Features add their own keys under their anchors; each enables its own expectation here.
    expect(body.sprint12).toMatchObject({
      // s12-01 party-rolls
      partyRolls: [],
      // s12-08 deck-ratings
      deckRatings: [],
      // s12-10 homes-compare
      savedHomes: [],
    });
  });
});
