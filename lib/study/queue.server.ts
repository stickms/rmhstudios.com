/**
 * The cross-deck review queue, per-member suspension and the due counts that exclude suspended cards.
 * Suspension lives on the member's `FlashcardReview` row (`suspendedAt`, `suspendReason`); a card with no row
 * is suspended by creating one with the default schedule. Every count and queue here applies
 * `ACTIVE_REVIEW_WHERE`, or `"suspendedAt" IS NULL` in raw SQL (registry: `DUE_COUNT_READ_PATHS`).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { isCardKind } from '@/lib/study/card-types';
import { ACTIVE_REVIEW_WHERE, CARD_ORDER, REVIEWABLE_WHERE } from '@/lib/study/card-query.server';
import { LEECH_RESET, NEW_PER_SESSION, SESSION_MAX, type QueueCard, type SuspendReason } from '@/lib/study/queue';
import type { ReviewQueueRes } from '@/lib/study/queue.contract';

import { CARD_IMAGE_SELECT, picturesOfRow } from '@/lib/study/card-images';
import { CARD_SOUND_SELECT, soundFields, soundsOfRow } from '@/lib/study/card-sound';
import { reviewDataFor } from '@/lib/study/occlusion';
import { applyAllowances, dayStartUtc, isPaced, newAllowance, todayKey, zoneOrUtc } from '@/lib/study/pace';
import { newIntroducedToday } from '@/lib/study/pace.server';
import { readDeckLanguage } from '@/lib/study/listen';
import { activeEditorSql, canReadDeck, readableDeckWhere, studiedDeckWhere } from '@/lib/study/deck-access.server';

const EXPORT_CAP = 50_000;

const cardSelect = {
  id: true,
  front: true,
  back: true,
  kind: true,
  sourceId: true,
  clozeIndex: true,
  deckId: true,
  ...CARD_IMAGE_SELECT,
  ...CARD_SOUND_SELECT,
  // A generated card shows its source's pictures; the siblings hold none of their own.
  // An occlusion card also reads its masks and note from the source. Sounds follow, for the deck's owner only (s10-02).
  source: {
    select: { ...CARD_IMAGE_SELECT, ...CARD_SOUND_SELECT, occlusion: true, back: true },
  },
  deck: {
    select: {
      title: true,
      userId: true,
      frontLang: true,
      backLang: true,
    },
  },
} satisfies Prisma.FlashcardSelect;

/**
 * The never-reviewed cards also read their deck's pace (s10-03). A deck with no pace (`newPerDay` null) is the
 * session rule exactly as before.
 */
const freshSelect = {
  ...cardSelect,
  // Replaces cardSelect's `deck`, so it repeats `userId`: without it a new card's sound never reached its owner.
  deck: {
    select: {
      title: true,
      userId: true,
      frontLang: true,
      backLang: true,
      newPerDay: true,
      extraNewDay: true,
      extraNew: true,
    },
  },
} satisfies Prisma.FlashcardSelect;

type CardRow = Prisma.FlashcardGetPayload<{
  select: typeof cardSelect;
}>;

function deckLanguageFields(deck: { frontLang: string | null; backLang: string | null }) {
  const frontLang = readDeckLanguage(deck.frontLang);
  const backLang = readDeckLanguage(deck.backLang);
  return {
    ...(frontLang ? { frontLang } : {}),
    ...(backLang ? { backLang } : {}),
  };
}

function toQueueCard(c: CardRow, viewerId: string): QueueCard {
  return {
    id: c.id,
    front: c.front,
    back: c.back,
    kind: isCardKind(c.kind) ? c.kind : 'basic',
    clozeIndex: c.clozeIndex,
    sourceId: c.sourceId,
    deckId: c.deckId,
    deckTitle: c.deck.title,
    // What the deck's cards are written in, for Listen (s11-17); absent when the deck names none.
    ...deckLanguageFields(c.deck),
    ...(() => {
      const review = c.kind === 'occlusion' ? reviewDataFor(c.source, c.clozeIndex) : null;
      return review ? { occlusion: review } : {};
    })(),
    ...(() => {
      const pictures = picturesOfRow(c, c.source);
      return {
        ...(pictures.frontImage
          ? {
              frontImage: pictures.frontImage,
            }
          : {}),
        ...(pictures.backImage
          ? {
              backImage: pictures.backImage,
            }
          : {}),
      };
    })(),
    // A review session draws from public decks too: a sound is the recorder's alone, so only the owner's own cards carry one.
    ...soundFields(soundsOfRow(c, c.source), c.deck.userId === viewerId),
  };
}

/** The cursor is the `dueAt` (epoch ms, base 36) of the last scheduled card the batch served. */
export function encodeCursor(dueAt: Date): string {
  return dueAt.getTime().toString(36);
}

export function decodeCursor(after: string | undefined): Date | null {
  if (!after || !/^[0-9a-z]+$/.test(after)) return null;
  const ms = parseInt(after, 36);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms) : null;
}

/** A deck the member can still read: their own, one they edit, or a public one. A deck made private drops out. */
const readableDeck = readableDeckWhere;

/**
 * The decks a session draws scheduled cards from: every readable deck, or, for a folder session, only the
 * member's own decks in that folder (a public deck is never in anyone's folder but its owner's).
 */
const sessionDeck = (userId: string, folderId: string | undefined, deckId?: string): Prisma.FlashcardDeckWhereInput => {
  const decks = folderId
    ? {
        userId,
        folderId,
      }
    : readableDeck(userId);
  return deckId ? { AND: [decks, { id: deckId }] } : decks;
};

/** The decks a session draws never-reviewed cards from: the member's own and the ones they edit, or their folder. */
const sessionFresh = (
  userId: string,
  folderId: string | undefined,
  deckId?: string,
): Prisma.FlashcardDeckWhereInput => {
  const decks = folderId ? { userId, folderId } : studiedDeckWhere(userId);
  return deckId ? { AND: [decks, { id: deckId }] } : decks;
};

/**
 * One batch of the member's review session: every scheduled card due now from a readable deck (ordered by
 * `dueAt`, then deck, then `CARD_ORDER`), then, once the scheduled cards are used up, up to
 * `NEW_PER_SESSION` never-reviewed cards from the member's own decks (oldest deck first). A batch holds at
 * most `SESSION_MAX` cards; `next` continues the scheduled list. Suspended cards are in neither part.
 * `deckId` narrows the session to that one deck (still inside the decks the member may read or study), with the
 * deck's pace and every other rule unchanged; the developer API's deck queue is the only caller that passes it.
 */
export async function reviewQueue(
  userId: string,
  after: string | undefined,
  now: Date = new Date(),
  folderId?: string,
  tz?: string,
  deckId?: string,
): Promise<ReviewQueueRes> {
  const boundary = decodeCursor(after);
  const scheduled = await prisma.flashcardReview.findMany({
    where: {
      userId,
      ...ACTIVE_REVIEW_WHERE,
      dueAt: boundary
        ? {
            lte: now,
            gt: boundary,
          }
        : {
            lte: now,
          },
      card: {
        ...REVIEWABLE_WHERE,
        deck: sessionDeck(userId, folderId, deckId),
      },
    },
    orderBy: [
      {
        dueAt: 'asc',
      },
      {
        card: {
          deckId: 'asc',
        },
      },
      ...CARD_ORDER.map((o) => ({
        card: o,
      })),
      {
        id: 'asc',
      },
    ],
    take: SESSION_MAX + 1,
    select: {
      dueAt: true,
      card: {
        select: cardSelect,
      },
    },
  });

  const overflow = scheduled.length > SESSION_MAX;
  let batch = overflow ? scheduled.slice(0, SESSION_MAX) : scheduled;
  if (overflow && scheduled[SESSION_MAX]!.dueAt.getTime() === batch[batch.length - 1]!.dueAt.getTime()) {
    // The cursor is a `dueAt` and the next batch starts strictly after it, so a batch must never end inside a
    // run of cards that share one `dueAt`: those would be skipped. Hold the whole run back for the next batch
    // (graded cards leave the due set, so nothing is served twice).
    const lastMs = batch[batch.length - 1]!.dueAt.getTime();
    const cut = batch.findIndex((r) => r.dueAt.getTime() === lastMs);
    if (cut > 0) {
      batch = batch.slice(0, cut);
    } else {
      // Every card of the batch shares the one `dueAt`: serve the rest of the run now (past the cap) rather than skip it.
      const rest = await prisma.flashcardReview.findMany({
        where: {
          userId,
          ...ACTIVE_REVIEW_WHERE,
          dueAt: batch[0]!.dueAt,
          card: {
            ...REVIEWABLE_WHERE,
            deck: sessionDeck(userId, folderId, deckId),
          },
        },
        orderBy: [
          {
            card: {
              deckId: 'asc',
            },
          },
          ...CARD_ORDER.map((o) => ({
            card: o,
          })),
          {
            id: 'asc',
          },
        ],
        take: 2000,
        select: {
          dueAt: true,
          card: {
            select: cardSelect,
          },
        },
      });
      batch = rest;
    }
  }
  const cards = batch.map((r) => toQueueCard(r.card, userId));
  const last = batch[batch.length - 1];
  if (overflow && last) {
    return {
      cards,
      next: encodeCursor(last.dueAt),
      includesNew: false,
    };
  }

  const room = Math.min(NEW_PER_SESSION, SESSION_MAX - cards.length);
  let includesNew = false;
  let learnMore: { deckId: string; deckTitle: string }[] = [];
  if (room > 0) {
    // The member's own decks, and the ones they edit; a folder session is the owner's folder, so their own decks only.
    const freshWhere = {
      ...REVIEWABLE_WHERE,
      deck: sessionFresh(userId, folderId, deckId),
      reviews: {
        none: {
          userId,
        },
      },
    };
    const freshOrder = [
      {
        deck: {
          createdAt: 'asc' as const,
        },
      },
      {
        deckId: 'asc' as const,
      },
      ...CARD_ORDER,
    ];
    const fetchFresh = async (excluded: string[], take: number = room) =>
      (
        await prisma.flashcard.findMany({
          where: excluded.length
            ? {
                ...freshWhere,
                deckId: {
                  notIn: excluded,
                },
              }
            : freshWhere,
          orderBy: freshOrder,
          take,
          select: freshSelect,
        })
      ).map(ownPaceOnly(userId));
    let fresh = await fetchFresh([]);
    // Only when a deck has a pace: a deck without one is the single query above and nothing else.
    if (fresh.some((c) => isPaced(c.deck))) {
      const paced = await applyPace(userId, fresh, room, fetchFresh, zoneOrUtc(tz), now);
      fresh = paced.cards;
      learnMore = paced.learnMore;
    }
    includesNew = fresh.length > 0;
    for (const c of fresh) cards.push(toQueueCard(c, userId));
  }
  return {
    cards,
    next: null,
    includesNew,
    ...(learnMore.length > 0
      ? {
          learnMore,
        }
      : {}),
  };
}

type FreshRow = Prisma.FlashcardGetPayload<{
  select: typeof freshSelect;
}>;

/** A deck's pace is its owner's setting: an editor studying the deck sees it as having none. */
const ownPaceOnly =
  (viewerId: string) =>
  (row: FreshRow): FreshRow =>
    row.deck.userId === viewerId
      ? row
      : { ...row, deck: { ...row.deck, newPerDay: null, extraNewDay: null, extraNew: 0 } };

/**
 * Trim a batch of never-reviewed cards to each paced deck's allowance for today (its pace, plus "Learn more",
 * less the new cards first graded today in the member's zone, counted from the review log). A deck that used up
 * its allowance is left out and the batch is refilled from the decks after it, so a paced deck never starves an
 * unpaced one behind it. Also returns the paced decks that still have new cards to "learn more" from. Two sessions
 * open at once may each add the remainder once (bounded by `NEW_PER_SESSION`).
 */
async function applyPace(
  userId: string,
  first: FreshRow[],
  room: number,
  fetchMore: (excluded: string[], take: number) => Promise<FreshRow[]>,
  tz: string,
  now: Date,
): Promise<{ cards: FreshRow[]; learnMore: { deckId: string; deckTitle: string }[] }> {
  const today = todayKey(now, tz);
  const dayStart = dayStartUtc(today, tz);
  const allowance = new Map<string, number | null>();
  const titles = new Map<string, string>();
  const excluded: string[] = [];
  // What a used-up deck already contributed stays; the rest of the room is refilled from the decks after it.
  const base: FreshRow[] = [];
  let pool = first;
  for (;;) {
    const roomLeft = room - base.length;
    const unseen = new Map<string, FreshRow['deck']>();
    for (const c of pool) {
      titles.set(c.deckId, c.deck.title);
      if (!allowance.has(c.deckId)) {
        if (isPaced(c.deck)) unseen.set(c.deckId, c.deck);
        else allowance.set(c.deckId, null);
      }
    }
    if (unseen.size > 0) {
      const introduced = await newIntroducedToday(userId, [...unseen.keys()], dayStart);
      for (const [deckId, deck] of unseen)
        allowance.set(deckId, newAllowance(deck, today, introduced.get(deckId) ?? 0));
    }
    const { kept, saturated, held } = applyAllowances(pool, allowance);
    if (kept.length >= roomLeft || held.size === 0 || pool.length < roomLeft) {
      // Decks whose allowance is gone: a card was held back, or the last of it was just taken (and more exist).
      const more = new Set(held);
      const justFilled = [...saturated].filter((id) => !held.has(id));
      if (justFilled.length > 0) {
        const left = await prisma.flashcard.groupBy({
          by: ['deckId'],
          where: {
            ...REVIEWABLE_WHERE,
            deckId: {
              in: justFilled,
            },
            reviews: {
              none: {
                userId,
              },
            },
          },
          _count: {
            _all: true,
          },
        });
        for (const row of Array.isArray(left) ? left : []) {
          const served = [...base, ...kept].filter((c) => c.deckId === row.deckId).length;
          if (row._count._all > served) more.add(row.deckId);
        }
      }
      for (const id of excluded) more.add(id);
      return {
        cards: [...base, ...kept],
        learnMore: [...more].map((deckId) => ({ deckId, deckTitle: titles.get(deckId) ?? '' })),
      };
    }
    base.push(...kept.filter((c) => held.has(c.deckId)));
    excluded.push(...held);
    pool = await fetchMore(excluded, room - base.length);
  }
}

interface DeckDueRow {
  deckId: string;
  due: number;
  /** Never-reviewed cards in the deck (counted in `due`). */
  fresh?: number;
  newPerDay?: number | null;
  extraNewDay?: string | null;
  extraNew?: number;
}

/**
 * Due cards per deck the member owns, as the deck page counts them: scheduled cards whose time has come plus
 * never-reviewed ones. A suspended card has a review row, so it is in neither. A paced deck counts only the new
 * cards its allowance for today still lets in (the same allowance as `reviewQueue`).
 */
export async function dueByDeck(userId: string, now: Date = new Date(), tz?: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<DeckDueRow[]>`
    SELECT c."deckId" AS "deckId",
           (COUNT(*) FILTER (WHERE r."id" IS NULL OR (r."suspendedAt" IS NULL AND r."dueAt" <= ${now})))::int AS "due",
           (COUNT(*) FILTER (WHERE r."id" IS NULL))::int AS "fresh",
           MAX(CASE WHEN d."userId" = ${userId} THEN d."newPerDay" END) AS "newPerDay",
           MAX(CASE WHEN d."userId" = ${userId} THEN d."extraNewDay" END) AS "extraNewDay",
           MAX(CASE WHEN d."userId" = ${userId} THEN d."extraNew" END) AS "extraNew"
    FROM flashcard c
    JOIN flashcard_deck d ON d."id" = c."deckId"
    LEFT JOIN flashcard_review r ON r."cardId" = c."id" AND r."userId" = ${userId}
    WHERE (d."userId" = ${userId}
           OR ${activeEditorSql(userId)})
      AND NOT (c."kind" = 'cloze' AND c."sourceId" IS NULL)
      AND NOT (c."kind" = 'occlusion' AND c."sourceId" IS NULL)
    GROUP BY c."deckId"`;
  const list = Array.isArray(rows) ? rows : [];
  const paced = list.filter((r) => typeof r.newPerDay === 'number');
  const out = new Map(list.map((r) => [r.deckId, r.due]));
  if (paced.length === 0) return out;
  const zone = zoneOrUtc(tz);
  const today = todayKey(now, zone);
  const introduced = await newIntroducedToday(
    userId,
    paced.map((r) => r.deckId),
    dayStartUtc(today, zone),
  );
  for (const r of paced) {
    const fresh = r.fresh ?? 0;
    const allowed = newAllowance(
      { newPerDay: r.newPerDay ?? null, extraNewDay: r.extraNewDay ?? null, extraNew: r.extraNew ?? 0 },
      today,
      introduced.get(r.deckId) ?? 0,
    );
    out.set(r.deckId, r.due - fresh + Math.min(fresh, allowed ?? fresh));
  }
  return out;
}

/** What "Review all" would hold right now, for the count on `/study` (the same rules as `reviewQueue`). */
export async function reviewAllCount(userId: string, now: Date = new Date(), tz?: string): Promise<number> {
  const freshWhere = {
    ...REVIEWABLE_WHERE,
    deck: studiedDeckWhere(userId),
    reviews: {
      none: {
        userId,
      },
    },
  };
  const [scheduled, freshAll, pacedDecks] = await Promise.all([
    prisma.flashcardReview.count({
      where: {
        userId,
        ...ACTIVE_REVIEW_WHERE,
        dueAt: {
          lte: now,
        },
        card: {
          ...REVIEWABLE_WHERE,
          deck: readableDeck(userId),
        },
      },
    }),
    prisma.flashcard.count({
      where: freshWhere,
    }),
    // One card per paced deck that still has new cards; empty for a member who set no pace.
    prisma.flashcard.findMany({
      where: {
        ...freshWhere,
        deck: {
          userId,
          newPerDay: {
            not: null,
          },
        },
      },
      distinct: ['deckId'],
      select: {
        deckId: true,
        deck: {
          select: {
            newPerDay: true,
            extraNewDay: true,
            extraNew: true,
          },
        },
      },
    }),
  ]);
  let fresh = freshAll;
  const paced = Array.isArray(pacedDecks) ? pacedDecks : [];
  if (paced.length > 0) {
    const zone = zoneOrUtc(tz);
    const today = todayKey(now, zone);
    const ids = paced.map((p) => p.deckId);
    const [introduced, counts] = await Promise.all([
      newIntroducedToday(userId, ids, dayStartUtc(today, zone)),
      prisma.flashcard.groupBy({
        by: ['deckId'],
        where: {
          ...REVIEWABLE_WHERE,
          deckId: {
            in: ids,
          },
          reviews: {
            none: {
              userId,
            },
          },
        },
        _count: {
          _all: true,
        },
      }),
    ]);
    const have = new Map((Array.isArray(counts) ? counts : []).map((c) => [c.deckId, c._count._all]));
    for (const p of paced) {
      const n = have.get(p.deckId) ?? 0;
      const allowed = newAllowance(p.deck, today, introduced.get(p.deckId) ?? 0) ?? n;
      fresh -= n - Math.min(n, allowed);
    }
  }
  const base = Math.min(scheduled, SESSION_MAX);
  return Math.min(SESSION_MAX, base + (scheduled > SESSION_MAX ? 0 : Math.min(fresh, NEW_PER_SESSION)));
}

export interface SuspendResult {
  suspended: boolean;
  reason: SuspendReason | null;
}

/**
 * Suspend or unsuspend one card for the member. An authored note (a reversible or cloze card) stands for the
 * cards generated from it, so they are set aside together. Idempotent: suspending twice changes nothing, and
 * a leech is never overwritten with a manual suspension. Unsuspending a leech gives it `LEECH_RESET` lapses.
 * Returns null when the card does not exist or the member cannot read its deck.
 */
export async function setSuspended(
  userId: string,
  cardId: string,
  suspended: boolean,
  now: Date = new Date(),
): Promise<SuspendResult | null> {
  const card = await prisma.flashcard.findUnique({
    where: {
      id: cardId,
    },
    select: {
      id: true,
      deckId: true,
      deck: {
        select: {
          isPublic: true,
          userId: true,
        },
      },
    },
  });
  if (!card) return null;
  if (!(await canReadDeck(userId, { id: card.deckId, ...card.deck }))) return null;

  const targets = await prisma.flashcard.findMany({
    where: {
      OR: [
        {
          id: cardId,
        },
        {
          sourceId: cardId,
        },
      ],
      ...REVIEWABLE_WHERE,
    },
    select: {
      id: true,
    },
  });
  const ids = (Array.isArray(targets) ? targets : []).map((t) => t.id);
  if (ids.length === 0) return null;

  if (suspended) {
    await prisma.$transaction([
      prisma.flashcardReview.updateMany({
        where: {
          userId,
          cardId: {
            in: ids,
          },
          suspendedAt: null,
        },
        data: {
          suspendedAt: now,
          suspendReason: 'manual',
        },
      }),
      prisma.flashcardReview.createMany({
        data: ids.map((id) => ({
          userId,
          cardId: id,
          suspendedAt: now,
          suspendReason: 'manual',
        })),
        skipDuplicates: true,
      }),
    ]);
    return {
      suspended: true,
      reason: 'manual',
    };
  }

  await prisma.$transaction([
    prisma.flashcardReview.updateMany({
      where: {
        userId,
        cardId: {
          in: ids,
        },
        suspendedAt: {
          not: null,
        },
        suspendReason: 'leech',
      },
      data: {
        suspendedAt: null,
        suspendReason: null,
        lapses: LEECH_RESET,
      },
    }),
    prisma.flashcardReview.updateMany({
      where: {
        userId,
        cardId: {
          in: ids,
        },
        suspendedAt: {
          not: null,
        },
        NOT: {
          suspendReason: 'leech',
        },
      },
      data: {
        suspendedAt: null,
        suspendReason: null,
      },
    }),
  ]);
  return {
    suspended: false,
    reason: null,
  };
}

/** The member's suspended cards, for the account export. */
export async function exportSuspendedCards(userId: string) {
  const rows = await prisma.flashcardReview.findMany({
    where: {
      userId,
      suspendedAt: {
        not: null,
      },
    },
    orderBy: {
      suspendedAt: 'asc',
    },
    take: EXPORT_CAP,
    select: {
      cardId: true,
      suspendedAt: true,
      suspendReason: true,
      lapses: true,
      card: {
        select: {
          deckId: true,
        },
      },
    },
  });
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    deckId: r.card.deckId,
    cardId: r.cardId,
    reason: r.suspendReason,
    lapses: r.lapses,
    suspendedAt: r.suspendedAt?.toISOString() ?? null,
  }));
}
