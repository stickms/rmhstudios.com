/**
 * The data export carries the `sprint13` key: the object the Sprint 13 features
 * add their personal-data sections to, built by `exportSprint13`
 * (lib/account/export-sprint-13.server.ts).
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

describe('account export: sprint 13 data', () => {
  it('carries the sprint13 key, an object features fill in', async () => {
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
    expect(body).toHaveProperty('sprint13');
    // Features add their own keys under their anchors; each enables its own expectation here
    // (uncomment the line under its anchor and give the empty value its export returns).
    expect(body.sprint13).toMatchObject({
      // s13-03 altair-runs
      altairRuns: { soloRuns: [], coopMatches: [] },
      // s13-07 tube-subscriptions
      rmhtubeSubscriptions: [],
      // s13-08 ladder-own-jobs
      ladderOwnJobs: [],
      // s13-11 lists-on
      listsLeft: [],
      // s13-12 news-stories
      newsStoryFollows: [],
      // s13-14 prediction-trades
      predictionPositions: [],
    });
  });
});
