/**
 * The data export carries the `sprint11` key: the object the Sprint 11 features
 * add their personal-data sections to, built by `exportSprint11`
 * (lib/account/export-sprint-11.server.ts).
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

describe('account export: sprint 10 data', () => {
  it('carries the sprint11 key, an object features fill in', async () => {
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
    expect(body).toHaveProperty('sprint11');
    // Features add their own keys under their anchors; each pins its own here.
    expect(body.sprint11).toMatchObject({
      // s11-03 character-party
      characterParties: { partiesRun: [], memberships: [] },
      // s11-05 lights-out-maker
      lightsOutBoards: { boards: [], plays: [] },
      // s11-07 studio-share
      studioShares: [],
      // s11-09 read-alongs
      readAlongs: { started: [], readers: [] },
      // s11-10 deck-coeditors
      deckEditors: { editing: [], invitationsSent: [] },
      // s11-12 type-challenges
      typeChallenges: { challenges: [] },
      // s11-16 rmhtube-subtitles
      rmhtubeSubtitles: [],
    });
  });
});
