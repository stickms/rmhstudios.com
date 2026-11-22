/**
 * The data export carries the member's flashcard reminder setting (s05-20). A table missing from the export
 * is personal data the person cannot see, which is why this is a main-suite test.
 */
import { describe, expect, it, vi } from 'vitest';

const reminderRow = {
  userId: 'u1',
  enabled: true,
  localTime: '18:15',
  timeZone: 'Europe/London',
  paused: false,
  sentSinceReview: 3,
  updatedAt: new Date('2026-11-21T12:00:00Z'),
};
const findReminder = vi.fn(async (_a: unknown) => reminderRow);

const findDecks = vi.fn(async (_a: unknown) => []);

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
      get: (_t, model: string) =>
        model === 'flashcardReminder'
          ? { findUnique: findReminder }
          : model === 'flashcardDeck'
            ? { findMany: findDecks }
            : emptyModel,
    },
  ),
}));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: 'u1' }, session: { id: 's1', userId: 'u1' } })) } },
}));
vi.mock('@/lib/rmhvibe/account-data.server', () => ({ exportVibeData: vi.fn(async () => ({})) }));
vi.mock('@/lib/rmhmusic/learn/account-data.server', () => ({ exportMusicData: vi.fn(async () => ({})) }));
vi.mock('@/lib/listings/listings.server', () => ({ cardListingsForExport: vi.fn(async () => []) }));

const { route } = await import('@/lib/account/api/account.export.server');

describe('account export: flashcard reminder', () => {
  it('includes the caller reminder setting under flashcards.reminder', async () => {
    const request = new Request('https://rmhstudios.com/api/account/export', {
      headers: { cookie: 'better-auth.session_token=t', 'x-forwarded-for': '203.0.113.9' },
    });
    const res = await route.handlers.GET!({ request, params: {} });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { flashcards: { reminder: unknown } };
    expect(body.flashcards.reminder).toEqual({
      enabled: true,
      time: '18:15',
      timeZone: 'Europe/London',
      paused: false,
      remindersSinceLastReview: 3,
      updatedAt: '2026-11-21T12:00:00.000Z',
    });
    expect(findReminder).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('exports each authored card with its externalId', async () => {
    findDecks.mockClear();
    const request = new Request('https://rmhstudios.com/api/account/export', {
      headers: { cookie: 'better-auth.session_token=t', 'x-forwarded-for': '203.0.113.9' },
    });
    await route.handlers.GET!({ request, params: {} });
    const args = findDecks.mock.calls[0]?.[0] as {
      include: { cards: { where: unknown; select: Record<string, boolean> } };
    };
    expect(args.include.cards.where).toEqual({ sourceId: null });
    expect(args.include.cards.select.externalId).toBe(true);
  });
});
