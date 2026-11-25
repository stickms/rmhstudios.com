import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  deck: null as null | { id: string; title: string; isPublic: boolean; userId: string },
  role: null as null | 'owner' | 'editor',
  cards: [] as unknown[],
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: { flashcardDeck: { findUnique: async () => db.deck }, flashcard: { findMany: async () => db.cards } },
}));
vi.mock('@/lib/study/deck-access.server', () => ({ deckRole: async () => db.role }));

import { loadQuizCards, roomSafeCards } from '../quiz-cards.server';

const sound = { url: 'https://example.test/a.mp3' };
beforeEach(() => {
  db.deck = { id: 'd1', title: 'Deck', isPublic: true, userId: 'owner' };
  db.role = null;
  db.cards = [];
});

describe('roomSafeCards', () => {
  it('drops picture and occlusion cards and strips every sound and picture field', () => {
    const out = roomSafeCards([
      { id: 'a', front: 'f', back: 'b', frontSound: sound, backSound: sound, noteId: 'n1' },
      { id: 'b', front: 'f', back: 'b', frontImage: {} },
      { id: 'c', front: 'f', back: 'b', backImage: {} },
      { id: 'd', front: 'f', back: 'b', occlusion: {} },
    ] as never);
    expect(out).toEqual([{ id: 'a', front: 'f', back: 'b', clozeIndex: null, noteId: 'n1' }]);
    expect(JSON.stringify(out)).not.toMatch(/Sound|Image|occlusion/i);
  });
});

describe('loadQuizCards', () => {
  it('refuses a missing deck', async () => {
    db.deck = null;
    expect(await loadQuizCards('host', 'd1', { confirmPrivate: false })).toEqual({ ok: false, reason: 'not-found' });
  });

  it('lets any host quiz a public deck without confirming', async () => {
    db.cards = [
      {
        id: 'a',
        front: 'f',
        back: 'b',
        kind: 'basic',
        sourceId: null,
        clozeIndex: null,
        frontImageUrl: null,
        backImageUrl: null,
        source: null,
        backSound: sound,
      },
      {
        id: 'p',
        front: 'f',
        back: 'b',
        kind: 'basic',
        sourceId: null,
        clozeIndex: null,
        frontImageUrl: 'u',
        backImageUrl: null,
        source: null,
      },
      {
        id: 'o',
        front: 'f',
        back: 'b',
        kind: 'occlusion',
        sourceId: 's',
        clozeIndex: 0,
        frontImageUrl: null,
        backImageUrl: null,
        source: { frontImageUrl: 'u', backImageUrl: null },
      },
    ];
    const r = await loadQuizCards('host', 'd1', { confirmPrivate: false });
    expect(r).toMatchObject({ ok: true, deckTitle: 'Deck' });
    expect(JSON.stringify(r)).not.toMatch(/Sound|Image/);
    expect((r as { cards: { id: string }[] }).cards.map((c) => c.id)).toEqual(['a']);
  });

  it('refuses a private deck to an editor, confirmed or not', async () => {
    db.deck = { id: 'd1', title: 'Deck', isPublic: false, userId: 'owner' };
    db.role = 'editor';
    for (const confirmPrivate of [false, true]) {
      expect(await loadQuizCards('ed', 'd1', { confirmPrivate })).toEqual({ ok: false, reason: 'private-editor' });
    }
  });

  it('refuses a private deck the host may not study like a missing one', async () => {
    db.deck = { id: 'd1', title: 'Deck', isPublic: false, userId: 'owner' };
    expect(await loadQuizCards('stranger', 'd1', { confirmPrivate: true })).toEqual({ ok: false, reason: 'not-found' });
  });

  it('needs the confirmation from the owner of a private deck', async () => {
    db.deck = { id: 'd1', title: 'Deck', isPublic: false, userId: 'owner' };
    db.role = 'owner';
    expect(await loadQuizCards('owner', 'd1', { confirmPrivate: false })).toEqual({
      ok: false,
      reason: 'confirm-required',
    });
    expect(await loadQuizCards('owner', 'd1', { confirmPrivate: true })).toMatchObject({ ok: true });
  });
});
