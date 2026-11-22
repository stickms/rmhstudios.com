/**
 * An in-memory stand-in for the Prisma calls the deck, card and review code makes on `flashcard`,
 * `flashcard_deck` and `flashcard_review`. It is small but real where it matters: `where` clauses
 * (equality, `in`, `NOT`, `OR`, the owner join), the self-relation between an authored card and its
 * generated siblings with the foreign key's cascade, `createManyAndReturn`, and a transaction that
 * rolls back on a throw. Every advisory lock a transaction takes is recorded in `db.locks`.
 */

export interface FakeDeck {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  cardCount: number;
  clonedFromId?: string | null;
  sourceSyncedAt?: Date | null;
  cardsChangedAt?: Date | null;
  notifyUpdates?: boolean;
}
export interface FakeCard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  position: number;
  kind?: string;
  sourceId?: string | null;
  clozeIndex?: number | null;
  originCardId?: string | null;
  originHash?: string | null;
}
export interface FakeReview {
  id: string;
  cardId: string;
  userId?: string;
  dueAt?: Date;
}
export interface FakeDb {
  decks: FakeDeck[];
  cards: FakeCard[];
  reviews: FakeReview[];
  /** Practice-test results written. */
  results?: Record<string, unknown>[];
  /** Counts every mutating call, so a refused request can be shown to have written nothing. */
  writes: number;
  /** The key of every `lockKey` taken, in order. */
  locks: string[];
  nextId: number;
}

export const newFakeDb = (): FakeDb => ({ decks: [], cards: [], reviews: [], writes: 0, locks: [], nextId: 1 });

type Row = Record<string, unknown>;

function matches(db: FakeDb, row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, want] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(want as Row[]).some((w) => matches(db, row, w))) return false;
    } else if (key === 'AND') {
      if (!(want as Row[]).every((w) => matches(db, row, w))) return false;
    } else if (key === 'NOT') {
      if (matches(db, row, want as Row)) return false;
    } else if (key === 'deck') {
      const deck = db.decks.find((d) => d.id === row.deckId);
      if (!deck || !matches(db, deck as unknown as Row, want as Row)) return false;
    } else {
      const have = key === 'kind' ? (row.kind ?? 'basic') : (row[key] ?? null);
      if (want !== null && typeof want === 'object' && 'in' in (want as Row)) {
        if (!(want as { in: unknown[] }).in.includes(have)) return false;
      } else if (have !== want) return false;
    }
  }
  return true;
}

const withDefaults = (c: FakeCard): Required<FakeCard> => ({
  kind: 'basic',
  sourceId: null,
  clozeIndex: null,
  originCardId: null,
  originHash: null,
  ...c,
});

export function makeStudyPrisma(db: FakeDb) {
  const cardsOf = (where?: Row) => db.cards.filter((c) => matches(db, withDefaults(c) as unknown as Row, where));
  const asCard = (c: FakeCard) => ({
    ...withDefaults(c),
    siblings: db.cards.filter((s) => s.sourceId === c.id).map((s) => withDefaults(s)),
  });
  const newCard = (data: Row): FakeCard => {
    const card = withDefaults({
      ...(data as unknown as FakeCard),
      id: (data.id as string | undefined) ?? `gen${db.nextId++}`,
    });
    db.cards.push(card);
    return card;
  };
  /** The foreign keys: a card's siblings and every review of a removed card go with it. */
  const removeCards = (ids: string[]): number => {
    const doomed = new Set(ids);
    for (let grew = true; grew;) {
      grew = false;
      for (const c of db.cards) {
        if (c.sourceId && doomed.has(c.sourceId) && !doomed.has(c.id)) {
          doomed.add(c.id);
          grew = true;
        }
      }
    }
    const before = db.cards.length;
    db.cards = db.cards.filter((c) => !doomed.has(c.id));
    db.reviews = db.reviews.filter((r) => !doomed.has(r.cardId));
    return before - db.cards.length;
  };

  const client = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join('?').includes('pg_advisory_xact_lock')) db.locks.push(String(values[0]));
      return 0;
    },
    flashcardDeck: {
      updateMany: async ({ where, data }: { where: Row; data: Partial<FakeDeck> }) => {
        const decks = db.decks.filter((d) => matches(db, d as unknown as Row, where));
        for (const d of decks) Object.assign(d, data);
        if (decks.length > 0) db.writes++;
        return { count: decks.length };
      },
      findFirst: async ({ where, select }: { where: Row; select?: { cards?: { where?: Row } } }) => {
        const deck = db.decks.find((d) => matches(db, d as unknown as Row, where));
        if (!deck) return null;
        return {
          ...deck,
          cards: cardsOf({ deckId: deck.id, ...(select?.cards?.where ?? {}) }).map((c) => withDefaults(c)),
        };
      },
      findUnique: async ({ where, select }: { where: { id: string }; select?: { cards?: { where?: Row } } }) => {
        const deck = db.decks.find((d) => d.id === where.id);
        if (!deck) return null;
        if (!select?.cards) return deck;
        const cards = cardsOf({ deckId: deck.id, ...(select.cards.where ?? {}) })
          .map((c) => withDefaults(c))
          .sort((a, b) => a.position - b.position);
        return { ...deck, cards };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { cardCount?: { increment?: number; decrement?: number } } & Partial<FakeDeck>;
      }) => {
        const deck = db.decks.find((d) => d.id === where.id);
        if (!deck) throw new Error('no such deck');
        const { cardCount, ...rest } = data as { cardCount?: { increment?: number; decrement?: number } };
        deck.cardCount += (cardCount?.increment ?? 0) - (cardCount?.decrement ?? 0);
        Object.assign(deck, rest);
        db.writes++;
        return { ...deck };
      },
      create: async ({ data }: { data: Partial<FakeDeck> & { userId: string; title: string } }) => {
        const deck: FakeDeck = {
          id: `deck${db.nextId++}`,
          description: null,
          isPublic: false,
          cardCount: 0,
          ...data,
        };
        db.decks.push(deck);
        db.writes++;
        return { id: deck.id };
      },
      count: async ({ where }: { where: Row }) =>
        db.decks.filter((d) => matches(db, d as unknown as Row, where)).length,
    },
    flashcard: {
      findFirst: async ({ where }: { where: Row }) => {
        const card = cardsOf(where)[0];
        return card ? asCard(card) : null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const card = db.cards.find((c) => c.id === where.id);
        if (!card) return null;
        const deck = db.decks.find((d) => d.id === card.deckId);
        return { ...asCard(card), deck: deck ? { isPublic: deck.isPublic, userId: deck.userId } : null };
      },
      findMany: async ({ where, select }: { where?: Row; select?: { reviews?: { where?: Row } } }) =>
        cardsOf(where)
          .map((c) => ({
            ...asCard(c),
            reviews: db.reviews.filter(
              (r) => r.cardId === c.id && matches(db, r as unknown as Row, select?.reviews?.where),
            ),
          }))
          .sort((a, b) => a.position - b.position),
      count: async ({ where }: { where?: Row }) => cardsOf(where).length,
      aggregate: async ({ where }: { where: Row }) => {
        const positions = cardsOf(where).map((c) => c.position);
        return { _max: { position: positions.length ? Math.max(...positions) : null } };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeCard> }) => {
        const card = db.cards.find((c) => c.id === where.id);
        if (!card) throw new Error('no such card');
        Object.assign(card, data);
        db.writes++;
        return asCard(card);
      },
      updateMany: async ({ where, data }: { where: Row; data: Partial<FakeCard> }) => {
        const found = cardsOf(where);
        for (const c of found) Object.assign(c, data);
        if (found.length > 0) db.writes++;
        return { count: found.length };
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const count = removeCards(cardsOf(where).map((c) => c.id));
        if (count > 0) db.writes++;
        return { count };
      },
      createMany: async ({ data }: { data: Row[] }) => {
        for (const row of data) newCard(row);
        db.writes++;
        return { count: data.length };
      },
      createManyAndReturn: async ({ data }: { data: Row[] }) => {
        const made = data.map((row) => newCard(row));
        db.writes++;
        return made.map((c) => ({ id: c.id, position: c.position }));
      },
    },
  };

  const extras = {
    flashcardReview: {
      findMany: async ({ where }: { where: Row }) => db.reviews.filter((r) => matches(db, r as unknown as Row, where)),
      findUnique: async () => null,
    },
    flashcardTestResult: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        (db.results ??= []).push(data);
        db.writes++;
        return { id: BigInt(db.results.length) };
      },
    },
  };

  return {
    ...client,
    ...extras,
    // A throw rolls back everything the callback wrote, as a real transaction does.
    $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => {
      const snapshot = structuredClone({ decks: db.decks, cards: db.cards, reviews: db.reviews });
      try {
        return await fn(client);
      } catch (error) {
        Object.assign(db, snapshot);
        throw error;
      }
    },
  };
}
