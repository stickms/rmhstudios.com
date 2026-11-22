import { beforeEach, describe, expect, it, vi } from 'vitest';

// A member's deck data: every write is owner-only (a foreign or missing deck or card is a 404), the order endpoint takes
// exactly the deck's cards, a bulk import over its cap writes nothing, and cardCount follows imports and deletes.

interface Deck {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  cardCount: number;
}
interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  position: number;
}
interface Review {
  id: string;
  cardId: string;
}

const db = vi.hoisted(() => ({
  decks: [] as Deck[],
  cards: [] as Card[],
  reviews: [] as Review[],
  writes: 0,
  locks: [] as string[],
  nextId: 1,
}));

vi.mock('@/lib/prisma.server', async () => {
  const { makeStudyPrisma } = await import('./fake-study-db');
  return { prisma: makeStudyPrisma(db as import('./fake-study-db').FakeDb) };
});

const { updateDeck, updateCard, deleteCard, importCards, reorderCards } =
  await import('@/lib/study/deck-editor.server');

const card = (id: string, deckId: string, position: number): Card => ({
  id,
  deckId,
  front: `f-${id}`,
  back: `b-${id}`,
  position,
});

beforeEach(() => {
  db.decks = [
    {
      id: 'mine',
      userId: 'me',
      title: 'Mine',
      description: null,
      isPublic: false,
      cardCount: 3,
    },
    {
      id: 'theirs',
      userId: 'other',
      title: 'Theirs',
      description: null,
      isPublic: true,
      cardCount: 1,
    },
  ];
  db.cards = [card('a', 'mine', 0), card('b', 'mine', 1), card('c', 'mine', 2), card('x', 'theirs', 0)];
  db.reviews = [
    {
      id: 'r1',
      cardId: 'a',
    },
    {
      id: 'r2',
      cardId: 'b',
    },
  ];
  db.writes = 0;
});

const mine = () => db.cards.filter((c) => c.deckId === 'mine').sort((p, q) => p.position - q.position);

describe('ownership', () => {
  it('a foreign deck answers 404 on every deck write and changes nothing', async () => {
    const results = [
      await updateDeck('me', 'theirs', {
        title: 'Taken',
      }),
      await importCards('me', 'theirs', [
        {
          front: 'a',
          back: 'b',
        },
      ]),
      await reorderCards('me', 'theirs', ['x']),
    ];
    for (const r of results)
      expect(r).toEqual({
        ok: false,
        status: 404,
        error: 'Not found',
      });
    expect(db.writes).toBe(0);
    expect(db.decks[1].title).toBe('Theirs');
  });

  it('a missing deck answers 404', async () => {
    expect(
      await updateDeck('me', 'nope', {
        isPublic: true,
      }),
    ).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it('a foreign or missing card answers 404 on edit and delete', async () => {
    expect(
      await updateCard('me', 'x', {
        front: 'hijack',
      }),
    ).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await deleteCard('me', 'x')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await deleteCard('me', 'ghost')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(db.cards.find((c) => c.id === 'x')!.front).toBe('f-x');
    expect(db.decks[1].cardCount).toBe(1);
  });
});

describe('deck settings and card edits', () => {
  it('renames, describes and publishes; a blank description clears it', async () => {
    expect(
      await updateDeck('me', 'mine', {
        title: 'New',
        description: 'About',
        isPublic: true,
      }),
    ).toEqual({
      ok: true,
    });
    expect(db.decks[0]).toMatchObject({
      title: 'New',
      description: 'About',
      isPublic: true,
    });
    await updateDeck('me', 'mine', {
      description: '',
    });
    expect(db.decks[0].description).toBeNull();
  });

  it('editing a card keeps its row, and so its reviews', async () => {
    expect(
      await updateCard('me', 'a', {
        back: 'changed',
      }),
    ).toEqual({
      ok: true,
    });
    expect(db.cards.find((c) => c.id === 'a')).toMatchObject({
      front: 'f-a',
      back: 'changed',
    });
    expect(db.reviews.map((r) => r.id)).toEqual(['r1', 'r2']);
  });
});

describe('reorder', () => {
  it('writes the new order', async () => {
    expect(await reorderCards('me', 'mine', ['c', 'a', 'b'])).toEqual({
      ok: true,
    });
    expect(mine().map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });

  it('refuses a list that is not exactly the deck cards and writes nothing', async () => {
    const bad = [
      ['a', 'b'], // missing one
      ['a', 'b', 'c', 'd'], // extra id
      ['a', 'a', 'b'], // duplicate
      ['a', 'b', 'x'], // another deck's card
      [],
    ];
    for (const ids of bad) {
      expect(await reorderCards('me', 'mine', ids), ids.join()).toMatchObject({
        ok: false,
        status: 400,
      });
    }
    expect(db.writes).toBe(0);
    expect(mine().map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('bulk import', () => {
  const batch = (n: number) =>
    Array.from(
      {
        length: n,
      },
      (_, i) => ({
        front: `n${i}`,
        back: `m${i}`,
      }),
    );

  it('adds after the current last card and updates cardCount in the same transaction', async () => {
    const r = await importCards('me', 'mine', batch(2));
    expect(r).toEqual({
      ok: true,
      created: 2,
      cardCount: 5,
    });
    expect(mine().map((c) => c.position)).toEqual([0, 1, 2, 3, 4]);
    expect(
      mine()
        .slice(3)
        .map((c) => c.front),
    ).toEqual(['n0', 'n1']);
    expect(db.decks[0].cardCount).toBe(mine().length);
  });

  it('continues after the last position even when a delete left a gap', async () => {
    await deleteCard('me', 'a');
    await importCards('me', 'mine', batch(1));
    expect(mine().map((c) => c.position)).toEqual([1, 2, 3]);
  });

  it('refuses more than 500 cards at once and writes nothing', async () => {
    const r = await importCards('me', 'mine', batch(501));
    expect(r).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(db.writes).toBe(0);
    expect(db.cards).toHaveLength(4);
  });

  it('refuses an import that would pass the 2,000-card deck cap and writes nothing', async () => {
    // The cap counts rows: top the deck up to 1,900 of them.
    for (let i = 0; i < 1897; i++) db.cards.push(card(`fill${i}`, 'mine', 3 + i));
    db.decks[0].cardCount = 1900;
    const r = await importCards('me', 'mine', batch(101));
    expect(r).toEqual({
      ok: false,
      status: 400,
      error: 'Deck is full',
    });
    expect(db.writes).toBe(0);
    expect(db.cards).toHaveLength(1901);
    expect(db.decks[0].cardCount).toBe(1900);
    // Exactly to the cap is fine.
    expect(await importCards('me', 'mine', batch(100))).toMatchObject({
      ok: true,
      cardCount: 2000,
    });
  });

  it('refuses an empty import', async () => {
    expect(await importCards('me', 'mine', [])).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe('cardCount', () => {
  it('matches the cards after an import and a delete, and the delete removes the reviews', async () => {
    await importCards('me', 'mine', [
      {
        front: 'p',
        back: 'q',
      },
    ]);
    expect(await deleteCard('me', 'a')).toEqual({
      ok: true,
    });
    expect(await deleteCard('me', 'b')).toEqual({
      ok: true,
    });
    expect(db.decks[0].cardCount).toBe(mine().length);
    expect(db.decks[0].cardCount).toBe(2);
    expect(db.reviews).toEqual([]);
    // Another deck's count is untouched.
    expect(db.decks[1].cardCount).toBe(1);
  });
});
