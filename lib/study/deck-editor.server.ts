/**
 * Deck editing: every write checks the deck's owner inside the same query or
 * transaction, so a foreign or missing deck or card is indistinguishable
 * (`not_found`), and `cardCount` moves in the same transaction as the cards.
 *
 * `cardCount` counts AUTHORED cards (what the owner wrote); the 2,000-card cap
 * counts every row, generated siblings included. Every write that adds or
 * regenerates rows takes `lockKey(tx, 'deck-cards:<deckId>')` first, so the cap
 * holds when saves and imports race.
 */
import type { Prisma } from '@prisma/client';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { prisma } from '@/lib/prisma.server';
import {
  isCardKind,
  planRegeneration,
  rowsFor,
  siblingsFor,
  validateCard,
  type CardInput,
  type CardKind,
} from '@/lib/study/card-types';
import { MAX_DECK_CARDS, MAX_IMPORT_CARDS } from '@/lib/study/limits';

export type EditResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; status: 400 | 404; error: string };

const NOT_FOUND = { ok: false, status: 404, error: 'Not found' } as const;
const DECK_FULL = { ok: false, status: 400, error: 'Deck is full' } as const;
const INVALID_CARD = { ok: false, status: 400, error: 'Invalid card' } as const;

const lockDeckCards = (tx: Prisma.TransactionClient, deckId: string) => lockKey(tx, `deck-cards:${deckId}`);

/** A card as the API receives it: the kind is basic when absent. */
export interface CardDraft {
  kind?: CardKind | undefined;
  front: string;
  back?: string | undefined;
}

export async function updateDeck(
  userId: string,
  deckId: string,
  patch: { title?: string; description?: string; isPublic?: boolean },
): Promise<EditResult> {
  const data: { title?: string; description?: string | null; isPublic?: boolean } = {};
  if (patch.title !== undefined) data.title = patch.title;
  // A blank description clears it.
  if (patch.description !== undefined) data.description = patch.description || null;
  if (patch.isPublic !== undefined) data.isPublic = patch.isPublic;
  const { count } = await prisma.flashcardDeck.updateMany({ where: { id: deckId, userId }, data });
  return count === 0 ? NOT_FOUND : { ok: true };
}

/**
 * Insert authored cards after the deck's last row and generate their siblings (the reverse side,
 * one card per cloze deletion). A sibling sits at its source's position so it follows it when the
 * owner reorders. Returns the authored rows. The caller holds the deck lock and has checked the cap.
 */
export async function insertCards(tx: Prisma.TransactionClient, deckId: string, cards: readonly CardInput[]) {
  const last = await tx.flashcard.aggregate({ where: { deckId }, _max: { position: true } });
  const start = (last._max.position ?? -1) + 1;
  const authored = await tx.flashcard.createManyAndReturn({
    data: cards.map((c, i) => ({ deckId, kind: c.kind, front: c.front, back: c.back, position: start + i })),
    select: { id: true, position: true },
  });
  const idAt = new Map(authored.map((row) => [row.position, row.id]));
  const siblings = cards.flatMap((card, i) => {
    const sourceId = idAt.get(start + i);
    if (sourceId === undefined) return [];
    return siblingsFor(card).map((s) => ({
      deckId,
      sourceId,
      kind: s.kind,
      clozeIndex: s.clozeIndex,
      front: s.front,
      back: s.back,
      position: start + i,
    }));
  });
  if (siblings.length > 0) await tx.flashcard.createMany({ data: siblings });
  return authored;
}

/** Validate drafts into authored cards; null when any is invalid. */
function checkDrafts(drafts: readonly CardDraft[]): CardInput[] | null {
  const out: CardInput[] = [];
  for (const draft of drafts) {
    const checked = validateCard(draft);
    if (!checked.ok) return null;
    out.push(checked.card);
  }
  return out;
}

/**
 * Edit an authored card. The row stays, so its reviews do; its siblings are regenerated in place:
 * a surviving index or the reverse keeps its id (and every member's schedule), a dropped one is
 * deleted with its reviews, a new one is created. Generated cards cannot be edited directly.
 */
export async function updateCard(
  userId: string,
  cardId: string,
  patch: { kind?: CardKind | undefined; front?: string | undefined; back?: string | undefined },
): Promise<EditResult> {
  return prisma.$transaction(async (tx) => {
    const owned = { id: cardId, sourceId: null, deck: { userId } };
    const found = await tx.flashcard.findFirst({ where: owned, select: { deckId: true } });
    if (!found) return NOT_FOUND;
    await lockDeckCards(tx, found.deckId);
    const current = await tx.flashcard.findFirst({
      where: owned,
      select: {
        kind: true,
        front: true,
        back: true,
        position: true,
        siblings: { select: { id: true, kind: true, front: true, back: true, clozeIndex: true } },
      },
    });
    if (!current) return NOT_FOUND;

    const checked = validateCard({
      kind: patch.kind ?? (isCardKind(current.kind) ? current.kind : 'basic'),
      front: patch.front ?? current.front,
      back: patch.back ?? current.back,
    });
    if (!checked.ok) return INVALID_CARD;
    const next = checked.card;

    const plan = planRegeneration(current.siblings, siblingsFor(next));
    const rows = await tx.flashcard.count({ where: { deckId: found.deckId } });
    if (rows - plan.remove.length + plan.create.length > MAX_DECK_CARDS) return DECK_FULL;

    await tx.flashcard.update({
      where: { id: cardId },
      data: { kind: next.kind, front: next.front, back: next.back },
    });
    if (plan.remove.length > 0) {
      await tx.flashcard.deleteMany({ where: { id: { in: plan.remove }, sourceId: cardId } });
    }
    for (const row of plan.update) {
      await tx.flashcard.update({ where: { id: row.id }, data: { front: row.front, back: row.back } });
    }
    if (plan.create.length > 0) {
      await tx.flashcard.createMany({
        data: plan.create.map((s) => ({
          deckId: found.deckId,
          sourceId: cardId,
          kind: s.kind,
          clozeIndex: s.clozeIndex,
          front: s.front,
          back: s.back,
          position: current.position,
        })),
      });
    }
    return { ok: true } as const;
  });
}

/** Deletes the authored card (its siblings and every review go with it) and lowers the deck's count. */
export async function deleteCard(userId: string, cardId: string): Promise<EditResult> {
  return prisma.$transaction(async (tx) => {
    const card = await tx.flashcard.findFirst({
      where: { id: cardId, sourceId: null, deck: { userId } },
      select: { deckId: true },
    });
    if (!card) return NOT_FOUND;
    // deleteMany: a concurrent second delete finds nothing and answers 404, not a 500. The siblings
    // go with the card through the foreign key's cascade.
    const { count } = await tx.flashcard.deleteMany({ where: { id: cardId, sourceId: null } });
    if (count === 0) return NOT_FOUND;
    await tx.flashcardDeck.update({
      where: { id: card.deckId },
      data: { cardCount: { decrement: 1 } },
    });
    return { ok: true } as const;
  });
}

/** The card row a client needs after adding one. */
export interface AddedCard {
  id: string;
  front: string;
  back: string;
  kind: string;
  clozeIndex: null;
  sourceId: null;
}

/** Add one card after the current last one, with its generated siblings. Refused when the deck would pass its cap. */
export async function addCard(
  userId: string,
  deckId: string,
  draft: CardDraft,
): Promise<EditResult<{ card: AddedCard }>> {
  const cards = checkDrafts([draft]);
  if (!cards) return INVALID_CARD;
  return prisma.$transaction(async (tx) => {
    await lockDeckCards(tx, deckId);
    const deck = await tx.flashcardDeck.findFirst({ where: { id: deckId, userId }, select: { id: true } });
    if (!deck) return NOT_FOUND;
    const rows = await tx.flashcard.count({ where: { deckId } });
    if (rows + rowsFor(cards[0] as CardInput) > MAX_DECK_CARDS) return DECK_FULL;
    const [row] = await insertCards(tx, deckId, cards);
    await tx.flashcardDeck.update({ where: { id: deckId }, data: { cardCount: { increment: 1 } } });
    const card = cards[0] as CardInput;
    return {
      ok: true,
      card: {
        id: (row as { id: string }).id,
        front: card.front,
        back: card.back,
        kind: card.kind,
        clozeIndex: null,
        sourceId: null,
      },
    } as const;
  });
}

/**
 * Add cards after the current last one. Refused whole when the import is over
 * its size or the deck would pass its cap (generated cards count); nothing is written then.
 */
export async function importCards(
  userId: string,
  deckId: string,
  drafts: readonly CardDraft[],
): Promise<EditResult<{ created: number; cardCount: number }>> {
  if (drafts.length === 0 || drafts.length > MAX_IMPORT_CARDS) {
    return { ok: false, status: 400, error: 'Invalid import' };
  }
  const cards = checkDrafts(drafts);
  if (!cards) return { ok: false, status: 400, error: 'Invalid import' };
  return prisma.$transaction(async (tx) => {
    await lockDeckCards(tx, deckId);
    const deck = await tx.flashcardDeck.findFirst({ where: { id: deckId, userId }, select: { id: true } });
    if (!deck) return NOT_FOUND;
    const rows = await tx.flashcard.count({ where: { deckId } });
    if (rows + cards.reduce((sum, c) => sum + rowsFor(c), 0) > MAX_DECK_CARDS) return DECK_FULL;
    await insertCards(tx, deckId, cards);
    const updated = await tx.flashcardDeck.update({
      where: { id: deckId },
      data: { cardCount: { increment: cards.length } },
      select: { cardCount: true },
    });
    return { ok: true, created: cards.length, cardCount: updated.cardCount } as const;
  });
}

/**
 * `cardIds` must be exactly the deck's authored cards (no more, no fewer, no repeats). A card's
 * generated siblings take its new position, so they stay beside it.
 */
export async function reorderCards(userId: string, deckId: string, cardIds: string[]): Promise<EditResult> {
  return prisma.$transaction(
    async (tx) => {
      const deck = await tx.flashcardDeck.findFirst({
        where: { id: deckId, userId },
        select: { cards: { where: { sourceId: null }, select: { id: true, position: true } } },
      });
      if (!deck) return NOT_FOUND;
      const current = new Map(deck.cards.map((c) => [c.id, c.position]));
      const unique = new Set(cardIds);
      if (
        unique.size !== cardIds.length ||
        cardIds.length !== current.size ||
        !cardIds.every((id) => current.has(id))
      ) {
        return { ok: false, status: 400, error: 'Cards do not match the deck' } as const;
      }
      // Only the cards whose slot changed are written.
      for (const [position, id] of cardIds.entries()) {
        if (current.get(id) !== position) {
          await tx.flashcard.updateMany({ where: { OR: [{ id }, { sourceId: id }] }, data: { position } });
        }
      }
      return { ok: true } as const;
    },
    { timeout: 30_000 },
  );
}
