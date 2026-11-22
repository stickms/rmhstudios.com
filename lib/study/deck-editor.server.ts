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
import { Prisma } from '@prisma/client';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { recordTombstone } from '@/lib/sync/tombstones.server';
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
import { MAX_DECK_CARDS, MAX_DECKS_PER_MEMBER, MAX_IMPORT_CARDS } from '@/lib/study/limits';
import { readOcclusion, sameOcclusion, type Occlusion } from '@/lib/study/occlusion';
import {
  CARD_IMAGE_SELECT,
  cardImageProblem,
  fromColumns,
  hasPictures,
  pictureUrls,
  toColumns,
  type CardImage,
  type CardPictures,
} from '@/lib/study/card-images';
import { attachCardImages, deleteCardImageObjects, releaseCardImages } from '@/lib/study/card-images.server';

export type EditResult<T = object> = ({ ok: true } & T) | { ok: false; status: 400 | 404 | 409; error: string };

const NOT_FOUND = { ok: false, status: 404, error: 'Not found' } as const;
const DECK_FULL = { ok: false, status: 400, error: 'Deck is full' } as const;
const INVALID_CARD = { ok: false, status: 400, error: 'Invalid card' } as const;
/** A picture with no description, a cloze front picture, or an address the flashcard surface never stored. */
const INVALID_PICTURE = { ok: false, status: 400, error: 'Invalid picture' } as const;
const BAD_MEDIA = { ok: false, status: 400, error: 'Upload the picture again' } as const;
const ANIMATED_PICTURE = { ok: false, status: 400, error: 'Use a still picture, not an animated one' } as const;
const PICTURE_LIMIT = { ok: false, status: 409, error: 'Too many cards carry a picture' } as const;

const CONFLICT = { ok: false, status: 409, error: 'External id already used in this deck' } as const;

/** An occlusion card's masks as a Prisma JSON value: absent when there are none (a new row's column stays null). */
const occlusionForCreate = (occlusion: Occlusion | null | undefined) =>
  occlusion ? (occlusion as unknown as Prisma.InputJsonValue) : undefined;
/** The same for an update, where no masks clears the column. */
const occlusionForUpdate = (occlusion: Occlusion | null | undefined) =>
  occlusion ? (occlusion as unknown as Prisma.InputJsonValue) : Prisma.DbNull;

const lockDeckCards = (tx: Prisma.TransactionClient, deckId: string) => lockKey(tx, `deck-cards:${deckId}`);

/** A card as the API receives it: the kind is basic when absent. */
export interface CardDraft {
  kind?: CardKind | undefined;
  front: string;
  back?: string | undefined;
  /** The member's own key for the card (developer API); unique per deck. */
  externalId?: string | undefined;
  /** A picture per side, each with its description (s08-15). Absent or null: none. */
  frontImage?: CardImage | null | undefined;
  backImage?: CardImage | null | undefined;
  /** The masks of an occlusion card (s09-03); checked by `validateCard`, so it may arrive as parsed JSON. */
  occlusion?: unknown;
}

/** A deck as created: the UI may seed it with cards. */
export interface NewDeck {
  title: string;
  description?: string | undefined;
  isPublic?: boolean | undefined;
  cards?: readonly { front: string; back: string }[] | undefined;
}

/** Cheap pre-check so a capped member is refused before any AI generation is spent; `createDeck` still enforces it under the lock. */
export async function atDeckCap(userId: string): Promise<boolean> {
  return (await prisma.flashcardDeck.count({ where: { userId } })) >= MAX_DECKS_PER_MEMBER;
}

/** Create a deck for the member, refused at their deck cap. Seed cards keep the order given. */
export async function createDeck(
  userId: string,
  input: NewDeck,
): Promise<EditResult<{ id: string }> | { ok: false; status: 400; error: string }> {
  const seed = input.cards ?? [];
  return prisma.$transaction(async (tx) => {
    // The cap is a check-then-insert, so concurrent creates serialise per member.
    await lockKey(tx, `decks:${userId}`);
    const count = await tx.flashcardDeck.count({ where: { userId } });
    if (count >= MAX_DECKS_PER_MEMBER) return { ok: false, status: 400, error: 'Too many decks' } as const;
    const deck = await tx.flashcardDeck.create({
      data: {
        userId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        isPublic: input.isPublic ?? false,
        cardCount: seed.length,
        cards: seed.length
          ? { create: seed.map((c, i) => ({ front: c.front, back: c.back, position: i })) }
          : undefined,
      },
      select: { id: true },
    });
    return { ok: true, id: deck.id } as const;
  });
}

/** Delete the member's deck (its cards, reviews and test results go with it). A foreign or missing deck is `not_found`. */
export async function deleteDeck(userId: string, deckId: string): Promise<EditResult> {
  const picturedWhere = {
    deckId,
    sourceId: null,
    deck: { userId },
    OR: [{ frontImageUrl: { not: null } }, { backImageUrl: { not: null } }],
  } satisfies Prisma.FlashcardWhereInput;
  // A deck with no pictures (nearly every deck) is the plain delete it always was.
  const anyPictures =
    ((await prisma.flashcard.findMany({ where: picturedWhere, select: CARD_IMAGE_SELECT, take: 1 })) ?? []).length > 0;
  if (!anyPictures) {
    const { count } = await prisma.flashcardDeck.deleteMany({ where: { id: deckId, userId } });
    if (count === 0) return NOT_FOUND;
    // One deck tombstone; a client drops the deck's cards with it.
    await recordTombstone(prisma, userId, 'deck', deckId);
    return { ok: true };
  }
  const keys = await prisma.$transaction(async (tx) => {
    // Pictures first (read again under the transaction): once the cards are gone, a picture no card shows is deleted
    // with its object, and one a copy still shows is kept.
    const pictured = await tx.flashcard.findMany({ where: picturedWhere, select: CARD_IMAGE_SELECT });
    const { count } = await tx.flashcardDeck.deleteMany({ where: { id: deckId, userId } });
    if (count === 0) return null;
    await recordTombstone(tx, userId, 'deck', deckId);
    return releaseCardImages(
      tx,
      (Array.isArray(pictured) ? pictured : []).flatMap((row) => pictureUrls(row)),
    );
  });
  if (keys === null) return NOT_FOUND;
  await deleteCardImageObjects(keys);
  return { ok: true };
}

export async function updateDeck(
  userId: string,
  deckId: string,
  patch: { title?: string; description?: string; isPublic?: boolean; notifyUpdates?: boolean },
): Promise<EditResult> {
  const data: { title?: string; description?: string | null; isPublic?: boolean; notifyUpdates?: boolean } = {};
  if (patch.title !== undefined) data.title = patch.title;
  // A blank description clears it.
  if (patch.description !== undefined) data.description = patch.description || null;
  if (patch.isPublic !== undefined) data.isPublic = patch.isPublic;
  if (patch.notifyUpdates !== undefined) data.notifyUpdates = patch.notifyUpdates;
  const { count } = await prisma.flashcardDeck.updateMany({ where: { id: deckId, userId }, data });
  return count === 0 ? NOT_FOUND : { ok: true };
}

/** Where a copied card came from; generated siblings never carry it. */
export interface OriginInput {
  originCardId?: string | undefined;
  originHash?: string | undefined;
}

/** Marks the deck's authored cards as changed now, so copies know to look. Not for reorders. */
async function stampCardsChanged(tx: Prisma.TransactionClient, deckId: string) {
  await tx.flashcardDeck.updateMany({ where: { id: deckId }, data: { cardsChangedAt: new Date() } });
}

/**
 * Insert authored cards after the deck's last row and generate their siblings (the reverse side,
 * one card per cloze deletion). A sibling sits at its source's position so it follows it when the
 * owner reorders. Returns the authored rows. The caller holds the deck lock and has checked the cap.
 */
export async function insertCards(
  tx: Prisma.TransactionClient,
  deckId: string,
  cards: readonly (CardInput & OriginInput & CardPictures & { externalId?: string | undefined })[],
) {
  const last = await tx.flashcard.aggregate({ where: { deckId }, _max: { position: true } });
  const start = (last._max.position ?? -1) + 1;
  const authored = await tx.flashcard.createManyAndReturn({
    data: cards.map((c, i) => ({
      deckId,
      kind: c.kind,
      front: c.front,
      back: c.back,
      position: start + i,
      originCardId: c.originCardId ?? null,
      originHash: c.originHash ?? null,
      externalId: c.externalId ?? null,
      occlusion: occlusionForCreate(c.occlusion),
      ...toColumns(c),
    })),
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
  // A deck that already had cards has changed for the copies made from it (`updatedAt` does not move for this).
  if (last._max.position !== null) await stampCardsChanged(tx, deckId);
  return authored;
}

/** Validate drafts into authored cards (their pictures checked too); the failure says which kind of invalid. */
function checkDrafts(
  drafts: readonly CardDraft[],
):
  | { ok: true; cards: (CardInput & CardPictures)[] }
  | { ok: false; error: typeof INVALID_CARD | typeof INVALID_PICTURE } {
  const out: (CardInput & CardPictures)[] = [];
  for (const draft of drafts) {
    const checked = validateCard(draft);
    if (!checked.ok) return { ok: false, error: INVALID_CARD };
    const pictures = { frontImage: draft.frontImage ?? null, backImage: draft.backImage ?? null };
    if (cardImageProblem(checked.card.kind, pictures)) return { ok: false, error: INVALID_PICTURE };
    out.push({ ...checked.card, ...pictures });
  }
  return { ok: true, cards: out };
}

/** The pictures a save of `cards` introduces: their URLs, and how many cards will carry one the member uploaded. */
function picturePlan(cards: readonly CardPictures[]) {
  const urls = cards.flatMap((c) => pictureUrls(toColumns(c)));
  return { urls, adding: cards.filter((c) => hasPictures(toColumns(c))).length };
}

/** Whether the picture refusal is the cap, an animated picture or a picture the member never uploaded. */
const attachFailure = (failure: { code: 'LIMIT' | 'MEDIA_NOT_FOUND' | 'ANIMATED' }) =>
  failure.code === 'LIMIT' ? PICTURE_LIMIT : failure.code === 'ANIMATED' ? ANIMATED_PICTURE : BAD_MEDIA;

/**
 * Edit an authored card. The row stays, so its reviews do; its siblings are regenerated in place:
 * a surviving index or the reverse keeps its id (and every member's schedule), a dropped one is
 * deleted with its reviews, a new one is created. Generated cards cannot be edited directly.
 */
export async function updateCard(userId: string, cardId: string, patch: CardPatch): Promise<EditResult> {
  const released: string[] = [];
  const result = await prisma.$transaction(async (tx) => {
    const done = await updateCardIn(tx, userId, cardId, patch);
    if (done.ok) released.push(...done.released);
    return done.ok ? ({ ok: true } as const) : done;
  });
  await deleteCardImageObjects(released);
  return result;
}

export interface CardPatch {
  kind?: CardKind | undefined;
  front?: string | undefined;
  back?: string | undefined;
  /** A picture to set, `null` to remove it, absent to leave it (s08-15). */
  frontImage?: CardImage | null | undefined;
  backImage?: CardImage | null | undefined;
  /** The masks to set; `null` clears them, absent keeps them (and a card that is no longer occlusion loses them). */
  occlusion?: unknown;
}

/** How `updateCardIn` treats a picture's address: the member's own upload, or one shared from a public source deck. */
export interface UpdateOptions {
  /** The pictures come from the source deck's card (copying, a deck update): their objects are the author's, not claimed. */
  sharedPictures?: boolean;
}

/** `updateCard` inside the caller's transaction (deck sync applies many edits in one). */
export async function updateCardIn(
  tx: Prisma.TransactionClient,
  userId: string,
  cardId: string,
  patch: CardPatch,
  options: UpdateOptions = {},
): Promise<EditResult<{ released: string[] }>> {
  {
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
        originCardId: true,
        occlusion: true,
        ...CARD_IMAGE_SELECT,
        siblings: { select: { id: true, kind: true, front: true, back: true, clozeIndex: true } },
      },
    });
    if (!current) return NOT_FOUND;

    const nextKind = patch.kind ?? (isCardKind(current.kind) ? current.kind : 'basic');
    const checked = validateCard({
      kind: nextKind,
      front: patch.front ?? current.front,
      back: patch.back ?? current.back,
      // The masks stay with an occlusion card; a card changed to another kind drops them.
      occlusion: patch.occlusion !== undefined ? patch.occlusion : nextKind === 'occlusion' ? current.occlusion : null,
    });
    if (!checked.ok) return INVALID_CARD;
    const next = checked.card;

    // Pictures: the stored ones, with the patch laid over them (`null` removes a side), then the same rules as a new card.
    const had = fromColumns(current);
    const pictures = {
      frontImage: patch.frontImage === undefined ? had.frontImage : patch.frontImage,
      backImage: patch.backImage === undefined ? had.backImage : patch.backImage,
    };
    if (cardImageProblem(next.kind, pictures)) return INVALID_PICTURE;
    const nextColumns = toColumns(pictures);
    const before = pictureUrls(current);
    const after = pictureUrls(nextColumns);
    const fresh = after.filter((url) => !before.includes(url));
    if (
      !options.sharedPictures &&
      (fresh.length > 0 || (current.originCardId === null && hasPictures(nextColumns) !== hasPictures(current)))
    ) {
      const attached = await attachCardImages(tx, userId, {
        urls: fresh,
        adding: current.originCardId === null && hasPictures(nextColumns) && !hasPictures(current) ? 1 : 0,
      });
      if (!attached.ok) return attachFailure(attached);
    }

    const plan = planRegeneration(current.siblings, siblingsFor(next));
    const rows = await tx.flashcard.count({ where: { deckId: found.deckId } });
    if (rows - plan.remove.length + plan.create.length > MAX_DECK_CARDS) return DECK_FULL;

    await tx.flashcard.update({
      where: { id: cardId },
      data: {
        kind: next.kind,
        front: next.front,
        back: next.back,
        occlusion: occlusionForUpdate(next.occlusion),
        ...nextColumns,
      },
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
    await stampCardsChanged(tx, found.deckId);
    // A picture this card no longer shows is deleted when no other card (a copy's, say) references it.
    const released = await releaseCardImages(
      tx,
      before.filter((url) => !after.includes(url)),
    );
    return { ok: true, released } as const;
  }
}

/** Deletes the authored card (its siblings and every review go with it) and lowers the deck's count. */
export async function deleteCard(userId: string, cardId: string): Promise<EditResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    const card = await tx.flashcard.findFirst({
      where: { id: cardId, sourceId: null, deck: { userId } },
      select: { deckId: true, ...CARD_IMAGE_SELECT },
    });
    if (!card) return NOT_FOUND;
    // deleteMany: a concurrent second delete finds nothing and answers 404, not a 500. The siblings
    // go with the card through the foreign key's cascade.
    const { count } = await tx.flashcard.deleteMany({ where: { id: cardId, sourceId: null } });
    if (count === 0) return NOT_FOUND;
    await recordTombstone(tx, userId, 'card', cardId);
    await tx.flashcardDeck.update({
      where: { id: card.deckId },
      data: { cardCount: { decrement: 1 }, cardsChangedAt: new Date() },
    });
    return { ok: true, released: await releaseCardImages(tx, pictureUrls(card)) } as const;
  });
  await deleteCardImageObjects(outcome.ok ? outcome.released : []);
  return outcome.ok ? { ok: true } : outcome;
}

/** The card row a client needs after adding one. */
export interface AddedCard {
  id: string;
  front: string;
  back: string;
  kind: string;
  clozeIndex: null;
  sourceId: null;
  frontImage: CardImage | null;
  backImage: CardImage | null;
  occlusion: Occlusion | null;
}

/** Add one card after the current last one, with its generated siblings. Refused when the deck would pass its cap. */
export async function addCard(
  userId: string,
  deckId: string,
  draft: CardDraft,
): Promise<EditResult<{ card: AddedCard }>> {
  const checkedCards = checkDrafts([draft]);
  if (!checkedCards.ok) return checkedCards.error;
  const cards = checkedCards.cards;
  return prisma.$transaction(async (tx) => {
    await lockDeckCards(tx, deckId);
    const deck = await tx.flashcardDeck.findFirst({ where: { id: deckId, userId }, select: { id: true } });
    if (!deck) return NOT_FOUND;
    const rows = await tx.flashcard.count({ where: { deckId } });
    if (rows + rowsFor(cards[0] as CardInput) > MAX_DECK_CARDS) return DECK_FULL;
    const attached = await attachCardImages(tx, userId, picturePlan(cards));
    if (!attached.ok) return attachFailure(attached);
    const [row] = await insertCards(tx, deckId, cards);
    await tx.flashcardDeck.update({
      where: { id: deckId },
      data: { cardCount: { increment: 1 }, cardsChangedAt: new Date() },
    });
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
        frontImage: cards[0]?.frontImage ?? null,
        backImage: cards[0]?.backImage ?? null,
        occlusion: card.occlusion ?? null,
      },
    } as const;
  });
}

/**
 * Add cards after the current last one. Refused whole when the import is over
 * its size or the deck would pass its cap (generated cards count); nothing is written then.
 */
export async function importCardsDetailed(
  userId: string,
  deckId: string,
  drafts: readonly CardDraft[],
  opts: { max?: number } = {},
): Promise<EditResult<{ created: number; cardCount: number; cards: { id: string; position: number }[] }>> {
  if (drafts.length === 0 || drafts.length > (opts.max ?? MAX_IMPORT_CARDS)) {
    return { ok: false, status: 400, error: 'Invalid import' };
  }
  const checked = checkDrafts(drafts);
  if (!checked.ok) return { ok: false, status: 400, error: 'Invalid import' };
  const cards = checked.cards.map((card, i) => ({ ...card, externalId: drafts[i]?.externalId }));
  const keys = cards.flatMap((c) => (c.externalId === undefined ? [] : [c.externalId]));
  if (new Set(keys).size !== keys.length) return CONFLICT;
  return prisma.$transaction(async (tx) => {
    await lockDeckCards(tx, deckId);
    const deck = await tx.flashcardDeck.findFirst({ where: { id: deckId, userId }, select: { id: true } });
    if (!deck) return NOT_FOUND;
    if (keys.length > 0) {
      const taken = await tx.flashcard.count({ where: { deckId, externalId: { in: keys } } });
      if (taken > 0) return CONFLICT;
    }
    const rows = await tx.flashcard.count({ where: { deckId } });
    if (rows + cards.reduce((sum, c) => sum + rowsFor(c), 0) > MAX_DECK_CARDS) return DECK_FULL;
    const attached = await attachCardImages(tx, userId, picturePlan(cards));
    if (!attached.ok) return attachFailure(attached);
    const authored = await insertCards(tx, deckId, cards);
    const updated = await tx.flashcardDeck.update({
      where: { id: deckId },
      data: { cardCount: { increment: cards.length }, cardsChangedAt: new Date() },
      select: { cardCount: true },
    });
    return {
      ok: true,
      created: cards.length,
      cardCount: updated.cardCount,
      cards: [...authored].sort((x, y) => x.position - y.position),
    } as const;
  });
}

/** `importCardsDetailed` without the created rows: what the editor's import answers with. */
export async function importCards(
  userId: string,
  deckId: string,
  drafts: readonly CardDraft[],
): Promise<EditResult<{ created: number; cardCount: number }>> {
  const result = await importCardsDetailed(userId, deckId, drafts);
  return result.ok ? { ok: true, created: result.created, cardCount: result.cardCount } : result;
}

/**
 * Create or update the authored card the member keyed `externalId` in this deck, under the deck lock.
 * The same draft twice changes nothing the second time (`changed: false`, no write, `cardsChangedAt` untouched).
 */
export async function upsertCardByExternalId(
  userId: string,
  deckId: string,
  externalId: string,
  draft: CardDraft,
): Promise<EditResult<{ id: string; created: boolean; changed: boolean }>> {
  const checkedCards = checkDrafts([draft]);
  if (!checkedCards.ok) return checkedCards.error;
  const card = checkedCards.cards[0] as CardInput & CardPictures;
  const released: string[] = [];
  const outcome = await prisma.$transaction(async (tx) => {
    await lockDeckCards(tx, deckId);
    const deck = await tx.flashcardDeck.findFirst({ where: { id: deckId, userId }, select: { id: true } });
    if (!deck) return NOT_FOUND;
    const existing = await tx.flashcard.findFirst({
      where: { deckId, externalId, sourceId: null },
      select: { id: true, kind: true, front: true, back: true, occlusion: true, ...CARD_IMAGE_SELECT },
    });
    if (existing) {
      // A side the draft says nothing about keeps its picture; `null` removes it; a picture replaces it.
      const had = fromColumns(existing);
      const sameSide = (want: CardImage | null | undefined, have: CardImage | null) =>
        want === undefined ||
        (want === null ? have === null : have !== null && have.url === want.url && have.alt === want.alt.trim());
      const unchanged = sameSide(draft.frontImage, had.frontImage) && sameSide(draft.backImage, had.backImage);
      const sameMasks = sameOcclusion(readOcclusion(existing.occlusion), card.occlusion);
      if (
        existing.kind === card.kind &&
        existing.front === card.front &&
        existing.back === card.back &&
        unchanged &&
        sameMasks
      ) {
        return { ok: true, id: existing.id, created: false, changed: false } as const;
      }
      const result = await updateCardIn(tx, userId, existing.id, {
        ...card,
        frontImage: draft.frontImage,
        backImage: draft.backImage,
        occlusion: card.occlusion ?? null,
      });
      if (!result.ok) return result;
      released.push(...result.released);
      return { ok: true, id: existing.id, created: false, changed: true } as const;
    }
    const rows = await tx.flashcard.count({ where: { deckId } });
    if (rows + rowsFor(card) > MAX_DECK_CARDS) return DECK_FULL;
    const attached = await attachCardImages(tx, userId, picturePlan([card]));
    if (!attached.ok) return attachFailure(attached);
    const [row] = await insertCards(tx, deckId, [{ ...card, externalId }]);
    await tx.flashcardDeck.update({
      where: { id: deckId },
      data: { cardCount: { increment: 1 }, cardsChangedAt: new Date() },
    });
    return { ok: true, id: (row as { id: string }).id, created: true, changed: true } as const;
  });
  await deleteCardImageObjects(released);
  return outcome;
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
