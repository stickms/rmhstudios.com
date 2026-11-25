/**
 * Rating a public flashcard deck (s12-08): the rule, the counters and the two account hooks.
 *
 * A signed-in member who is not the owner or an editor of a public deck, who has a copy of it and has logged at least
 * `MIN_REVIEWS_TO_RATE` reviews on that copy, gives it one to five stars: one rating per member per deck, changeable,
 * removable. `FlashcardDeck.ratingSum` and `ratingCount` change in the same transaction as the `DeckRating` row, under
 * `lockKey(tx, 'deck-ratings:<deckId>')`, so two ratings of one deck serialise and the counters always equal the rows.
 * The same lock covers `copyCount` (`cloneDeck`, `deleteDeck`). Who rated what is never read back to anyone but the
 * member: a deck's payload carries the aggregate only.
 *
 * A deck that is private or taken down by a moderator is not rateable, and a member blocked either way with its owner,
 * banned, or with a deletion pending is refused like the deck were missing or not theirs to rate.
 */
import { Prisma } from '@prisma/client';
import { refusalBody, type ErrorCode } from '@/lib/errors/codes';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { prisma } from '@/lib/prisma.server';
import {
  MIN_REVIEWS_TO_RATE,
  PRIOR_MEAN,
  PRIOR_WEIGHT,
  rateEligibility,
  ratingDisplay,
  type RateEligibility,
  type RatingDisplay,
} from '@/lib/study/deck-ratings';

/** The lock every writer of a deck's `ratingSum`, `ratingCount` and `copyCount` takes first. */
export const deckRatingLockKey = (deckId: string): string => `deck-ratings:${deckId}`;

export type RatingRefusal = { ok: false; status: number; error: string; code: ErrorCode };

const refuse = (code: ErrorCode, status: number): RatingRefusal => ({ ok: false, status, ...refusalBody(code) });

export interface DeckRatingState {
  /** The deck's aggregate: its count and, from three ratings, its average. */
  summary: RatingDisplay;
  /** Copies of the deck that exist now. */
  copies: number;
  /** The viewer's own stars, or null when they have not rated it. */
  stars: number | null;
  /** What the viewer's relation to the deck says about rating it. */
  eligibility: RateEligibility;
  /** Reviews the viewer has logged on their copy; zero without one. */
  reviews: number;
  /** Reviews a rating needs. */
  needed: number;
}

export type RateResult = { ok: true; stars: number | null; summary: RatingDisplay } | RatingRefusal;

const blockedEitherWay = async (a: string, b: string): Promise<boolean> =>
  !!(await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  }));

/** Everything the rule reads about a member and a deck; null when the deck is not one they may meet as a member. */
async function readFacts(userId: string, deckId: string, now: Date) {
  const deck = await prisma.flashcardDeck.findUnique({
    where: { id: deckId },
    select: {
      id: true,
      userId: true,
      isPublic: true,
      moderatedAt: true,
      ratingSum: true,
      ratingCount: true,
      copyCount: true,
    },
  });
  if (!deck || !deck.isPublic || deck.moderatedAt) return null;
  const member = await prisma.user.findUnique({
    where: { id: userId },
    select: { bannedUntil: true, deletionScheduledAt: true },
  });
  const unavailable =
    !member || !!member.deletionScheduledAt || (!!member.bannedUntil && member.bannedUntil.getTime() > now.getTime());
  const isOwner = deck.userId === userId;
  if (!isOwner && (await blockedEitherWay(userId, deck.userId))) return null;
  const [editor, copy, mine] = await Promise.all([
    isOwner
      ? null
      : prisma.deckEditor.findUnique({ where: { deckId_userId: { deckId, userId } }, select: { status: true } }),
    isOwner ? null : prisma.flashcardDeck.findFirst({ where: { userId, clonedFromId: deckId }, select: { id: true } }),
    prisma.deckRating.findUnique({ where: { deckId_userId: { deckId, userId } }, select: { stars: true } }),
  ]);
  const reviews = copy ? await prisma.flashcardReviewLog.count({ where: { userId, deckId: copy.id } }) : 0;
  const eligibility = rateEligibility({
    isOwner,
    isEditor: editor?.status === 'accepted',
    hasCopy: !!copy,
    reviews,
  });
  return { deck, unavailable, eligibility, reviews, stars: mine?.stars ?? null };
}

/** The viewer's side of a deck's ratings (the deck page's "Rate this deck"); null when the deck is not theirs to meet. */
export async function myRating(
  userId: string,
  deckId: string,
  now: Date = new Date(),
): Promise<DeckRatingState | null> {
  const facts = await readFacts(userId, deckId, now);
  if (!facts) return null;
  return {
    summary: ratingDisplay(facts.deck.ratingSum, facts.deck.ratingCount),
    copies: facts.deck.copyCount,
    stars: facts.stars,
    eligibility: facts.unavailable && facts.eligibility === 'ok' ? 'not-studied' : facts.eligibility,
    reviews: facts.reviews,
    needed: MIN_REVIEWS_TO_RATE,
  };
}

/** Give a public deck `stars` (or change the stars already given). */
export async function rateDeck(
  userId: string,
  deckId: string,
  stars: number,
  now: Date = new Date(),
): Promise<RateResult> {
  const facts = await readFacts(userId, deckId, now);
  if (!facts) return refuse('STUDY_DECK_NOT_FOUND', 404);
  if (facts.unavailable) return refuse('FORBIDDEN', 403);
  if (facts.eligibility === 'own' || facts.eligibility === 'editor') return refuse('FORBIDDEN', 403);
  if (facts.eligibility !== 'ok') return refuse('DECK_RATING_NOT_STUDIED', 403);

  const out = await prisma.$transaction(async (tx) => {
    await lockKey(tx, deckRatingLockKey(deckId));
    // The deck is read again under the lock: a moderator or the owner may have taken it out of the marketplace.
    const live = await tx.flashcardDeck.findUnique({
      where: { id: deckId },
      select: { isPublic: true, moderatedAt: true },
    });
    if (!live || !live.isPublic || live.moderatedAt) return null;
    const before = await tx.deckRating.findUnique({
      where: { deckId_userId: { deckId, userId } },
      select: { stars: true },
    });
    await tx.deckRating.upsert({
      where: { deckId_userId: { deckId, userId } },
      create: { deckId, userId, stars },
      update: { stars },
    });
    return tx.flashcardDeck.update({
      where: { id: deckId },
      data: {
        ratingSum: { increment: stars - (before?.stars ?? 0) },
        ratingCount: { increment: before ? 0 : 1 },
      },
      select: { ratingSum: true, ratingCount: true },
    });
  });
  if (!out) return refuse('STUDY_DECK_NOT_FOUND', 404);
  return { ok: true, stars, summary: ratingDisplay(out.ratingSum, out.ratingCount) };
}

/**
 * Take the member's rating back (idempotent: no rating is a success). Allowed on any deck, so a rating can always go,
 * except from a member whose deletion is pending: erasure reads their ratings before its transaction (it cannot take
 * this lock), so from then on the ratings are erasure's alone and a removal here could be subtracted twice.
 */
export async function removeRating(userId: string, deckId: string): Promise<RateResult> {
  const out = await prisma.$transaction(async (tx) => {
    await lockKey(tx, deckRatingLockKey(deckId));
    const member = await tx.user.findUnique({ where: { id: userId }, select: { deletionScheduledAt: true } });
    const before = member?.deletionScheduledAt
      ? null
      : await tx.deckRating.findUnique({
          where: { deckId_userId: { deckId, userId } },
          select: { stars: true },
        });
    if (before) {
      await tx.deckRating.deleteMany({ where: { deckId, userId } });
      await tx.flashcardDeck.updateMany({
        where: { id: deckId, ratingCount: { gt: 0 } },
        data: { ratingSum: { decrement: before.stars }, ratingCount: { decrement: 1 } },
      });
    }
    return tx.flashcardDeck.findUnique({ where: { id: deckId }, select: { ratingSum: true, ratingCount: true } });
  });
  if (!out) return refuse('STUDY_DECK_NOT_FOUND', 404);
  return { ok: true, stars: null, summary: ratingDisplay(out.ratingSum, out.ratingCount) };
}

/**
 * The ids of the public decks that match `where`, best first by the Bayesian score (the SQL form of `bayesianScore`),
 * then by size and recency. Raw SQL because Prisma cannot order by an expression; the table is `flashcard_deck` and the
 * columns are quoted camelCase. `like` is an already-escaped `ILIKE` pattern (or null for no search). Every number is cast:
 * an untyped parameter next to an integer column is inferred as an integer, and the prior's 17.5 is not one.
 */
export function ratedOrderQuery(like: string | null, limit: number): Prisma.Sql {
  const search = like
    ? Prisma.sql`AND ("title" ILIKE ${like} ESCAPE '\\' OR "description" ILIKE ${like} ESCAPE '\\')`
    : Prisma.empty;
  return Prisma.sql`SELECT "id" FROM "flashcard_deck" WHERE "isPublic" = true AND "moderatedAt" IS NULL AND "cardCount" > 0 ${search} ORDER BY (${PRIOR_WEIGHT * PRIOR_MEAN}::float8 + "ratingSum") / (${PRIOR_WEIGHT}::float8 + "ratingCount") DESC, "cardCount" DESC, "updatedAt" DESC, "id" ASC LIMIT ${limit}::int`;
}

/**
 * Account deletion (anonymises in place, so no cascade fires): the member's ratings go and each rated deck's sum and
 * count are corrected by exactly the stars removed, in the erasure transaction. The ratings are read just before it
 * (a member whose deletion is pending cannot rate or change a rating: `rateDeck` refuses them), and the decks
 * themselves stay (`FlashcardDeck: owner`), so `copyCount` is never touched here. A retry finds no rows and changes
 * nothing. Guarded for test proxies, which answer a read with an operation object instead of rows.
 */
export async function deckRatingErasureOps(userId: string) {
  const rows = await prisma.deckRating.findMany({ where: { userId }, select: { deckId: true, stars: true } });
  const ratings = Array.isArray(rows) ? rows : [];
  return [
    ...ratings.map((r) =>
      prisma.flashcardDeck.updateMany({
        where: { id: r.deckId, ratingCount: { gt: 0 } },
        data: { ratingSum: { decrement: r.stars }, ratingCount: { decrement: 1 } },
      }),
    ),
    prisma.deckRating.deleteMany({ where: { userId } }),
  ];
}

/** The member's ratings for the account export: the deck's title, the stars and the dates (never anyone else's). */
export async function exportDeckRatings(userId: string) {
  const rows = await prisma.deckRating.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { stars: true, createdAt: true, updatedAt: true, deck: { select: { title: true } } },
  });
  return rows.map((r) => ({
    deckTitle: r.deck.title,
    stars: r.stars,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/**
 * The first half of deleting a deck of the member's own, inside `tx` (s12-08): when it is a copy, take the lock
 * `cloneDeck` takes before it counts a copy, and answer the source's id (null for a deck that is not a copy or not the
 * member's). `deleteDeck`, which the site route and the developer API share, calls it before its `deleteMany` in both of
 * its branches, then `uncountCopy` once a row was deleted.
 */
export async function lockSourceOfCopy(
  tx: Prisma.TransactionClient,
  userId: string,
  deckId: string,
): Promise<string | null> {
  const own = await tx.flashcardDeck.findFirst({ where: { id: deckId, userId }, select: { clonedFromId: true } });
  const sourceId = own?.clonedFromId ?? null;
  if (sourceId) await lockKey(tx, deckRatingLockKey(sourceId));
  return sourceId;
}

/** A copy is gone: its source's `copyCount` falls by one (floored at zero, a no-op when the source is gone too). */
export async function uncountCopy(tx: Prisma.TransactionClient, sourceId: string | null): Promise<void> {
  if (!sourceId) return;
  await tx.flashcardDeck.updateMany({
    where: { id: sourceId, copyCount: { gt: 0 } },
    data: { copyCount: { decrement: 1 } },
  });
}
