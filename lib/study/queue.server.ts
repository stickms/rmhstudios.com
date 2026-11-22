/**
 * The cross-deck review queue, per-member suspension and the due counts that exclude suspended cards.
 * Suspension lives on the member's `FlashcardReview` row (`suspendedAt`, `suspendReason`); a card with no row
 * is suspended by creating one with the default schedule. Every count and queue here applies
 * `ACTIVE_REVIEW_WHERE`, or `"suspendedAt" IS NULL` in raw SQL (registry: `DUE_COUNT_READ_PATHS`).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { isCardKind } from '@/lib/study/card-types';
import {
  ACTIVE_REVIEW_WHERE,
  CARD_ORDER,
  REVIEWABLE_WHERE,
} from '@/lib/study/card-query.server';
import {
  LEECH_RESET,
  NEW_PER_SESSION,
  SESSION_MAX,
  type QueueCard,
  type SuspendReason,
} from '@/lib/study/queue';
import type { ReviewQueueRes } from '@/lib/study/queue.contract';

const EXPORT_CAP = 50_000;

const cardSelect =
  {
    id: true,
    front: true,
    back: true,
    kind: true,
    sourceId: true,
    clozeIndex: true,
    deckId: true,
    deck: {
      select:
        {
          title: true,
        },
    },
  } satisfies Prisma.FlashcardSelect;

type CardRow =
  Prisma.FlashcardGetPayload<{
    select: typeof cardSelect;
  }>;

function toQueueCard(
  c: CardRow,
): QueueCard {
  return {
    id: c.id,
    front:
      c.front,
    back: c.back,
    kind: isCardKind(
      c.kind,
    )
      ? c.kind
      : 'basic',
    clozeIndex:
      c.clozeIndex,
    sourceId:
      c.sourceId,
    deckId:
      c.deckId,
    deckTitle:
      c
        .deck
        .title,
  };
}

/** The cursor is the `dueAt` (epoch ms, base 36) of the last scheduled card the batch served. */
export function encodeCursor(
  dueAt: Date,
): string {
  return dueAt
    .getTime()
    .toString(
      36,
    );
}

export function decodeCursor(
  after:
    | string
    | undefined,
): Date | null {
  if (
    !after ||
    !/^[0-9a-z]+$/.test(
      after,
    )
  )
    return null;
  const ms =
    parseInt(
      after,
      36,
    );
  return Number.isFinite(
    ms,
  ) &&
    ms >
      0
    ? new Date(
        ms,
      )
    : null;
}

/** A deck the member can still read: their own, or a public one. A deck made private drops out. */
const readableDeck =
  (
    userId: string,
  ) => ({
    OR: [
      {
        isPublic: true,
      },
      {
        userId,
      },
    ],
  });

/**
 * The decks a session draws scheduled cards from: every readable deck, or, for a folder session, only the
 * member's own decks in that folder (a public deck is never in anyone's folder but its owner's).
 */
const sessionDeck =
  (
    userId: string,
    folderId: string | undefined,
  ) =>
    folderId
      ? {
          userId,
          folderId,
        }
      : readableDeck(
          userId,
        );

/**
 * One batch of the member's review session: every scheduled card due now from a readable deck (ordered by
 * `dueAt`, then deck, then `CARD_ORDER`), then, once the scheduled cards are used up, up to
 * `NEW_PER_SESSION` never-reviewed cards from the member's own decks (oldest deck first). A batch holds at
 * most `SESSION_MAX` cards; `next` continues the scheduled list. Suspended cards are in neither part.
 */
export async function reviewQueue(
  userId: string,
  after:
    | string
    | undefined,
  now: Date = new Date(),
  folderId?: string,
): Promise<ReviewQueueRes> {
  const boundary =
    decodeCursor(
      after,
    );
  const scheduled =
    await prisma.flashcardReview.findMany(
      {
        where:
          {
            userId,
            ...ACTIVE_REVIEW_WHERE,
            dueAt:
              boundary
                ? {
                    lte: now,
                    gt: boundary,
                  }
                : {
                    lte: now,
                  },
            card: {
              ...REVIEWABLE_WHERE,
              deck: sessionDeck(
                userId,
                folderId,
              ),
            },
          },
        orderBy:
          [
            {
              dueAt:
                'asc',
            },
            {
              card: {
                deckId:
                  'asc',
              },
            },
            ...CARD_ORDER.map(
              (
                o,
              ) => ({
                card: o,
              }),
            ),
            {
              id: 'asc',
            },
          ],
        take:
          SESSION_MAX +
          1,
        select:
          {
            dueAt: true,
            card: {
              select:
                cardSelect,
            },
          },
      },
    );

  const overflow =
    scheduled.length >
    SESSION_MAX;
  let batch =
    overflow
      ? scheduled.slice(
          0,
          SESSION_MAX,
        )
      : scheduled;
  if (
    overflow &&
    scheduled[
      SESSION_MAX
    ]!.dueAt.getTime() ===
      batch[
        batch.length -
          1
      ]!.dueAt.getTime()
  ) {
    // The cursor is a `dueAt` and the next batch starts strictly after it, so a batch must never end inside a
    // run of cards that share one `dueAt`: those would be skipped. Hold the whole run back for the next batch
    // (graded cards leave the due set, so nothing is served twice).
    const lastMs =
      batch[
        batch.length -
          1
      ]!.dueAt.getTime();
    const cut =
      batch.findIndex(
        (
          r,
        ) =>
          r.dueAt.getTime() ===
          lastMs,
      );
    if (
      cut >
      0
    ) {
      batch =
        batch.slice(
          0,
          cut,
        );
    } else {
      // Every card of the batch shares the one `dueAt`: serve the rest of the run now (past the cap) rather than skip it.
      const rest =
        await prisma.flashcardReview.findMany(
          {
            where:
              {
                userId,
                ...ACTIVE_REVIEW_WHERE,
                dueAt:
                  batch[0]!
                    .dueAt,
                card: {
                  ...REVIEWABLE_WHERE,
                  deck: sessionDeck(
                    userId,
                    folderId,
                  ),
                },
              },
            orderBy:
              [
                {
                  card: {
                    deckId:
                      'asc',
                  },
                },
                ...CARD_ORDER.map(
                  (
                    o,
                  ) => ({
                    card: o,
                  }),
                ),
                {
                  id: 'asc',
                },
              ],
            take: 2000,
            select:
              {
                dueAt: true,
                card: {
                  select:
                    cardSelect,
                },
              },
          },
        );
      batch =
        rest;
    }
  }
  const cards =
    batch.map(
      (
        r,
      ) =>
        toQueueCard(
          r.card,
        ),
    );
  const last =
    batch[
      batch.length -
        1
    ];
  if (
    overflow &&
    last
  ) {
    return {
      cards,
      next: encodeCursor(
        last.dueAt,
      ),
      includesNew: false,
    };
  }

  const room =
    Math.min(
      NEW_PER_SESSION,
      SESSION_MAX -
        cards.length,
    );
  let includesNew = false;
  if (
    room >
    0
  ) {
    const fresh =
      await prisma.flashcard.findMany(
        {
          where:
            {
              ...REVIEWABLE_WHERE,
              deck: {
                userId,
                ...(folderId
                  ? {
                      folderId,
                    }
                  : {}),
              },
              reviews:
                {
                  none: {
                    userId,
                  },
                },
            },
          orderBy:
            [
              {
                deck: {
                  createdAt:
                    'asc',
                },
              },
              {
                deckId:
                  'asc',
              },
              ...CARD_ORDER,
            ],
          take: room,
          select:
            cardSelect,
        },
      );
    includesNew =
      fresh.length >
      0;
    for (const c of fresh)
      cards.push(
        toQueueCard(
          c,
        ),
      );
  }
  return {
    cards,
    next: null,
    includesNew,
  };
}

interface DeckDueRow {
  deckId: string;
  due: number;
}

/**
 * Due cards per deck the member owns, as the deck page counts them: scheduled cards whose time has come plus
 * never-reviewed ones. A suspended card has a review row, so it is in neither.
 */
export async function dueByDeck(
  userId: string,
  now: Date = new Date(),
): Promise<
  Map<
    string,
    number
  >
> {
  const rows =
    await prisma.$queryRaw<
      DeckDueRow[]
    >`
    SELECT c."deckId" AS "deckId",
           (COUNT(*) FILTER (WHERE r."id" IS NULL OR (r."suspendedAt" IS NULL AND r."dueAt" <= ${now})))::int AS "due"
    FROM flashcard c
    JOIN flashcard_deck d ON d."id" = c."deckId"
    LEFT JOIN flashcard_review r ON r."cardId" = c."id" AND r."userId" = ${userId}
    WHERE d."userId" = ${userId}
      AND NOT (c."kind" = 'cloze' AND c."sourceId" IS NULL)
    GROUP BY c."deckId"`;
  return new Map(
    (Array.isArray(
      rows,
    )
      ? rows
      : []
    ).map(
      (
        r,
      ) => [
        r.deckId,
        r.due,
      ],
    ),
  );
}

/** What "Review all" would hold right now, for the count on `/study` (the same rules as `reviewQueue`). */
export async function reviewAllCount(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const [
    scheduled,
    fresh,
  ] =
    await Promise.all(
      [
        prisma.flashcardReview.count(
          {
            where:
              {
                userId,
                ...ACTIVE_REVIEW_WHERE,
                dueAt:
                  {
                    lte: now,
                  },
                card: {
                  ...REVIEWABLE_WHERE,
                  deck: readableDeck(
                    userId,
                  ),
                },
              },
          },
        ),
        prisma.flashcard.count(
          {
            where:
              {
                ...REVIEWABLE_WHERE,
                deck: {
                  userId,
                },
                reviews:
                  {
                    none: {
                      userId,
                    },
                  },
              },
          },
        ),
      ],
    );
  const base =
    Math.min(
      scheduled,
      SESSION_MAX,
    );
  return Math.min(
    SESSION_MAX,
    base +
      (scheduled >
      SESSION_MAX
        ? 0
        : Math.min(
            fresh,
            NEW_PER_SESSION,
          )),
  );
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
  const card =
    await prisma.flashcard.findUnique(
      {
        where:
          {
            id: cardId,
          },
        select:
          {
            id: true,
            deck: {
              select:
                {
                  isPublic: true,
                  userId: true,
                },
            },
          },
      },
    );
  if (
    !card
  )
    return null;
  if (
    !card
      .deck
      .isPublic &&
    card
      .deck
      .userId !==
      userId
  )
    return null;

  const targets =
    await prisma.flashcard.findMany(
      {
        where:
          {
            OR: [
              {
                id: cardId,
              },
              {
                sourceId:
                  cardId,
              },
            ],
            ...REVIEWABLE_WHERE,
          },
        select:
          {
            id: true,
          },
      },
    );
  const ids =
    (
      Array.isArray(
        targets,
      )
        ? targets
        : []
    ).map(
      (
        t,
      ) =>
        t.id,
    );
  if (
    ids.length ===
    0
  )
    return null;

  if (
    suspended
  ) {
    await prisma.$transaction(
      [
        prisma.flashcardReview.updateMany(
          {
            where:
              {
                userId,
                cardId:
                  {
                    in: ids,
                  },
                suspendedAt:
                  null,
              },
            data: {
              suspendedAt:
                now,
              suspendReason:
                'manual',
            },
          },
        ),
        prisma.flashcardReview.createMany(
          {
            data: ids.map(
              (
                id,
              ) => ({
                userId,
                cardId:
                  id,
                suspendedAt:
                  now,
                suspendReason:
                  'manual',
              }),
            ),
            skipDuplicates: true,
          },
        ),
      ],
    );
    return {
      suspended: true,
      reason:
        'manual',
    };
  }

  await prisma.$transaction(
    [
      prisma.flashcardReview.updateMany(
        {
          where:
            {
              userId,
              cardId:
                {
                  in: ids,
                },
              suspendedAt:
                {
                  not: null,
                },
              suspendReason:
                'leech',
            },
          data: {
            suspendedAt:
              null,
            suspendReason:
              null,
            lapses:
              LEECH_RESET,
          },
        },
      ),
      prisma.flashcardReview.updateMany(
        {
          where:
            {
              userId,
              cardId:
                {
                  in: ids,
                },
              suspendedAt:
                {
                  not: null,
                },
              NOT: {
                suspendReason:
                  'leech',
              },
            },
          data: {
            suspendedAt:
              null,
            suspendReason:
              null,
          },
        },
      ),
    ],
  );
  return {
    suspended: false,
    reason:
      null,
  };
}

/** The member's suspended cards, for the account export. */
export async function exportSuspendedCards(
  userId: string,
) {
  const rows =
    await prisma.flashcardReview.findMany(
      {
        where:
          {
            userId,
            suspendedAt:
              {
                not: null,
              },
          },
        orderBy:
          {
            suspendedAt:
              'asc',
          },
        take: EXPORT_CAP,
        select:
          {
            cardId: true,
            suspendedAt: true,
            suspendReason: true,
            lapses: true,
            card: {
              select:
                {
                  deckId: true,
                },
            },
          },
      },
    );
  return (
    Array.isArray(
      rows,
    )
      ? rows
      : []
  ).map(
    (
      r,
    ) => ({
      deckId:
        r
          .card
          .deckId,
      cardId:
        r.cardId,
      reason:
        r.suspendReason,
      lapses:
        r.lapses,
      suspendedAt:
        r.suspendedAt?.toISOString() ??
        null,
    }),
  );
}
