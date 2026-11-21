/**
 * The data export (`GET /api/account/export`) carries what sprint 04 stores about
 * a member: replays they saved, their synced library places, bookmarks and notes,
 * their RMHBox host presets, the message requests they sent or received, and the
 * new settings on their profile and play-limits rows (who may see their follow
 * lists, message requests, hidden counts, the monthly spending budget). A table or
 * column missing from the export is personal data the person cannot see, which is
 * why this is a main-suite test.
 */
import { describe, expect, it, vi } from 'vitest';

const profileRow = {
  userId: 'u1',
  followListVisibility: 'mutuals',
  dmRequests: true,
  hideCountsOnMine: true,
  hideCountsInFeed: false,
};
const playLimitsRow = {
  userId: 'u1',
  monthlySpendCap: 2000,
  pendingSpendCap: 5000,
  pendingSpendCapAt: '2026-11-25T12:00:00.000Z',
  spendNoticeMonth: '2026-11',
};

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
        if (model === 'userProfile') return { findUnique: vi.fn(async () => profileRow) };
        if (model === 'userPlayLimits') return { findUnique: vi.fn(async () => playLimitsRow) };
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
const exportReplays = vi.fn(async (_u: string) => [{ id: 'rp1', game: 'lights-out' }]);
const exportReaderMarks = vi.fn(async (_u: string) => [{ docSlug: 'book', kind: 'bookmark', page: 3 }]);
const exportRmhboxPresets = vi.fn(async (_u: string) => [{ minigameId: 'rhyme-time', name: 'Quick round' }]);
const exportMessageRequests = vi.fn(async (_u: string) => [{ direction: 'received', status: 'pending' }]);
vi.mock('@/lib/replays.server', () => ({ exportReplays }));
vi.mock('@/lib/library/reader-sync.server', () => ({ exportReaderMarks }));
vi.mock('@/lib/rmhbox/presets.server', () => ({ exportRmhboxPresets }));
vi.mock('@/lib/messages/requests.server', () => ({ exportMessageRequests }));

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

describe('account export: sprint 04 data', () => {
  it('includes every sprint 04 personal-data section, for the caller only', async () => {
    const body = await runExport();
    expect(body.replays).toEqual([{ id: 'rp1', game: 'lights-out' }]);
    expect(body.libraryReaderMarks).toEqual([{ docSlug: 'book', kind: 'bookmark', page: 3 }]);
    expect(body.rmhboxPresets).toEqual([{ minigameId: 'rhyme-time', name: 'Quick round' }]);
    expect(body.messageRequests).toEqual([{ direction: 'received', status: 'pending' }]);
    for (const fn of [exportReplays, exportReaderMarks, exportRmhboxPresets, exportMessageRequests]) {
      expect(fn).toHaveBeenCalledWith('u1');
    }
  });

  it('carries the new profile and play-limits settings', async () => {
    const body = await runExport();
    expect(body.profile).toMatchObject({
      followListVisibility: 'mutuals',
      dmRequests: true,
      hideCountsOnMine: true,
      hideCountsInFeed: false,
    });
    expect(body.playLimits).toMatchObject({ monthlySpendCap: 2000, pendingSpendCap: 5000, spendNoticeMonth: '2026-11' });
  });
});
