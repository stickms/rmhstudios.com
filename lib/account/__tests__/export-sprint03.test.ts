/**
 * The data export (`GET /api/account/export`) carries what sprint 03 stores
 * about a member: the reports they made, messages they scheduled, offers they
 * recorded in RMHLadder, watch parties they said they would join, the games
 * they follow and their per-conversation notification choices (muted posts
 * included). A table missing from the export is personal data the person cannot
 * see, which is why this is a main-suite test.
 *
 * It also holds the one line in the other direction: moderator notes about a
 * member are the site's records, not the member's, and never reach the export.
 */
import { describe, expect, it, vi } from 'vitest';

const touchedModels = new Set<string>();
const conversationPrefFindMany = vi.fn(async (_args: unknown) => [{ scopeKey: 'post:p1', mentionsOnly: true }]);

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
      get: (_t, model: string) => {
        touchedModels.add(model);
        if (model === 'conversationPref') return { findMany: conversationPrefFindMany };
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
vi.mock('@/lib/moderation/my-reports.server', () => ({ exportMyReports: vi.fn(async () => [{ id: 'r1' }]) }));
vi.mock('@/lib/messages/scheduled.server', () => ({ exportScheduledMessages: vi.fn(async () => [{ id: 'm1' }]) }));
vi.mock('@/lib/rmhladder/offers.server', () => ({ exportLadderOffers: vi.fn(async () => [{ id: 'o1' }]) }));
vi.mock('@/lib/rmhtube/parties.server', () => ({ exportWatchPartyRsvps: vi.fn(async () => [{ roomId: 'ABC123' }]) }));
vi.mock('@/lib/events/waitlist.server', () => ({
  exportEventRsvps: vi.fn(async () => [{ eventId: 'e1', status: 'waitlist' }]),
}));
vi.mock('@/lib/arcade/updates.server', () => ({ exportGameFollows: vi.fn(async () => [{ gameId: 'altair' }]) }));

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

describe('account export: sprint 03 data', () => {
  it('includes every sprint 03 personal-data section', async () => {
    const body = await runExport();
    expect(body.reportsMade).toEqual([{ id: 'r1' }]);
    expect(body.scheduledMessages).toEqual([{ id: 'm1' }]);
    expect(body.watchPartyRsvps).toEqual([{ roomId: 'ABC123' }]);
    expect(body.eventRsvps).toEqual([{ eventId: 'e1', status: 'waitlist' }]);
    expect(body.gameFollows).toEqual([{ gameId: 'altair' }]);
    expect(body.rmhLadder).toMatchObject({ offers: [{ id: 'o1' }] });
    expect(body.conversationPrefs).toEqual([{ scopeKey: 'post:p1', mentionsOnly: true }]);
    const args = conversationPrefFindMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(args.where).toEqual({ userId: 'u1' });
  });

  it('never reads moderator notes about the member', async () => {
    touchedModels.clear();
    const body = await runExport();
    expect(touchedModels.has('moderatorNote')).toBe(false);
    expect(JSON.stringify(body)).not.toContain('moderatorNote');
  });
});
