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
import { refusalBody } from '@/lib/errors/codes';
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
import { isDeckLanguageTag } from '@/lib/study/listen';
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
import {
  CARD_SOUND_SELECT,
  cardSoundProblem,
  fromSoundColumns,
  hasSounds,
  soundUrls,
  toSoundColumns,
  type CardSound,
  type CardSounds,
} from '@/lib/study/card-sound';
import { attachCardSounds, releaseCardSounds } from '@/lib/study/card-sound.server';
import { deckRole, requireDeckRole } from '@/lib/study/deck-access.server';
import { lockSourceOfCopy, uncountCopy } from '@/lib/study/deck-ratings.server';
import type { DeckRole } from '@/lib/study/deck-access';

export type EditResult<T = object> = ({ ok: true } & T) | { ok: false; status: 400 | 404 | 409; error: string };

const INVALID_LANGUAGE = { ok: false, status: 400, ...refusalBody('INVALID_INPUT') } as const;
const NOT_FOUND = { ok: false, status: 404, error: 'Not found' } as const;
/** s12-16: a moderator took the deck down, so the owner cannot make it public again. */
const REMOVED_BY_MODERATOR = { ok: false, status: 409, ...refusalBody('CONTENT_REMOVED_BY_MODERATOR') } as const;
const DECK_FULL = { ok: false, status: 400, ...refusalBody('STUDY_DECK_FULL') } as const;
const INVALID_CARD = { ok: false, status: 400, ...refusalBody('STUDY_CARD_INVALID') } as const;
/** A picture with no description, a cloze front picture, or an address the flashcard surface never stored. */
const INVALID_PICTURE = { ok: false, status: 400, ...refusalBody('STUDY_PICTURE_INVALID') } as const;
const BAD_MEDIA = { ok: false, status: 400, ...refusalBody('STUDY_PICTURE_REUPLOAD') } as const;
const ANIMATED_PICTURE = { ok: false, status: 400, ...refusalBody('STUDY_PICTURE_ANIMATED') } as const;
const PICTURE_LIMIT = { ok: false, status: 409, ...refusalBody('STUDY_PICTURE_CARD_LIMIT') } as const;
/** A sound with no transcript, a cloze or occlusion front sound, or an address the sound upload never stored (s10-02). */
const INVALID_SOUND = { ok: false, status: 400, ...refusalBody('STUDY_SOUND_INVALID') } as const;
const BAD_SOUND_MEDIA = { ok: false, status: 400, ...refusalBody('STUDY_SOUND_REUPLOAD') } as const;
const SOUND_LIMIT = { ok: false, status: 409, ...refusalBody('STUDY_SOUND_CARD_LIMIT') } as const;

const CONFLICT = { ok: false, status: 409, error: 'External id already used in this deck' } as const;

/** An occlusion card's masks as a Prisma JSON value: absent when there are none (a new row's column stays null). */
const occlusionForCreate = (occlusion: Occlusion | null | undefined) =>
  occlusion ? (occlusion as unknown as Prisma.InputJsonValue) : undefined;
/** The same for an update, where no masks clears the column. */
const occlusionForUpdate = (occlusion: Occlusion | null | undefined) =>
  occlusion ? (occlusion as unknown as Prisma.InputJsonValue) : Prisma.DbNull;

/**
 * What an editor may not write (s11-10): a sound is heard by its recorder only, so a card an editor adds carries none
 * and a card an editor saves keeps the sounds it has. The fields are dropped, not refused, so the editor's form need
 * not know; the owner's draft passes through untouched.
 */
function withoutSoundsFor<T extends CardSounds>(role: DeckRole, card: T): T {
  if (role === 'owner') return card;
  const { frontSound: _front, backSound: _back, ...rest } = card;
  return rest as T;
}

/** The per-deck lock every write to a deck's rows takes; one definition, shared with `highlight-cards.server.ts`. */
export const lockDeckCards = (tx: Prisma.TransactionClient, deckId: string) => lockKey(tx, `deck-cards:${deckId}`);

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
  /** A recorded sound per side with its transcript (s10-02); the owner's own, never carried by a copy. */
  frontSound?: CardSound | null | undefined;
  backSound?: CardSound | null | undefined;
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
    if (count >= MAX_DECKS_PER_MEMBER) return { ok: false, status: 400, ...refusalBody('STUDY_DECK_LIMIT') } as const;
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
  const soundedWhere = {
    deckId,
    sourceId: null,
    deck: { userId },
    OR: [{ frontSoundUrl: { not: null } }, { backSoundUrl: { not: null } }],
  } satisfies Prisma.FlashcardWhereInput;
  // A deck with no pictures or sounds (nearly every deck) is the plain delete it always was.
  const anyPictures =
    ((await prisma.flashcard.findMany({ where: picturedWhere, select: CARD_IMAGE_SELECT, take: 1 })) ?? []).length > 0;
  const anySounds =
    ((await prisma.flashcard.findMany({ where: soundedWhere, select: CARD_SOUND_SELECT, take: 1 })) ?? []).length > 0;
  if (!anyPictures && !anySounds) {
    // A copy also takes one off its source's `copyCount`, so the delete is a transaction here too (s12-08).
    const deleted = await prisma.$transaction(async (tx) => {
      const sourceId = await lockSourceOfCopy(tx, userId, deckId);
      const { count } = await tx.flashcardDeck.deleteMany({ where: { id: deckId, userId } });
      if (count === 0) return false;
      await uncountCopy(tx, sourceId);
      // One deck tombstone; a client drops the deck's cards with it.
      await recordTombstone(tx, userId, 'deck', deckId);
      return true;
    });
    return deleted ? { ok: true } : NOT_FOUND;
  }
  const keys = await prisma.$transaction(async (tx) => {
    // Pictures first (read again under the transaction): once the cards are gone, a picture no card shows is deleted
    // with its object, and one a copy still shows is kept.
    const pictured = await tx.flashcard.findMany({ where: picturedWhere, select: CARD_IMAGE_SELECT });
    // Sounds are one object per side: they go with their cards (s10-02).
    const sounded = await tx.flashcard.findMany({ where: soundedWhere, select: CARD_SOUND_SELECT });
    const sourceId = await lockSourceOfCopy(tx, userId, deckId);
    const { count } = await tx.flashcardDeck.deleteMany({ where: { id: deckId, userId } });
    if (count === 0) return null;
    await uncountCopy(tx, sourceId);
    await recordTombstone(tx, userId, 'deck', deckId);
    return [
      ...(await releaseCardImages(
        tx,
        (Array.isArray(pictured) ? pictured : []).flatMap((row) => pictureUrls(row)),
      )),
      ...(await releaseCardSounds(
        tx,
        userId,
        (Array.isArray(sounded) ? sounded : []).flatMap((row) => soundUrls(row)),
      )),
    ];
  });
  if (keys === null) return NOT_FOUND;
  await deleteCardImageObjects(keys);
  return { ok: true };
}

export async function updateDeck(
  userId: string,
  deckId: string,
  patch: {
    title?: string;
    description?: string;
    isPublic?: boolean;
    notifyUpdates?: boolean;
    acceptsSuggestions?: boolean;
    frontLang?: string | null;
    backLang?: string | null;
  },
): Promise<EditResult> {
  const data: {
    title?: string;
    description?: string | null;
    isPublic?: boolean;
    notifyUpdates?: boolean;
    acceptsSuggestions?: boolean;
    frontLang?: string | null;
    backLang?: string | null;
  } = {};
  if (patch.title !== undefined) data.title = patch.title;
  // A blank description clears it.
  if (patch.description !== undefined) data.description = patch.description || null;
  if (patch.isPublic !== undefined) data.isPublic = patch.isPublic;
  if (patch.notifyUpdates !== undefined) data.notifyUpdates = patch.notifyUpdates;
  if (patch.acceptsSuggestions !== undefined) data.acceptsSuggestions = patch.acceptsSuggestions;
  // Checked again here, so no caller (only the route does today) can store a tag Listen cannot read.
  for (const lang of [patch.frontLang, patch.backLang]) {
    if (lang !== undefined && lang !== null && !isDeckLanguageTag(lang)) return INVALID_LANGUAGE;
  }
  if (patch.frontLang !== undefined) data.frontLang = patch.frontLang;
  if (patch.backLang !== undefined) data.backLang = patch.backLang;
  // s12-16 member-reports: while a moderator's takedown stands, "public" is refused. The condition is part of the same
  // conditional write, so a takedown that lands between a read and this write is still honoured.
  const wantsPublic = patch.isPublic === true;
  const { count } = wantsPublic
    ? await prisma.flashcardDeck.updateMany({ where: { id: deckId, userId, moderatedAt: null }, data })
    : await prisma.flashcardDeck.updateMany({ where: { id: deckId, userId }, data });
  if (count > 0) return { ok: true };
  if (wantsPublic) {
    const removed = await prisma.flashcardDeck.findFirst({
      where: { id: deckId, userId, moderatedAt: { not: null } },
      select: { id: true },
    });
    if (removed) return REMOVED_BY_MODERATOR;
  }
  return NOT_FOUND;
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
  cards: readonly (CardInput & OriginInput & CardPictures & CardSounds & { externalId?: string | undefined })[],
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
      // Only a card the member just recorded a sound for writes these columns: a copy and a sync never do.
      ...(c.frontSound || c.backSound ? toSoundColumns(c) : {}),
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
  | { ok: true; cards: (CardInput & CardPictures & CardSounds)[] }
  | { ok: false; error: typeof INVALID_CARD | typeof INVALID_PICTURE | typeof INVALID_SOUND } {
  const out: (CardInput & CardPictures & CardSounds)[] = [];
  for (const draft of drafts) {
    const checked = validateCard(draft);
    if (!checked.ok) return { ok: false, error: INVALID_CARD };
    const pictures = { frontImage: draft.frontImage ?? null, backImage: draft.backImage ?? null };
    if (cardImageProblem(checked.card.kind, pictures)) return { ok: false, error: INVALID_PICTURE };
    // A sound field is carried only when the draft names one, so a draft that says nothing about sounds (the
    // developer API's upserts) never reads as "remove the sound" further down.
    const sounds = {
      ...(draft.frontSound ? { frontSound: draft.frontSound } : {}),
      ...(draft.backSound ? { backSound: draft.backSound } : {}),
    };
    if (cardSoundProblem(checked.card.kind, sounds)) return { ok: false, error: INVALID_SOUND };
    out.push({ ...checked.card, ...pictures, ...sounds });
  }
  return { ok: true, cards: out };
}

/** The pictures a save of `cards` introduces: their URLs, and how many cards will carry one the member uploaded. */
function picturePlan(cards: readonly CardPictures[]) {
  const urls = cards.flatMap((c) => pictureUrls(toColumns(c)));
  return { urls, adding: cards.filter((c) => hasPictures(toColumns(c))).length };
}

/** The sounds a save of `cards` introduces: their URLs, and how many cards will carry one. */
function soundPlan(cards: readonly CardSounds[]) {
  const columns = cards.map((c) => toSoundColumns(c));
  return { urls: columns.flatMap((c) => soundUrls(c)), adding: columns.filter((c) => hasSounds(c)).length };
}

const soundFailure = (failure: { code: 'LIMIT' | 'MEDIA_NOT_FOUND' }) =>
  failure.code === 'LIMIT' ? SOUND_LIMIT : BAD_SOUND_MEDIA;

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
  /** A sound to set, `null` to remove it, absent to leave it (s10-02). Copies and deck sync never send one. */
  frontSound?: CardSound | null | undefined;
  backSound?: CardSound | null | undefined;
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
    const owned = { id: cardId, sourceId: null };
    const found = await tx.flashcard.findFirst({ where: owned, select: { deckId: true } });
    if (!found) return NOT_FOUND;
    // The owner and an accepted editor may edit a card; anyone else finds nothing (s11-10).
    const role = await deckRole(userId, found.deckId, tx);
    if (!role) return NOT_FOUND;
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
        ...CARD_SOUND_SELECT,
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

    // Sounds (s10-02): the stored ones with the patch laid over them, the same rules as a new card. A patch with no
    // sound field (every copy and deck-sync edit) leaves the six columns alone, and writes nothing to them.
    const soundsTouched = role === 'owner' && (patch.frontSound !== undefined || patch.backSound !== undefined);
    const hadSounds = fromSoundColumns(current);
    // An editor's sound fields are ignored outright: the card keeps what it has, so nothing is attached or released.
    const sounds =
      role === 'owner'
        ? {
            frontSound: patch.frontSound === undefined ? hadSounds.frontSound : patch.frontSound,
            backSound: patch.backSound === undefined ? hadSounds.backSound : patch.backSound,
          }
        : hadSounds;
    // An editor never touches a card's sounds (they are the owner's), so what the card already holds is not theirs to judge.
    if (role === 'owner' && cardSoundProblem(next.kind, sounds)) return INVALID_SOUND;
    const nextSoundColumns = toSoundColumns(sounds);
    const soundsBefore = soundUrls(current);
    const soundsAfter = soundUrls(nextSoundColumns);
    const freshSounds = soundsAfter.filter((url) => !soundsBefore.includes(url));
    if (soundsTouched && (freshSounds.length > 0 || hasSounds(nextSoundColumns) !== hasSounds(current))) {
      const attachedSounds = await attachCardSounds(tx, userId, {
        urls: freshSounds,
        adding: hasSounds(nextSoundColumns) && !hasSounds(current) ? 1 : 0,
      });
      if (!attachedSounds.ok) return soundFailure(attachedSounds);
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
        ...(soundsTouched ? nextSoundColumns : {}),
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
    // A sound this card no longer shows is its own object: it goes (s10-02).
    released.push(
      ...(await releaseCardSounds(
        tx,
        userId,
        soundsBefore.filter((url) => !soundsAfter.includes(url)),
      )),
    );
    return { ok: true, released } as const;
  }
}

/** Deletes the authored card (its siblings and every review go with it) and lowers the deck's count. */
export async function deleteCard(userId: string, cardId: string): Promise<EditResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    const card = await tx.flashcard.findFirst({
      where: { id: cardId, sourceId: null },
      select: { deckId: true, deck: { select: { userId: true } }, ...CARD_IMAGE_SELECT, ...CARD_SOUND_SELECT },
    });
    if (!card) return NOT_FOUND;
    if (!(await deckRole(userId, card.deckId, tx))) return NOT_FOUND;
    // deleteMany: a concurrent second delete finds nothing and answers 404, not a 500. The siblings
    // go with the card through the foreign key's cascade.
    const { count } = await tx.flashcard.deleteMany({ where: { id: cardId, sourceId: null } });
    if (count === 0) return NOT_FOUND;
    // The tombstone is the deck owner's (their sync reads it), whoever deleted the card.
    await recordTombstone(tx, card.deck.userId, 'card', cardId);
    await tx.flashcardDeck.update({
      where: { id: card.deckId },
      data: { cardCount: { decrement: 1 }, cardsChangedAt: new Date() },
    });
    const released = await releaseCardImages(tx, pictureUrls(card));
    // The card's own sounds go with it (s10-02).
    // The recordings are the deck owner's, whoever deletes the card.
    released.push(...(await releaseCardSounds(tx, card.deck.userId, soundUrls(card))));
    return { ok: true, released } as const;
  });
  await deleteCardImageObjects(outcome.ok ? outcome.released : []);
  return outcome.ok ? { ok: true } : outcome;
}

const normalizeSoundOf = (sound: CardSound): CardSound => ({ ...sound, transcript: sound.transcript.trim() });

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
  /** The sounds the owner just saved; absent when the card has none (s10-02). */
  frontSound?: CardSound;
  backSound?: CardSound;
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
  return prisma.$transaction(async (tx) => {
    await lockDeckCards(tx, deckId);
    const role = await deckRole(userId, deckId, tx);
    if (!role) return NOT_FOUND;
    const cards = checkedCards.cards.map((c) => withoutSoundsFor(role, c));
    const rows = await tx.flashcard.count({ where: { deckId } });
    if (rows + rowsFor(cards[0] as CardInput) > MAX_DECK_CARDS) return DECK_FULL;
    const attached = await attachCardImages(tx, userId, picturePlan(cards));
    if (!attached.ok) return attachFailure(attached);
    const attachedSounds = await attachCardSounds(tx, userId, soundPlan(cards));
    if (!attachedSounds.ok) return soundFailure(attachedSounds);
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
        ...(cards[0]?.frontSound ? { frontSound: normalizeSoundOf(cards[0].frontSound) } : {}),
        ...(cards[0]?.backSound ? { backSound: normalizeSoundOf(cards[0].backSound) } : {}),
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
    return { ok: false, status: 400, ...refusalBody('STUDY_IMPORT_INVALID') };
  }
  const checked = checkDrafts(drafts);
  if (!checked.ok) return { ok: false, status: 400, ...refusalBody('STUDY_IMPORT_INVALID') };
  return prisma.$transaction(async (tx) => {
    await lockDeckCards(tx, deckId);
    const role = await deckRole(userId, deckId, tx);
    if (!role) return NOT_FOUND;
    // An editor's cards carry no sound and no key of their own (`externalId` is the owner's script's).
    const cards = checked.cards.map((card, i) => ({
      ...withoutSoundsFor(role, card),
      externalId: role === 'owner' ? drafts[i]?.externalId : undefined,
    }));
    const keys = cards.flatMap((c) => (c.externalId === undefined ? [] : [c.externalId]));
    if (new Set(keys).size !== keys.length) return CONFLICT;
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
    // Keyed upserts are the developer API's, which is the owner's alone.
    if (!(await requireDeckRole(userId, deckId, ['owner'], tx))) return NOT_FOUND;
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
      if (!(await deckRole(userId, deckId, tx))) return NOT_FOUND;
      const deck = await tx.flashcardDeck.findFirst({
        where: { id: deckId },
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
