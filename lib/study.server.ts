import { prisma } from '@/lib/prisma.server';

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
      cards: { orderBy: { position: 'asc' }, select: { front: true, back: true } },
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

  const deck = await prisma.flashcardDeck.create({
    data: {
      userId,
      title: source.title.slice(0, 100),
      description: source.description?.slice(0, 500) ?? null,
      isPublic: false,
      clonedFromId: sourceId,
      cardCount: source.cards.length,
      cards: source.cards.length
        ? { create: source.cards.map((c, i) => ({ front: c.front, back: c.back, position: i })) }
        : undefined,
    },
    select: { id: true },
  });
  return { ok: true, id: deck.id, alreadyOwned: false };
}

export interface DeckCard {
  id: string;
  front: string;
  back: string;
}

export interface DeckDetail {
  deck: {
    id: string;
    title: string;
    description: string | null;
    isPublic: boolean;
    isOwner: boolean;
    cardCount: number;
  };
  cards: DeckCard[];
  dueCount: number;
  signedIn: boolean;
}

/**
 * Resolve a single deck (with cards + this viewer's due count) for the given
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
      cards: { orderBy: { position: 'asc' }, select: { id: true, front: true, back: true } },
    },
  });
  if (!deck) return null;
  const isOwner = viewer.id === deck.userId;
  if (!deck.isPublic && !isOwner) return null;

  // Count due cards for this viewer.
  let dueCount = 0;
  if (viewer.id) {
    const cardIds = deck.cards.map((c) => c.id);
    const reviewed = await prisma.flashcardReview.findMany({
      where: { userId: viewer.id, cardId: { in: cardIds } },
      select: { cardId: true, dueAt: true },
    });
    const reviewedMap = new Map(reviewed.map((r) => [r.cardId, r.dueAt]));
    const now = Date.now();
    for (const c of deck.cards) {
      const due = reviewedMap.get(c.id);
      if (!due || due.getTime() <= now) dueCount++;
    }
  }

  return {
    deck: { id: deck.id, title: deck.title, description: deck.description, isPublic: deck.isPublic, isOwner, cardCount: deck.cardCount },
    cards: isOwner ? deck.cards : deck.cards.map((c) => ({ id: c.id, front: c.front, back: c.back })),
    dueCount,
    signedIn: !!viewer.id,
  };
}
