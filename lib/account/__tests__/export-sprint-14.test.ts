/**
 * The data export carries the `sprint14` key: the object the Sprint 14 features
 * add their personal-data sections to, built by `exportSprint14`
 * (lib/account/export-sprint-14.server.ts).
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

describe('account export: sprint 14 data', () => {
  it('carries the sprint14 key, an object features fill in', async () => {
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
    expect(body).toHaveProperty('sprint14');
    // Features add their own keys under their anchors; each enables its own expectation here
    // (uncomment the line under its anchor and give the empty value its export returns).
    expect(body.sprint14).toMatchObject({
      // s14-03 synapse-matches
      synapseMatches: [],
      // s14-04 altair-coop
      altairCoop: { runs: 0, wins: 0, favouriteClass: null },
      // s14-05 doctrine-ledger
      doctrineReputation: { ledger: [] },
      // s14-06 puzzle-reports
      puzzleReports: [],
    });
  });
});
