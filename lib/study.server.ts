import { prisma } from '@/lib/prisma.server';
import { isCardKind, isReviewable, noteIdOf, type CardKind } from '@/lib/study/card-types';
import { AUTHORED_WHERE, CARD_ORDER, REVIEWABLE_WHERE } from '@/lib/study/card-query.server';
import { insertCards } from '@/lib/study/deck-editor.server';
import type { TestCard } from '@/lib/study/practice-test';

export interface DeckSummary {
  id: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  cardCount: number;
}

export interface PopularDeck {
  id: string;
  title: string;
  description: string | null;
  cardCount: number;
  user: { name: string | null; handle: string | null };
}

export interface DecksList {
  mine: DeckSummary[];
  popular: PopularDeck[];
  signedIn: boolean;
}

/**
 * List a viewer's own decks plus popular public decks. Shared by the
 * `/api/study/decks` GET handler and the `/study` route loader so the page is
 * server-rendered / prefetched instead of fetched client-side on mount. Pass
 * `null` for signed-out visitors (they see only public decks).
 */
export async function listDecks(userId: string | null): Promise<DecksList> {
  const [mine, popular] = await Promise.all([
    userId
      ? prisma.flashcardDeck.findMany({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, title: true, description: true, isPublic: true, cardCount: true },
        })
      : Promise.resolve([]),
    prisma.flashcardDeck.findMany({
      where: { isPublic: true, ...(userId ? { userId: { not: userId } } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: { id: true, title: true, description: true, cardCount: true, user: { select: { name: true, handle: true } } },
    }),
  ]);
  return { mine, popular, signedIn: !!userId };
}

export interface MarketplaceDeck {
  id: string;
  title: string;
  description: string | null;
  cardCount: number;
  user: { name: string | null; handle: string | null; image: string | null };
  isOwn: boolean;
  alreadyCloned: boolean;
}

export interface MarketplaceList {
  decks: MarketplaceDeck[];
  signedIn: boolean;
}

const MARKETPLACE_LIMIT = 60;

/**
 * Browse public decks (the deck "marketplace"). Ranked by size then recency,
 * optionally filtered by a title/description query. Flags decks the viewer owns
 * or has already cloned so the UI can disable re-adding them.
 */
export async function listMarketplaceDecks(
  viewerId: string | null,
  query: string | null,
): Promise<MarketplaceList> {
  const q = query?.trim();
  const decks = await prisma.flashcardDeck.findMany({
    where: {
      isPublic: true,
      cardCount: { gt: 0 },
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { description: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ cardCount: 'desc' }, { updatedAt: 'desc' }],
    take: MARKETPLACE_LIMIT,
    select: {
      id: true,
      title: true,
      description: true,
      cardCount: true,
      userId: true,
      user: { select: { name: true, handle: true, image: true } },
    },
  });

  // Which of these has the viewer already cloned?
  let clonedSet = new Set<string>();
  if (viewerId) {
    const cloned = await prisma.flashcardDeck.findMany({
      where: { userId: viewerId, clonedFromId: { in: decks.map((d) => d.id) } },
      select: { clonedFromId: true },
    });
    clonedSet = new Set(cloned.map((c) => c.clonedFromId).filter((v): v is string => !!v));
  }

  return {
    signedIn: !!viewerId,
    decks: decks.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      cardCount: d.cardCount,
      user: d.user,
      isOwn: d.userId === viewerId,
      alreadyCloned: clonedSet.has(d.id),
    })),
  };
}

const MAX_DECKS = 200;

export type CloneResult =
  | { ok: true; id: string; alreadyOwned: boolean }
  | { ok: false; error: string; status: number };

/**
 * Clone a public deck (with its cards) into the viewer's own decks. Idempotent:
 * if the viewer already cloned this source deck, returns the existing copy.
 * Copies are private by default. Rejects private/own/oversized cases.
 */
export async function cloneDeck(userId: string, sourceId: string): Promise<CloneResult> {
  const source = await prisma.flashcardDeck.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      userId: true,
      isPublic: true,
      title: true,
      description: true,
      // Authored cards only: the clone's siblings are generated again, so they get their own ids.
      cards: {
        where: AUTHORED_WHERE,
        orderBy: CARD_ORDER,
        select: { kind: true, front: true, back: true },
      },
    },
  });
  if (!source || !source.isPublic) return { ok: false, error: 'Deck not found', status: 404 };
  if (source.userId === userId) return { ok: false, error: 'You already own this deck', status: 400 };

  // Idempotent: don't create duplicate clones of the same source.
  const existing = await prisma.flashcardDeck.findFirst({
    where: { userId, clonedFromId: sourceId },
    select: { id: true },
  });
  if (existing) return { ok: true, id: existing.id, alreadyOwned: true };

  const count = await prisma.flashcardDeck.count({ where: { userId } });
  if (count >= MAX_DECKS) return { ok: false, error: 'Too many decks', status: 400 };

  const deck = await prisma.$transaction(async (tx) => {
    const created = await tx.flashcardDeck.create({
      data: {
        userId,
        title: source.title.slice(0, 100),
        description: source.description?.slice(0, 500) ?? null,
        isPublic: false,
        clonedFromId: sourceId,
        cardCount: source.cards.length,
      },
      select: { id: true },
    });
    if (source.cards.length > 0) {
      await insertCards(
        tx,
        created.id,
        source.cards.map((c) => ({ kind: cardKind(c.kind), front: c.front, back: c.back })),
      );
    }
    return created;
  });
  return { ok: true, id: deck.id, alreadyOwned: false };
}

const cardKind = (kind: string): CardKind => (isCardKind(kind) ? kind : 'basic');

/** An authored card as the deck page, the editor and export read it. */
export interface DeckCard {
  id: string;
  front: string;
  back: string;
  kind: CardKind;
  /** Always null for an authored card; set on the generated cards review returns. */
  clozeIndex: number | null;
  sourceId: string | null;
}

export interface DeckDetail {
  deck: {
    id: string;
    title: string;
    description: string | null;
    isPublic: boolean;
    isOwner: boolean;
    /** Authored cards: what the owner wrote. */
    cardCount: number;
  };
  /** The authored cards, in deck order. */
  cards: DeckCard[];
  /** Cards a member studies: authored plus generated, minus authored cloze text. */
  reviewCount: number;
  /** Every row in the deck, generated cards included: what the 2,000-card cap counts. */
  rowCount: number;
  dueCount: number;
  signedIn: boolean;
}

/**
 * Resolve a single deck (with its authored cards + this viewer's due count) for the given
 * viewer. Shared by the `/api/study/decks/$id` GET handler and the
 * `/study/$deckId` route loader. Returns `null` when the deck does not exist or
 * is private and the viewer is not its owner (the caller maps that to a 404 /
 * not-found state).
 */
export async function getDeck(deckId: string, viewer: { id: string | null }): Promise<DeckDetail | null> {
  const deck = await prisma.flashcardDeck.findUnique({
    where: { id: deckId },
    select: {
      id: true, title: true, description: true, isPublic: true, userId: true, cardCount: true,
      cards: {
        orderBy: CARD_ORDER,
        select: { id: true, front: true, back: true, kind: true, sourceId: true, clozeIndex: true },
      },
    },
  });
  if (!deck) return null;
  const isOwner = viewer.id === deck.userId;
  if (!deck.isPublic && !isOwner) return null;

  // Due cards are counted over what is reviewed (generated cards included), not what is listed.
  const reviewable = deck.cards.filter(isReviewable);
  let dueCount = 0;
  if (viewer.id) {
    const reviewed = await prisma.flashcardReview.findMany({
      where: { userId: viewer.id, cardId: { in: reviewable.map((c) => c.id) } },
      select: { cardId: true, dueAt: true },
    });
    const reviewedMap = new Map(reviewed.map((r) => [r.cardId, r.dueAt]));
    const now = Date.now();
    for (const c of reviewable) {
      const due = reviewedMap.get(c.id);
      if (!due || due.getTime() <= now) dueCount++;
    }
  }

  return {
    deck: { id: deck.id, title: deck.title, description: deck.description, isPublic: deck.isPublic, isOwner, cardCount: deck.cardCount },
    cards: deck.cards
      .filter((c) => c.sourceId === null)
      .map((c) => ({ id: c.id, front: c.front, back: c.back, kind: cardKind(c.kind), clozeIndex: null, sourceId: null })),
    reviewCount: reviewable.length,
    rowCount: deck.cards.length,
    dueCount,
    signedIn: !!viewer.id,
  };
}

/**
 * The cards a practice test draws from: reviewable cards only, each with the note it belongs to
 * so a test never asks about the same fact twice. The caller has already checked the viewer may
 * read the deck.
 */
export async function getTestCards(deckId: string): Promise<TestCard[]> {
  const rows = await prisma.flashcard.findMany({
    where: { deckId, ...REVIEWABLE_WHERE },
    orderBy: CARD_ORDER,
    select: { id: true, front: true, back: true, sourceId: true, clozeIndex: true },
  });
  return rows.map((r) => ({
    id: r.id,
    front: r.front,
    back: r.back,
    clozeIndex: r.clozeIndex,
    noteId: noteIdOf(r),
  }));
}
