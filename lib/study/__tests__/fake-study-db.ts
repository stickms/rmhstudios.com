import { Prisma } from '@prisma/client';

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
  /** The languages the deck's sides are written in (s11-17). */
  frontLang?: string | null;
  backLang?: string | null;
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
  /** An importer's own key for the card (an editor's import never sets it; s11-10). */
  externalId?: string | null;
  frontImageUrl?: string | null;
  frontImageAlt?: string | null;
  backImageUrl?: string | null;
  backImageAlt?: string | null;
  /** Sounds on the card's sides (s10-02). */
  frontSoundUrl?: string | null;
  frontSoundText?: string | null;
  frontSoundMs?: number | null;
  backSoundUrl?: string | null;
  backSoundText?: string | null;
  backSoundMs?: number | null;
  /** The masks of an occlusion card (s09-03). */
  occlusion?: unknown;
}
/** A `Media` row, for the pictures on cards (s08-15). */
export interface FakeMedia {
  id: string;
  userId: string;
  key: string;
  url: string;
  /** Absent means a still WebP within the cap, what the flashcard surface stores. */
  contentType?: string;
  bytes?: number;
  status: 'PENDING' | 'ATTACHED';
  postId?: string | null;
  attachedAt?: Date | null;
  /** Absent means just now (the sound claim refuses an upload older than a day, s10-02). */
  createdAt?: Date;
}
/** A `DeckEditor` row (s11-10). */
export interface FakeEditor {
  deckId: string;
  userId: string;
  invitedById: string;
  status: 'pending' | 'accepted';
  createdAt?: Date;
  acceptedAt?: Date | null;
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
  /** Editors of decks (s11-10); absent means none. */
  editors?: FakeEditor[];
  /** Members a test needs the editor rules to read (`bannedUntil`, `deletionScheduledAt`). */
  users?: {
    id: string;
    name?: string | null;
    handle?: string | null;
    bannedUntil?: Date | null;
    deletionScheduledAt?: Date | null;
  }[];
  /** `UserBlock` rows. */
  blocks?: { id: string; blockerId: string; blockedId: string }[];
  /** `Media` rows (only the pictures-on-cards code reads them). */
  media?: FakeMedia[];
  /** Sync tombstones written (s09-10): the deletion functions record one each. */
  tombstones?: { userId: string; kind: string; entityId: string }[];
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

/** A write's data as the database stores it: `Prisma.DbNull` (clear a JSON column) is a plain null. */
const stored = <T extends object>(data: T): T =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === Prisma.DbNull ? null : v])) as T;

function matches(db: FakeDb, row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, want] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(want as Row[]).some((w) => matches(db, row, w))) return false;
    } else if (key === 'AND') {
      if (!(want as Row[]).every((w) => matches(db, row, w))) return false;
    } else if (key === 'NOT') {
      if (matches(db, row, want as Row)) return false;
    } else if (key === 'editors') {
      // `editors: { some | none: { userId, status } }` on a deck row (s11-10).
      const spec = want as { some?: Row; none?: Row };
      const rows = (db.editors ?? []).filter((e) => e.deckId === row.id);
      if (spec.some && !rows.some((e) => matches(db, e as unknown as Row, spec.some))) return false;
      if (spec.none && rows.some((e) => matches(db, e as unknown as Row, spec.none))) return false;
    } else if (key === 'deck') {
      const deck = db.decks.find((d) => d.id === row.deckId);
      if (!deck || !matches(db, deck as unknown as Row, want as Row)) return false;
    } else {
      const have = key === 'kind' ? (row.kind ?? 'basic') : (row[key] ?? null);
      if (want !== null && typeof want === 'object' && 'not' in (want as Row)) {
        if (have === (want as { not: unknown }).not) return false;
      } else if (want !== null && typeof want === 'object' && 'gte' in (want as Row)) {
        const floor = (want as { gte: Date }).gte;
        if (((have as Date | null) ?? new Date()).getTime() < floor.getTime()) return false;
      } else if (want !== null && typeof want === 'object' && 'startsWith' in (want as Row)) {
        if (typeof have !== 'string' || !have.startsWith((want as { startsWith: string }).startsWith)) return false;
      } else if (want !== null && typeof want === 'object' && 'lte' in (want as Row)) {
        if (typeof have !== 'number' || have > (want as { lte: number }).lte) return false;
      } else if (want !== null && typeof want === 'object' && 'in' in (want as Row)) {
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
  externalId: null,
  frontImageUrl: null,
  frontImageAlt: null,
  backImageUrl: null,
  backImageAlt: null,
  frontSoundUrl: null,
  frontSoundText: null,
  frontSoundMs: null,
  backSoundUrl: null,
  backSoundText: null,
  backSoundMs: null,
  occlusion: null,
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

  /** A stored editor row as a query sees it: `createdAt` is always set. */
  const editorRow = (e: FakeEditor) => ({
    ...e,
    createdAt: e.createdAt ?? new Date(0),
    acceptedAt: e.acceptedAt ?? null,
  });
  const userOf = (id: string) => {
    const u = (db.users ?? []).find((x) => x.id === id) as { name?: string | null; handle?: string | null } | undefined;
    return { name: u?.name ?? null, handle: u?.handle ?? null, profile: null };
  };
  const deckOf = (id: string) => {
    const d = db.decks.find((x) => x.id === id);
    return d
      ? { title: d.title, userId: d.userId, clonedFromId: d.clonedFromId ?? null, user: userOf(d.userId) }
      : undefined;
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
        const user = (db.users ?? []).find((u) => u.id === deck.userId) as
          { name?: string | null; handle?: string | null } | undefined;
        const withOwner = { ...deck, user: { name: user?.name ?? null, handle: user?.handle ?? null, profile: null } };
        if (!select?.cards) return withOwner;
        const cards = cardsOf({ deckId: deck.id, ...(select.cards.where ?? {}) })
          .map((c) => withDefaults(c))
          .sort((a, b) => a.position - b.position);
        return { ...withOwner, cards };
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
      /** The decks a `where` selects (no ordering or `select`: a row comes back whole, with its owner). */
      findMany: async ({ where, take }: { where?: Row; take?: number }) =>
        db.decks
          .filter((d) => matches(db, d as unknown as Row, where))
          .slice(0, take ?? db.decks.length)
          .map((d) => ({ ...d, user: userOf(d.userId) })),
      /** A deck's cards and their reviews go with it (the foreign keys' cascade). */
      deleteMany: async ({ where }: { where: Row }) => {
        const doomed = db.decks.filter((d) => matches(db, d as unknown as Row, where));
        for (const d of doomed) removeCards(db.cards.filter((c) => c.deckId === d.id).map((c) => c.id));
        db.decks = db.decks.filter((d) => !doomed.includes(d));
        if (doomed.length > 0) db.writes++;
        return { count: doomed.length };
      },
    },
    flashcard: {
      findFirst: async ({ where }: { where: Row }) => {
        const card = cardsOf(where)[0];
        if (!card) return null;
        const deck = db.decks.find((d) => d.id === card.deckId);
        return { ...asCard(card), deck: deck ? { ...deck } : undefined };
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
            deck: db.decks.find((d) => d.id === c.deckId),
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
        Object.assign(card, stored(data));
        db.writes++;
        return asCard(card);
      },
      updateMany: async ({ where, data }: { where: Row; data: Partial<FakeCard> }) => {
        const found = cardsOf(where);
        for (const c of found) Object.assign(c, stored(data));
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
    deckFolder: { findMany: async () => [] as unknown[] },
    deckEditor: {
      findUnique: async ({ where }: { where: { deckId_userId: { deckId: string; userId: string } } }) => {
        const { deckId, userId } = where.deckId_userId;
        const row = (db.editors ?? []).find((e) => e.deckId === deckId && e.userId === userId);
        return row ? { ...editorRow(row), deck: deckOf(row.deckId) } : null;
      },
      findFirst: async ({ where }: { where: Row }) => {
        const row = (db.editors ?? []).find((e) => matches(db, editorRow(e) as unknown as Row, where));
        return row ? { ...editorRow(row), deck: deckOf(row.deckId) } : null;
      },
      findMany: async ({ where }: { where: Row }) =>
        (db.editors ?? [])
          .filter((e) => matches(db, editorRow(e) as unknown as Row, where))
          .map((e) => ({ ...editorRow(e), deck: deckOf(e.deckId), user: userOf(e.userId) })),
      count: async ({ where }: { where: Row }) =>
        (db.editors ?? []).filter((e) => matches(db, editorRow(e) as unknown as Row, where)).length,
      groupBy: async ({ where }: { where: Row }) => {
        const counts = new Map<string, number>();
        for (const e of (db.editors ?? []).filter((x) => matches(db, editorRow(x) as unknown as Row, where))) {
          counts.set(e.deckId, (counts.get(e.deckId) ?? 0) + 1);
        }
        return [...counts].map(([deckId, n]) => ({ deckId, _count: { _all: n } }));
      },
      create: async ({ data }: { data: FakeEditor }) => {
        const row = { createdAt: new Date(), acceptedAt: null, ...data };
        (db.editors ??= []).push(row);
        db.writes++;
        return { ...row };
      },
      updateMany: async ({ where, data }: { where: Row; data: Partial<FakeEditor> }) => {
        const found = (db.editors ?? []).filter((e) => matches(db, editorRow(e) as unknown as Row, where));
        for (const e of found) Object.assign(e, data);
        if (found.length > 0) db.writes++;
        return { count: found.length };
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const doomed = (db.editors ?? []).filter((e) => matches(db, editorRow(e) as unknown as Row, where));
        db.editors = (db.editors ?? []).filter((e) => !doomed.includes(e));
        if (doomed.length > 0) db.writes++;
        return { count: doomed.length };
      },
    },
    userBlock: {
      findFirst: async ({ where }: { where: { OR: { blockerId: string; blockedId: string }[] } }) => {
        const hit = (db.blocks ?? []).find((b) =>
          where.OR.some((w) => w.blockerId === b.blockerId && w.blockedId === b.blockedId),
        );
        return hit ? { id: hit.id } : null;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = (db.users ?? []).find((x) => x.id === where.id);
        return u ? { ...u, profile: null } : null;
      },
    },
    media: {
      create: async ({ data }: { data: FakeMedia }) => {
        (db.media ??= []).push({ ...data });
        db.writes++;
        return { ...data };
      },
      findFirst: async ({ where }: { where?: Row }) => {
        const found = (db.media ??= []).find((m) => matches(db, m as unknown as Row, where));
        return found ? { ...found } : null;
      },
      updateMany: async ({ where, data }: { where: Row; data: Partial<FakeMedia> }) => {
        const found = (db.media ??= []).filter((m) => matches(db, m as unknown as Row, where));
        for (const m of found) Object.assign(m, data);
        if (found.length > 0) db.writes++;
        return { count: found.length };
      },
      findMany: async ({ where }: { where?: Row }) =>
        (db.media ??= []).filter((m) => matches(db, m as unknown as Row, where)).map((m) => ({ ...m })),
      deleteMany: async ({ where }: { where: Row }) => {
        const doomed = (db.media ??= []).filter((m) => matches(db, m as unknown as Row, where));
        db.media = (db.media ?? []).filter((m) => !doomed.includes(m));
        if (doomed.length > 0) db.writes++;
        return { count: doomed.length };
      },
    },
    syncTombstone: {
      // Not counted in `writes`: it is bookkeeping beside the write a test is watching.
      create: async ({ data }: { data: { userId: string; kind: string; entityId: string } }) => {
        (db.tombstones ??= []).push({ userId: data.userId, kind: data.kind, entityId: data.entityId });
        return { id: BigInt(db.tombstones.length) };
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
      const snapshot = structuredClone({
        decks: db.decks,
        cards: db.cards,
        reviews: db.reviews,
        media: db.media ?? [],
        tombstones: db.tombstones ?? [],
      });
      try {
        return await fn(client);
      } catch (error) {
        Object.assign(db, snapshot);
        throw error;
      }
    },
  };
}
