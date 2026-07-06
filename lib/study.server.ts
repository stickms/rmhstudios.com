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
