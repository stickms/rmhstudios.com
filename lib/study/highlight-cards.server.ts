/**
 * Cards from reading highlights (s10-01), server only. One call makes up to 50 cards in one deck, in one transaction
 * that takes the same per-deck lock every other deck write takes, so the 2,000-row cap holds when this races an
 * import or an edit. Ownership of both sides is read inside the transaction; the passage is never trusted from the
 * request, only checked against the stored highlight, and the card is built from the stored text by the pure module.
 */
import { refusalBody } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { documentTitles } from '@/lib/reading/highlights.server';
import { insertCards, lockDeckCards, type EditResult } from '@/lib/study/deck-editor.server';
import { rowsFor, validateCard, type CardInput } from '@/lib/study/card-types';
import { draftFromItem, MAX_HIGHLIGHT_CARD_BATCH, type HighlightCardItem } from '@/lib/study/highlight-cards';
import { MAX_DECK_CARDS } from '@/lib/study/limits';

const NOT_FOUND = { ok: false, status: 404, error: 'Not found' } as const;
const DECK_FULL = { ok: false, status: 400, ...refusalBody('STUDY_DECK_FULL') } as const;
const INVALID = { ok: false, status: 400, ...refusalBody('STUDY_CARD_INVALID') } as const;

export interface HighlightCardsMade {
  created: number;
  cardCount: number;
  /** One per item, in the request's order. */
  cards: { cardId: string; highlightId: string }[];
}

/**
 * Check every highlight is the member's, the deck is theirs and has room (generated cloze siblings count), the
 * passages are parts of their highlights, then write the cards and their links together. All or nothing.
 */
export async function createCardsFromHighlights(
  userId: string,
  deckId: string,
  items: readonly HighlightCardItem[],
): Promise<EditResult<HighlightCardsMade>> {
  if (items.length === 0 || items.length > MAX_HIGHLIGHT_CARD_BATCH) return INVALID;
  const ids = [...new Set(items.map((i) => i.highlightId))];
  return prisma.$transaction(async (tx) => {
    await lockDeckCards(tx, deckId);
    const deck = await tx.flashcardDeck.findFirst({ where: { id: deckId, userId }, select: { id: true } });
    if (!deck) return NOT_FOUND;
    const found = await tx.readingHighlight.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, exact: true, docKind: true, docKey: true },
    });
    const rows = Array.isArray(found) ? found : [];
    // A foreign or missing highlight is indistinguishable: nothing is written.
    if (rows.length !== ids.length) return NOT_FOUND;
    const byId = new Map(rows.map((r) => [r.id, r]));
    const titles = await documentTitles(rows);

    const cards: CardInput[] = [];
    for (const item of items) {
      const row = byId.get(item.highlightId);
      if (!row) return NOT_FOUND;
      const made = draftFromItem(item, { exact: row.exact, title: titles.get(`${row.docKind}:${row.docKey}`) ?? null });
      if (!made.ok) return INVALID;
      const checked = validateCard(made.draft);
      if (!checked.ok) return INVALID;
      cards.push(checked.card);
    }

    const existing = await tx.flashcard.count({ where: { deckId } });
    if (existing + cards.reduce((sum, c) => sum + rowsFor(c), 0) > MAX_DECK_CARDS) return DECK_FULL;

    const authored = await insertCards(
      tx,
      deckId,
      cards.map((c) => ({ ...c, frontImage: null, backImage: null })),
    );
    // `insertCards` numbers the authored rows from one past the deck's last position, in the order given.
    const inOrder = [...authored].sort((a, b) => a.position - b.position);
    const links = inOrder.map((row, i) => ({
      cardId: row.id,
      highlightId: (items[i] as HighlightCardItem).highlightId,
    }));
    await tx.highlightCardLink.createMany({ data: links });
    const updated = await tx.flashcardDeck.update({
      where: { id: deckId },
      data: { cardCount: { increment: cards.length }, cardsChangedAt: new Date() },
      select: { cardCount: true },
    });
    return { ok: true, created: cards.length, cardCount: updated.cardCount, cards: links } as const;
  });
}
