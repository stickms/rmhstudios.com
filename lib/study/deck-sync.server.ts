/**
 * Copied decks and their author's changes: the diff, applying chosen rows, and linking a copy made
 * before origins were recorded. Only the copy's owner reads or applies, and only while the source is
 * still shared (public, its author neither blocked in either direction nor banned).
 *
 * An apply runs in one transaction after `lockKey(tx, 'deck-sync:<deckId>')`, re-reads the source
 * inside it, and updates a card only if its content still hashes to the row's `expectedHash`.
 * Changed cards are edited in place through `updateCardIn`, so the row, its reviews and its
 * siblings' reviews survive. `sourceSyncedAt` moves only when nothing is left pending, because the
 * deck loader skips the diff once the source has not changed since then.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { prisma } from '@/lib/prisma.server';
import { AUTHORED_WHERE, CARD_ORDER } from '@/lib/study/card-query.server';
import { rowsFor, type CardInput } from '@/lib/study/card-types';
import {
  cardHash,
  diffDecks,
  matchByFront,
  pendingCount,
  summaryOf,
  type CopyCard,
  type DeckDiff,
  type SourceCard,
  type UpdatesSummary,
} from '@/lib/study/deck-sync';
import { insertCards, updateCardIn } from '@/lib/study/deck-editor.server';
import { MAX_DECK_CARDS } from '@/lib/study/limits';
import { CARD_IMAGE_SELECT, pictureUrls, toColumns, type CardPictures } from '@/lib/study/card-images';
import { deleteCardImageObjects, lockPictureUrls, releaseCardImages } from '@/lib/study/card-images.server';

type Db = Prisma.TransactionClient | PrismaClient;

const NOT_FOUND = {
  ok: false,
  status: 404,
  error: 'Not found',
} as const;
const EMPTY: DeckDiff = {
  added: [],
  changed: [],
  conflicts: [],
  removed: [],
};

export type SkipReason = 'stale' | 'gone' | 'full';

export interface DeckUpdatesDetail {
  /** `ok`: diff is real. `needs-link`: a deck copied before origins were recorded. `unavailable`: the original is no longer shared. */
  state: 'ok' | 'needs-link' | 'unavailable';
  diff: DeckDiff;
}

export type SyncResult<T> =
  | ({
      ok: true;
    } & T)
  | {
      ok: false;
      status: 404;
      error: string;
    };

interface CopyDeck {
  id: string;
  clonedFromId: string;
  sourceSyncedAt: Date | null;
}

/** The viewer's own copy, or null (not theirs, missing, or not a copy). */
async function ownCopy(db: Db, userId: string, deckId: string): Promise<CopyDeck | null> {
  const deck = await db.flashcardDeck.findFirst({
    where: {
      id: deckId,
      userId,
    },
    select: {
      id: true,
      clonedFromId: true,
      sourceSyncedAt: true,
    },
  });
  if (!deck || !deck.clonedFromId) return null;
  return {
    id: deck.id,
    clonedFromId: deck.clonedFromId,
    sourceSyncedAt: deck.sourceSyncedAt,
  };
}

/** The source deck while it is still shared with this member; null otherwise. */
async function sharedSource(db: Db, userId: string, sourceId: string) {
  const source = await db.flashcardDeck.findUnique({
    where: {
      id: sourceId,
    },
    select: {
      id: true,
      isPublic: true,
      userId: true,
      cardsChangedAt: true,
      user: {
        select: {
          bannedUntil: true,
        },
      },
    },
  });
  if (!source || !source.isPublic) return null;
  if (source.user?.bannedUntil && source.user.bannedUntil.getTime() > Date.now()) return null;
  if ((await getBlockedAuthorIds(userId)).includes(source.userId)) return null;
  return source;
}

const authored = (deckId: string) => ({
  where: {
    deckId,
    ...AUTHORED_WHERE,
  },
  orderBy: CARD_ORDER,
});

async function sourceCards(db: Db, deckId: string): Promise<SourceCard[]> {
  return db.flashcard.findMany({
    ...authored(deckId),
    select: {
      id: true,
      kind: true,
      front: true,
      back: true,
      ...CARD_IMAGE_SELECT,
    },
  });
}

async function copyCards(db: Db, deckId: string): Promise<CopyCard[]> {
  return db.flashcard.findMany({
    ...authored(deckId),
    select: {
      id: true,
      kind: true,
      front: true,
      back: true,
      ...CARD_IMAGE_SELECT,
      originCardId: true,
      originHash: true,
    },
  });
}

const neverLinked = (cards: readonly CopyCard[]) => cards.length > 0 && cards.every((c) => c.originCardId === null);

/**
 * The line on the deck page: null when there is nothing to say. Skips the diff when the source has
 * not had an authored card change since this copy last synced.
 */
export async function deckUpdatesSummary(userId: string, deckId: string): Promise<UpdatesSummary | null> {
  const copy = await ownCopy(prisma, userId, deckId);
  if (!copy) return null;
  const source = await sharedSource(prisma, userId, copy.clonedFromId);
  const none = {
    changed: 0,
    added: 0,
    removed: 0,
    conflicts: 0,
  };
  if (!source)
    return {
      state: 'unavailable',
      ...none,
    };
  const { cardsChangedAt } = source;
  if (cardsChangedAt && copy.sourceSyncedAt && cardsChangedAt.getTime() <= copy.sourceSyncedAt.getTime()) {
    return null;
  }
  const [from, mine] = await Promise.all([sourceCards(prisma, source.id), copyCards(prisma, deckId)]);
  if (neverLinked(mine))
    return {
      state: 'needs-link',
      ...none,
    };
  const diff = diffDecks(from, mine);
  return pendingCount(diff) === 0 ? null : summaryOf(diff);
}

/** The full diff for the dialog. */
export async function deckUpdates(userId: string, deckId: string): Promise<SyncResult<DeckUpdatesDetail>> {
  const copy = await ownCopy(prisma, userId, deckId);
  if (!copy) return NOT_FOUND;
  const source = await sharedSource(prisma, userId, copy.clonedFromId);
  if (!source)
    return {
      ok: true,
      state: 'unavailable',
      diff: EMPTY,
    };
  const [from, mine] = await Promise.all([sourceCards(prisma, source.id), copyCards(prisma, deckId)]);
  if (neverLinked(mine))
    return {
      ok: true,
      state: 'needs-link',
      diff: EMPTY,
    };
  return {
    ok: true,
    state: 'ok',
    diff: diffDecks(from, mine),
  };
}

export type ApplyItem =
  | {
      type: 'new';
      sourceCardId: string;
    }
  | {
      type: 'changed';
      cardId: string;
      expectedHash: string;
    }
  | {
      type: 'conflict';
      cardId: string;
      resolution: 'mine' | 'theirs';
      expectedHash: string;
    }
  | {
      type: 'removed';
      cardId: string;
      expectedHash: string;
    };

export interface ApplyResult {
  applied: number;
  /** Rows skipped because the card changed since the dialog loaded, vanished, or would not fit. */
  skipped: {
    id: string;
    reason: SkipReason;
  }[];
  /** New cards that did not fit under the deck's card cap. */
  leftOut: number;
}

/** Stamp the copy as in step when nothing is left pending. */
async function settle(tx: Db, deckId: string, sourceId: string) {
  const diff = diffDecks(await sourceCards(tx, sourceId), await copyCards(tx, deckId));
  if (pendingCount(diff) === 0) {
    await tx.flashcardDeck.updateMany({
      where: {
        id: deckId,
      },
      data: {
        sourceSyncedAt: new Date(),
      },
    });
  }
}

export async function applyUpdates(
  userId: string,
  deckId: string,
  items: readonly ApplyItem[],
): Promise<SyncResult<ApplyResult>> {
  // Declared outside the transaction so the objects can be deleted after the commit, never on a rollback.
  const deleteAfterCommit: { keys: string[] } = { keys: [] };
  const outcome = await prisma.$transaction(
    async (tx) => {
      await lockKey(tx, `deck-sync:${deckId}`);
      const copy = await ownCopy(tx, userId, deckId);
      if (!copy) return NOT_FOUND;
      const source = await sharedSource(tx, userId, copy.clonedFromId);
      if (!source) return NOT_FOUND;

      const from = new Map((await sourceCards(tx, source.id)).map((c) => [c.id, c]));
      const mine = new Map((await copyCards(tx, deckId)).map((c) => [c.id, c]));
      const claimed = new Set([...mine.values()].map((c) => c.originCardId));
      let rows = await tx.flashcard.count({
        where: {
          deckId,
        },
      });
      const result: ApplyResult = {
        applied: 0,
        skipped: [],
        leftOut: 0,
      };
      const skip = (id: string, reason: SkipReason) =>
        result.skipped.push({
          id,
          reason,
        });
      const seen = new Set<string>();
      // Objects of pictures this apply left unreferenced, deleted once it has committed.
      const droppedKeys: string[] = [];
      const fresh: (CardInput &
        CardPictures & {
          originCardId: string;
          originHash: string;
        })[] = [];
      let removedCount = 0;

      for (const item of items) {
        const key = item.type === 'new' ? `new:${item.sourceCardId}` : `card:${item.cardId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (item.type === 'new') {
          const src = from.get(item.sourceCardId);
          if (!src || claimed.has(src.id)) {
            skip(src?.id ?? item.sourceCardId, 'gone');
            continue;
          }
          const card = diffDecks([src], []).added[0]?.card;
          if (!card) continue;
          if (rows + rowsFor(card) > MAX_DECK_CARDS) {
            result.leftOut++;
            continue;
          }
          rows += rowsFor(card);
          claimed.add(src.id);
          fresh.push({
            ...card,
            originCardId: src.id,
            originHash: cardHash(src),
          });
          continue;
        }

        const card = mine.get(item.cardId);
        if (!card || card.originCardId === null) {
          skip(item.cardId, 'gone');
          continue;
        }
        if (cardHash(card) !== item.expectedHash) {
          skip(item.cardId, 'stale');
          continue;
        }
        const src = from.get(card.originCardId);

        if (item.type === 'removed') {
          if (src) {
            skip(item.cardId, 'stale');
            continue;
          }
          const { count } = await tx.flashcard.deleteMany({
            where: {
              id: card.id,
              deckId,
              sourceId: null,
            },
          });
          if (count > 0) {
            removedCount++;
            result.applied++;
            droppedKeys.push(...(await releaseCardImages(tx, pictureUrls(card))));
          }
          continue;
        }

        if (!src) {
          skip(item.cardId, 'gone');
          continue;
        }
        if (item.type === 'conflict' && item.resolution === 'mine') {
          // Keep mine: settled until the source changes again.
          await tx.flashcard.update({
            where: {
              id: card.id,
            },
            data: {
              originHash: cardHash(src),
            },
          });
          result.applied++;
          continue;
        }
        const next = diffDecks([src], []).added[0]?.card;
        if (!next) continue;
        // The author's pictures are shared, not copied: same URLs, no claim on the member's uploads.
        const theirPictures = toColumns(next);
        await lockPictureUrls(tx, pictureUrls(theirPictures));
        const edited = await updateCardIn(
          tx,
          userId,
          card.id,
          {
            ...next,
            frontImage: next.frontImage ?? null,
            backImage: next.backImage ?? null,
          },
          {
            sharedPictures: true,
          },
        );
        if (!edited.ok) {
          skip(item.cardId, 'full');
          continue;
        }
        droppedKeys.push(...edited.released);
        await tx.flashcard.update({
          where: {
            id: card.id,
          },
          data: {
            originHash: cardHash(src),
          },
        });
        result.applied++;
      }

      if (fresh.length > 0) {
        await lockPictureUrls(
          tx,
          fresh.flatMap((c) => pictureUrls(toColumns(c))),
        );
        await insertCards(tx, deckId, fresh);
        result.applied += fresh.length;
      }
      if (fresh.length > 0 || removedCount > 0) {
        await tx.flashcardDeck.update({
          where: {
            id: deckId,
          },
          data: {
            cardCount: {
              increment: fresh.length - removedCount,
            },
            cardsChangedAt: new Date(),
          },
        });
      }
      await settle(tx, deckId, source.id);
      deleteAfterCommit.keys = droppedKeys;
      return {
        ok: true,
        ...result,
      } as const;
    },
    {
      timeout: 30_000,
    },
  );
  await deleteCardImageObjects(deleteAfterCommit.keys);
  return outcome;
}

/**
 * One-time link for a copy made before origins were recorded: each card with no origin takes the
 * first unclaimed source card with exactly the same front. A linked card's hash is its own current
 * content, so an author's different wording shows as a change (never a conflict); unmatched cards
 * stay the member's own.
 */
export async function linkToOriginal(
  userId: string,
  deckId: string,
): Promise<
  SyncResult<{
    linked: number;
    unmatched: number;
  }>
> {
  return prisma.$transaction(
    async (tx) => {
      await lockKey(tx, `deck-sync:${deckId}`);
      const copy = await ownCopy(tx, userId, deckId);
      if (!copy) return NOT_FOUND;
      const source = await sharedSource(tx, userId, copy.clonedFromId);
      if (!source) return NOT_FOUND;
      const [from, mine] = await Promise.all([sourceCards(tx, source.id), copyCards(tx, deckId)]);
      const matches = matchByFront(from, mine);
      const byId = new Map(mine.map((c) => [c.id, c]));
      let linked = 0;
      for (const match of matches) {
        const card = byId.get(match.cardId);
        if (!card) continue;
        // Compare-and-set: a card linked meanwhile is left alone.
        const { count } = await tx.flashcard.updateMany({
          where: {
            id: card.id,
            deckId,
            originCardId: null,
          },
          data: {
            originCardId: match.sourceCardId,
            originHash: cardHash(card),
          },
        });
        linked += count;
      }
      const unlinked = mine.filter((c) => c.originCardId === null).length;
      await settle(tx, deckId, source.id);
      return {
        ok: true,
        linked,
        unmatched: unlinked - linked,
      } as const;
    },
    {
      timeout: 30_000,
    },
  );
}
