import { beforeEach, describe, expect, it, vi } from 'vitest';

// A deck a moderator took down (`moderatedAt` set, `isPublic` false) takes no suggestions, not even from a member who
// holds a copy of it (S12-16). The copy itself is the member's own and is not touched here.

const h = vi.hoisted(() => ({
  deck: null as Record<string, unknown> | null,
  reads: [] as string[],
  notices: [] as unknown[],
  created: [] as unknown[],
}));

vi.mock('@/lib/prisma.server', () => {
  const prisma = {
    flashcardDeck: {
      findUnique: vi.fn(async (_args: unknown) => {
        h.reads.push('deck');
        return h.deck;
      }),
      // `copyOf`: the member holds a copy of the deck.
      findFirst: vi.fn(async () => ({ id: 'copy' })),
    },
    deckEditor: { findUnique: vi.fn(async () => null) },
    user: {
      findUnique: vi.fn(async () => {
        h.reads.push('user');
        return null;
      }),
    },
    userBlock: { findFirst: vi.fn(async () => null) },
    deckSuggestion: { create: vi.fn(async (a: unknown) => h.created.push(a)) },
  };
  return { prisma };
});
vi.mock('@/lib/db/advisory-lock.server', () => ({ lockKey: async () => {} }));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (n: unknown) => {
    h.notices.push(n);
  },
}));
vi.mock('@/lib/study/card-images.server', () => ({ deleteCardImageObjects: async () => {} }));

const { createSuggestion } = await import('@/lib/study/suggestions.server');
const { prisma } = await import('@/lib/prisma.server');

const input = { cardId: 'c1', front: 'Capital of France', back: 'Paris, France' };
const deck = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  userId: 'author',
  title: 'French',
  isPublic: true,
  acceptsSuggestions: true,
  moderatedAt: null,
  ...over,
});

beforeEach(() => {
  h.deck = null;
  h.reads = [];
  h.notices = [];
  h.created = [];
  vi.clearAllMocks();
});

describe('createSuggestion on a moderated deck', () => {
  it('reads moderatedAt with the deck', async () => {
    h.deck = deck();
    await createSuggestion('me', 'd1', input);
    const args = vi.mocked(prisma.flashcardDeck.findUnique).mock.calls[0]![0] as { select: Record<string, boolean> };
    expect(args.select.moderatedAt).toBe(true);
  });

  it('refuses a copier as not found, before anything else is read, stored or sent', async () => {
    h.deck = deck({ isPublic: false, moderatedAt: new Date('2026-12-01T00:00:00Z') });
    expect(await createSuggestion('me', 'd1', input)).toMatchObject({ ok: false, status: 404, reason: 'not-found' });
    expect(h.reads).toEqual(['deck']);
    expect(prisma.flashcardDeck.findFirst).not.toHaveBeenCalled();
    expect(h.created).toEqual([]);
    expect(h.notices).toEqual([]);
  });

  it('refuses even when the flag says public, so a half-applied takedown still holds', async () => {
    h.deck = deck({ moderatedAt: new Date('2026-12-01T00:00:00Z') });
    expect(await createSuggestion('me', 'd1', input)).toMatchObject({ ok: false, status: 404, reason: 'not-found' });
    expect(h.reads).toEqual(['deck']);
  });

  it('an unmoderated deck goes on to the next checks (the suggester is read)', async () => {
    h.deck = deck();
    await createSuggestion('me', 'd1', input);
    expect(h.reads).toContain('user');
  });
});
