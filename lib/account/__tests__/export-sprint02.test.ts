/**
 * The data export (`GET /api/account/export`) carries what sprint 02 stores
 * about a member: decks and their cards, review and test history, typing
 * lessons and daily runs, the security log, reading subscriptions, cloud saves
 * and their snapshots, keyboard preferences, tracked achievements and the
 * member's own follow actions. A table missing from the export is personal data
 * the person cannot see, which is why this is a main-suite test.
 *
 * It also holds the one privacy line in that set: follow events are exported
 * only where the member is the one who acted, never the events that would name
 * who unfollowed them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const followEventFindMany = vi.fn(async (_args: unknown) => [{ followingId: 'u2', kind: 'follow', createdAt: new Date(0) }]);

// Any model, any method: an empty list (or null for a single-row read).
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
    {
      get: (_t, model: string) => {
        if (model === 'followEvent') return { findMany: followEventFindMany };
        if (model === 'flashcardDeck')
          return { findMany: vi.fn(async () => [{ id: 'd1', title: 'Verbs', cards: [{ id: 'c1', front: 'a', back: 'b', position: 0 }] }]) };
        return emptyModel;
      },
    },
  ),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: 'u1' }, session: { id: 's1', userId: 'u1' } })) } },
}));

vi.mock('@/lib/rmhvibe/account-data.server', () => ({ exportVibeData: vi.fn(async () => ({})) }));
vi.mock('@/lib/rmhmusic/learn/account-data.server', () => ({ exportMusicData: vi.fn(async () => ({})) }));
vi.mock('@/lib/listings/listings.server', () => ({ cardListingsForExport: vi.fn(async () => []) }));
vi.mock('@/lib/study/stats.server', () => ({ exportStudyStatsData: vi.fn(async () => ({ reviewLog: [{ id: 1 }] })) }));
vi.mock('@/lib/study/tests.server', () => ({ exportStudyTestData: vi.fn(async () => ({ testResults: [{ id: 2 }] })) }));
vi.mock('@/lib/rmhtype/lessons.server', () => ({ exportLessonProgress: vi.fn(async () => [{ lessonId: 'home-fj' }]) }));
vi.mock('@/lib/auth/security-log.server', () => ({ exportSecurityEvents: vi.fn(async () => [{ kind: 'sign_in' }]) }));
vi.mock('@/lib/reading/subscriptions.server', () => ({
  exportReadingSubscriptions: vi.fn(async () => ({ subscriptions: [{ kind: 'blog' }] })),
}));
vi.mock('@/lib/game-saves/snapshots.server', () => ({ exportCloudSaveSnapshots: vi.fn(async () => [{ id: '3' }]) }));

const { route } = await import('@/lib/account/api/account.export.server');

async function runExport(): Promise<Record<string, unknown>> {
  const handler = route.handlers.GET;
  const request = new Request('https://rmhstudios.com/api/account/export', {
    headers: { cookie: 'better-auth.session_token=t', 'x-forwarded-for': '203.0.113.9' },
  });
  const res = await handler!({ request, params: {} });
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

describe('account export: sprint 02 data', () => {
  beforeEach(() => followEventFindMany.mockClear());

  it('includes every sprint 02 personal-data section', async () => {
    const body = await runExport();
    expect(body.flashcards).toMatchObject({
      decks: [{ id: 'd1', cards: [{ front: 'a', back: 'b' }] }],
      reviewLog: [{ id: 1 }],
      testResults: [{ id: 2 }],
    });
    expect(body.rmhType).toMatchObject({ lessons: [{ lessonId: 'home-fj' }], daily: [] });
    expect(body.securityEvents).toEqual([{ kind: 'sign_in' }]);
    expect(body.readingSubscriptions).toEqual({ subscriptions: [{ kind: 'blog' }] });
    expect(body.cloudSaves).toEqual({ saves: [], snapshots: [{ id: '3' }] });
    for (const key of ['keyboardPreference', 'achievementTracks', 'followEvents', 'rmhStudy']) {
      expect(body).toHaveProperty(key);
    }
  });

  it('exports only follow events the member made, never who unfollowed them', async () => {
    const body = await runExport();
    expect(followEventFindMany).toHaveBeenCalledTimes(1);
    const args = followEventFindMany.mock.calls[0]![0] as { where: Record<string, unknown>; select: Record<string, unknown> };
    expect(args.where).toEqual({ followerId: 'u1' });
    expect(args.select).not.toHaveProperty('followerId');
    expect(body.followEvents).toEqual([{ followingId: 'u2', kind: 'follow', createdAt: new Date(0).toISOString() }]);
  });
});
