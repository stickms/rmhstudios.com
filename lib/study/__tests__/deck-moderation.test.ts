import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s12-16: a deck a moderator took down is private and stays out of every public read; its owner cannot make it public
 * again (the site PATCH and the developer API both go through `updateDeck`, so both are refused); the owner and the
 * editors keep their copy. Run against an in-memory deck table.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({ decks: [] as Row[], editors: [] as Row[], marketplaceWhere: null as unknown }));

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'not' in (v as Row)) return row[k] !== (v as Row).not;
    return row[k] === v;
  });

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    flashcardDeck: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => h.decks.find((r) => matches(r, where)) ?? null),
      findFirst: vi.fn(async ({ where }: { where: Row }) => h.decks.find((r) => matches(r, where)) ?? null),
      findMany: vi.fn(async ({ where }: { where: Row }) => {
        if (where.isPublic === undefined) return [];
        h.marketplaceWhere = where;
        return h.decks
          .filter((r) => r.isPublic === where.isPublic && r.moderatedAt === where.moderatedAt)
          .map((r) => ({ ...r, user: { name: 'n', handle: 'h', image: null } }));
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = h.decks.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      }),
    },
    deckEditor: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    flashcard: { findMany: vi.fn(async () => []), groupBy: vi.fn(async () => []) },
    flashcardReview: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    flashcardTestResult: { findMany: vi.fn(async () => []) },
    deckSuggestion: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock('@/lib/study/deck-access.server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  deckRole: vi.fn(async (userId: string, deckId: string) => {
    const deck = h.decks.find((d) => d.id === deckId);
    if (!deck) return null;
    if (deck.userId === userId) return 'owner';
    return h.editors.some((e) => e.deckId === deckId && e.userId === userId) ? 'editor' : null;
  }),
  canReadDeck: vi.fn(async () => false),
}));
vi.mock('@/lib/study/deck-editors.server', () => ({
  MEMBER_NAME: {},
  editorCounts: vi.fn(async () => new Map()),
  invitationTo: vi.fn(async () => null),
  listInvitations: vi.fn(async () => []),
}));

import { updateDeck } from '@/lib/study/deck-editor.server';
import { moderateDeck } from '@/lib/study/deck-moderation.server';
import { getDeck, listMarketplaceDecks } from '@/lib/study.server';
import { patchMyDeck } from '@/lib/api/v1/study.server';

beforeEach(() => {
  h.decks = [
    {
      id: 'd1',
      userId: 'owner',
      title: 'Deck',
      isPublic: true,
      moderatedAt: null,
      cardCount: 3,
      cards: [],
      user: { name: 'n', handle: 'h', profile: null },
    },
    { id: 'd2', userId: 'owner', title: 'Other', isPublic: false, moderatedAt: null, cardCount: 3 },
  ];
  h.editors = [{ deckId: 'd1', userId: 'editor' }];
  h.marketplaceWhere = null;
});

describe('the owner cannot undo a takedown', () => {
  it('a deck that was not taken down can be made public and private as before', async () => {
    expect(await updateDeck('owner', 'd2', { isPublic: true })).toEqual({ ok: true });
    expect(h.decks[1]).toMatchObject({ isPublic: true });
    expect(await updateDeck('owner', 'd2', { isPublic: false })).toEqual({ ok: true });
  });

  it('refuses isPublic: true while moderated, with the refusal code, and keeps the deck private', async () => {
    await moderateDeck('d1');
    const res = await updateDeck('owner', 'd1', { isPublic: true });
    expect(res).toMatchObject({ ok: false, status: 409, code: 'CONTENT_REMOVED_BY_MODERATOR' });
    expect(h.decks[0]).toMatchObject({ isPublic: false });
  });

  it('still lets the owner edit the title, and make it private again', async () => {
    await moderateDeck('d1');
    expect(await updateDeck('owner', 'd1', { title: 'Renamed' })).toEqual({ ok: true });
    expect(await updateDeck('owner', 'd1', { isPublic: false })).toEqual({ ok: true });
    expect(h.decks[0]).toMatchObject({ title: 'Renamed', isPublic: false });
  });

  it('is the same refusal through the developer API (patchMyDeck answers a conflict)', async () => {
    await moderateDeck('d1');
    const res = await patchMyDeck('owner', 'd1', { isPublic: true });
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(h.decks[0]).toMatchObject({ isPublic: false });
    const { editFailure } = await import('@/lib/api/v1/study.server');
    const error = vi.fn((code: string) => code);
    editFailure(error as never, res as never);
    expect(error).toHaveBeenCalledWith('conflict', expect.any(String), 409);
  });

  it('a deck that is not the caller’s is still not found, not a refusal', async () => {
    await moderateDeck('d1');
    expect(await updateDeck('stranger', 'd1', { isPublic: true })).toMatchObject({ ok: false, status: 404 });
  });
});

describe('who still reads it', () => {
  it('answers null (a 404) to a stranger and to a signed-out visitor, even if the flag outlived isPublic', async () => {
    await moderateDeck('d1');
    expect(await getDeck('d1', { id: 'stranger' })).toBeNull();
    expect(await getDeck('d1', { id: null })).toBeNull();
    h.decks[0]!.isPublic = true;
    expect(await getDeck('d1', { id: 'stranger' })).toBeNull();
  });

  it('keeps the deck for its owner and its editors, who are told it was removed', async () => {
    await moderateDeck('d1');
    for (const id of ['owner', 'editor']) {
      const detail = await getDeck('d1', { id });
      expect(detail?.deck).toMatchObject({ id: 'd1', isPublic: false, removedByModerator: true });
    }
  });

  it('keeps the browse page free of it', async () => {
    // The flag is set while the deck still reads as public (as if the two ever disagreed): it is not listed.
    h.decks[0]!.moderatedAt = new Date();
    const list = await listMarketplaceDecks('stranger', null);
    expect(h.marketplaceWhere).toMatchObject({ isPublic: true, moderatedAt: null });
    expect(JSON.stringify(list)).not.toContain('d1');
  });

  it('is gone from the deck page of a copier: a moderated deck cannot be cloned', async () => {
    await moderateDeck('d1');
    const { cloneDeck } = await import('@/lib/study.server');
    expect(await cloneDeck('stranger', 'd1')).toMatchObject({ ok: false, status: 404 });
  });
});
