/**
 * Thin adapters from the v1 shapes (`/api/v1/me/decks*`) to the study functions the UI already uses.
 * Every write goes through `lib/study/deck-editor.server.ts`, so the limits, `cardCount`, generated
 * siblings and `cardsChangedAt` behave exactly as in the editor. A deck or card that is not the key
 * owner's is `null` / `not_found`, never a different answer (no existence oracle). Generated siblings are
 * never listed (`AUTHORED_WHERE`) and are never addressable. Reviews are the exception (s12-12): `reviewQueueFor` and
 * `gradeFor` go through the site's own queue and `reviewCard`, never return a card sound, and grade for no reward.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { RATE_LIMIT_POLICIES, rateLimit } from '@/lib/rate-limit';
import type { ApiContext } from '@/lib/api/with-developer-api.server';
import type { z } from 'zod';
import { AUTHORED_WHERE, REVIEWABLE_WHERE } from '@/lib/study/card-query.server';
import { CARD_IMAGE_SELECT, fromColumns, type CardImage } from '@/lib/study/card-images';
import { CARD_SOUND_SELECT, fromSoundColumns, type CardSound } from '@/lib/study/card-sound';
import { readOcclusion, type Occlusion } from '@/lib/study/occlusion';
import { resolveMediaUrls } from '@/lib/study/card-images.server';
import { canReadDeck, requireDeckRole } from '@/lib/study/deck-access.server';
import { reviewQueue } from '@/lib/study/queue.server';
import { reviewCard } from '@/lib/study/review.server';
import {
  createDeck,
  deleteCard,
  deleteDeck,
  importCardsDetailed,
  updateCard,
  updateDeck,
  upsertCardByExternalId,
  type CardDraft,
  type CardPatch,
  type EditResult,
} from '@/lib/study/deck-editor.server';
import {
  API_BATCH_MAX,
  gradeOf,
  type GradeName,
  decodeCardCursor,
  decodeDeckCursor,
  encodeCardCursor,
  encodeDeckCursor,
} from '@/lib/api/v1/study-schema';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ApiDeck {
  id: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  cardCount: number;
  dueCount: number;
  /** Cards the key owner has set aside (manually or as leeches); not in `dueCount`. */
  suspended: number;
  updatedAt: string;
}

export interface ApiCard {
  id: string;
  kind: string;
  front: string;
  back: string;
  position: number;
  externalId: string | null;
  /** The picture on the front, or null (s08-15). */
  frontImage: CardImage | null;
  /** The picture on the back, or null. */
  backImage: CardImage | null;
  /** The sound on the front, or null (s10-02). Read-only, and only ever the key owner's own: a sound is private. */
  frontSound: CardSound | null;
  /** The sound on the back, or null. */
  backSound: CardSound | null;
  /** The masks of an occlusion card (`kind: 'occlusion'`, over `frontImage`), or null on every other kind (s09-03). */
  occlusion: Occlusion | null;
}

/** A picture to set on a card side: a `media_id` from `POST /api/v1/images` and its description. */
export interface ApiPictureWrite {
  media_id: string;
  alt: string;
}

/** A card as the API receives it: pictures by `media_id`. `null` removes one, absent leaves it. */
type WithApiPictures<T> = Omit<T, 'frontImage' | 'backImage'> & {
  frontImage?: ApiPictureWrite | null | undefined;
  backImage?: ApiPictureWrite | null | undefined;
};

type MediaRefusal = {
  ok: false;
  status: 400;
  error: string;
  code: 'invalid_media';
};

/**
 * Turn the `media_id`s of cards into the addresses the editor stores. A `media_id` must be the key owner's own upload
 * (an unknown or foreign one is `invalid_media`, the same answer for both); the editor then claims it on save.
 */
async function resolvePictures<
  T extends {
    frontImage?: ApiPictureWrite | null | undefined;
    backImage?: ApiPictureWrite | null | undefined;
  },
>(
  userId: string,
  items: readonly T[],
): Promise<
  | {
      ok: true;
      items: (Omit<T, 'frontImage' | 'backImage'> & {
        frontImage?: CardImage | null | undefined;
        backImage?: CardImage | null | undefined;
      })[];
    }
  | MediaRefusal
> {
  const ids = items.flatMap((item) =>
    [item.frontImage?.media_id, item.backImage?.media_id].filter((id): id is string => !!id),
  );
  const urls = ids.length > 0 ? await resolveMediaUrls(userId, ids) : new Map<string, string>();
  const out: (Omit<T, 'frontImage' | 'backImage'> & {
    frontImage?: CardImage | null | undefined;
    backImage?: CardImage | null | undefined;
  })[] = [];
  for (const item of items) {
    const { frontImage, backImage, ...rest } = item;
    const side = (write: ApiPictureWrite | null | undefined): CardImage | null | undefined | 'unknown' => {
      if (write === undefined || write === null) return write;
      const url = urls.get(write.media_id);
      return url
        ? {
            url,
            alt: write.alt,
          }
        : 'unknown';
    };
    const front = side(frontImage);
    const back = side(backImage);
    if (front === 'unknown' || back === 'unknown')
      return {
        ok: false,
        status: 400,
        code: 'invalid_media',
        error: 'Unknown media_id. Upload the picture with POST /api/v1/images (surface=flashcard) first.',
      };
    out.push({
      ...rest,
      ...(front !== undefined
        ? {
            frontImage: front,
          }
        : {}),
      ...(back !== undefined
        ? {
            backImage: back,
          }
        : {}),
    });
  }
  return {
    ok: true,
    items: out,
  };
}

/** A card row as the API returns it. */
function apiCard(row: {
  id: string;
  kind: string;
  front: string;
  back: string;
  position: number;
  externalId: string | null;
  frontImageUrl: string | null;
  frontImageAlt: string | null;
  backImageUrl: string | null;
  backImageAlt: string | null;
  frontSoundUrl: string | null;
  frontSoundText: string | null;
  frontSoundMs: number | null;
  backSoundUrl: string | null;
  backSoundText: string | null;
  backSoundMs: number | null;
  occlusion: unknown;
}): ApiCard {
  const { frontImage, backImage } = fromColumns(row);
  // Every card this reads is in a deck the key owner owns (`listMyCards` and the writes check it), so the sounds
  // are the owner's own.
  const { frontSound, backSound } = fromSoundColumns(row);
  return {
    id: row.id,
    kind: row.kind,
    front: row.front,
    back: row.back,
    position: row.position,
    externalId: row.externalId,
    frontImage,
    backImage,
    frontSound,
    backSound,
    occlusion: row.kind === 'occlusion' ? readOcclusion(row.occlusion) : null,
  };
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

/**
 * What is due for the member in each deck: reviewable cards (every row but an authored cloze) with no
 * review yet or a review due now, and reviews coming due in the next 24 hours. One query for any number
 * of decks, joined to the member's own reviews (`(userId, dueAt)` index). The same rule as the deck page's
 * `dueCount` in `getDeck`.
 */
export async function dueCounts(
  userId: string,
  deckIds: string[],
  now = new Date(),
): Promise<
  Map<
    string,
    {
      dueNow: number;
      dueNext24h: number;
      suspended: number;
    }
  >
> {
  const out = new Map<
    string,
    {
      dueNow: number;
      dueNext24h: number;
      suspended: number;
    }
  >();
  for (const id of deckIds)
    out.set(id, {
      dueNow: 0,
      dueNext24h: 0,
      suspended: 0,
    });
  if (deckIds.length === 0) return out;
  const soon = new Date(now.getTime() + DAY_MS);
  const rows = await prisma.$queryRaw<
    {
      deckId: string;
      dueNow: number;
      dueNext24h: number;
      suspended: number;
    }[]
  >(Prisma.sql`
    SELECT c."deckId" AS "deckId",
           COUNT(*) FILTER (WHERE r."id" IS NULL OR (r."suspendedAt" IS NULL AND r."dueAt" <= ${now}))::int AS "dueNow",
           COUNT(*) FILTER (WHERE r."suspendedAt" IS NULL AND r."dueAt" > ${now} AND r."dueAt" <= ${soon})::int AS "dueNext24h",
           COUNT(*) FILTER (WHERE r."suspendedAt" IS NOT NULL)::int AS "suspended"
    FROM "flashcard" c
    LEFT JOIN "flashcard_review" r ON r."cardId" = c."id" AND r."userId" = ${userId}
    WHERE c."deckId" = ANY(${deckIds}::text[])
      AND NOT (c."kind" = 'cloze' AND c."sourceId" IS NULL)
      AND NOT (c."kind" = 'occlusion' AND c."sourceId" IS NULL)
    GROUP BY c."deckId"`);
  for (const row of Array.isArray(rows) ? rows : []) {
    out.set(row.deckId, {
      dueNow: row.dueNow,
      dueNext24h: row.dueNext24h,
      suspended: row.suspended,
    });
  }
  return out;
}

const deckSelect = {
  id: true,
  title: true,
  description: true,
  isPublic: true,
  cardCount: true,
  updatedAt: true,
} satisfies Prisma.FlashcardDeckSelect;

type DeckRow = Prisma.FlashcardDeckGetPayload<{
  select: typeof deckSelect;
}>;

function toDeck(row: DeckRow, dueNow: number, suspended: number): ApiDeck {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    isPublic: row.isPublic,
    cardCount: row.cardCount,
    dueCount: dueNow,
    suspended,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function notFound() {
  return {
    ok: false,
    status: 404,
    error: 'Not found',
  } as const;
}

/** The key owner's decks, newest change first, keyset on (`updatedAt`, `id`). */
export async function listMyDecks(
  userId: string,
  limit: number,
  cursor: string | undefined,
): Promise<Page<ApiDeck> | 'invalid_cursor'> {
  const at = cursor === undefined ? null : decodeDeckCursor(cursor);
  if (cursor !== undefined && !at) return 'invalid_cursor';
  const rows = await prisma.flashcardDeck.findMany({
    where: {
      userId,
      ...(at
        ? {
            OR: [
              {
                updatedAt: {
                  lt: at.updatedAt,
                },
              },
              {
                updatedAt: at.updatedAt,
                id: {
                  lt: at.id,
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [
      {
        updatedAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    take: limit + 1,
    select: deckSelect,
  });
  const more = rows.length > limit;
  const items = more ? rows.slice(0, limit) : rows;
  const due = await dueCounts(
    userId,
    items.map((d) => d.id),
  );
  const last = items[items.length - 1];
  return {
    data: items.map((d) => toDeck(d, due.get(d.id)?.dueNow ?? 0, due.get(d.id)?.suspended ?? 0)),
    nextCursor: more && last ? encodeDeckCursor(last.updatedAt, last.id) : null,
  };
}

/** One of the key owner's decks, or null. */
export async function getMyDeck(userId: string, deckId: string): Promise<ApiDeck | null> {
  const row = await prisma.flashcardDeck.findFirst({
    where: {
      id: deckId,
      userId,
    },
    select: deckSelect,
  });
  if (!row) return null;
  const due = await dueCounts(userId, [row.id]);
  return toDeck(row, due.get(row.id)?.dueNow ?? 0, due.get(row.id)?.suspended ?? 0);
}

export async function createMyDeck(
  userId: string,
  input: {
    title: string;
    description?: string | undefined;
    isPublic?: boolean | undefined;
  },
) {
  const created = await createDeck(userId, input);
  if (!created.ok) return created;
  const deck = await getMyDeck(userId, created.id);
  return deck
    ? ({
        ok: true,
        deck,
      } as const)
    : notFound();
}

export async function patchMyDeck(
  userId: string,
  deckId: string,
  patch: {
    title?: string | undefined;
    description?: string | undefined;
    isPublic?: boolean | undefined;
  },
) {
  const result = await updateDeck(userId, deckId, {
    ...(patch.title !== undefined
      ? {
          title: patch.title,
        }
      : {}),
    ...(patch.description !== undefined
      ? {
          description: patch.description,
        }
      : {}),
    ...(patch.isPublic !== undefined
      ? {
          isPublic: patch.isPublic,
        }
      : {}),
  });
  if (!result.ok) return result;
  const deck = await getMyDeck(userId, deckId);
  return deck
    ? ({
        ok: true,
        deck,
      } as const)
    : notFound();
}

export const deleteMyDeck = deleteDeck;

const cardSelect = {
  id: true,
  kind: true,
  front: true,
  back: true,
  position: true,
  externalId: true,
  occlusion: true,
  ...CARD_IMAGE_SELECT,
  ...CARD_SOUND_SELECT,
} satisfies Prisma.FlashcardSelect;

/** A deck's authored cards in deck order, keyset on (`position`, `id`); null when the deck is not the owner's. */
export async function listMyCards(
  userId: string,
  deckId: string,
  limit: number,
  cursor: string | undefined,
  since?: Date,
): Promise<Page<ApiCard> | 'invalid_cursor' | null> {
  const at = cursor === undefined ? null : decodeCardCursor(cursor);
  if (cursor !== undefined && !at) return 'invalid_cursor';
  const deck = await prisma.flashcardDeck.findFirst({
    where: {
      id: deckId,
      userId,
    },
    select: {
      id: true,
    },
  });
  if (!deck) return null;
  const rows = await prisma.flashcard.findMany({
    where: {
      deckId,
      ...AUTHORED_WHERE,
      // Cards carry only a creation time (an edit does not move it), so `since` is "added after".
      ...(since ? { createdAt: { gt: since } } : {}),
      ...(at
        ? {
            OR: [
              {
                position: {
                  gt: at.position,
                },
              },
              {
                position: at.position,
                id: {
                  gt: at.id,
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [
      {
        position: 'asc',
      },
      {
        id: 'asc',
      },
    ],
    take: limit + 1,
    select: cardSelect,
  });
  const more = rows.length > limit;
  const items = more ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    data: items.map(apiCard),
    nextCursor: more && last ? encodeCardCursor(last.position, last.id) : null,
  };
}

/** The authored card in this deck of this owner, or null (generated siblings are never found). */
async function ownedCard(userId: string, deckId: string, cardId: string) {
  return prisma.flashcard.findFirst({
    where: {
      id: cardId,
      deckId,
      ...AUTHORED_WHERE,
      deck: {
        userId,
      },
    },
    select: cardSelect,
  });
}

/** Add 1 to 100 cards in one transaction; nothing is written when any is invalid or the deck would overflow. */
export async function createMyCards(userId: string, deckId: string, drafts: readonly WithApiPictures<CardDraft>[]) {
  // The developer API is the key owner's own decks: a deck they only edit (s11-10) is not theirs to write through it.
  if (!(await requireDeckRole(userId, deckId, ['owner']))) return notFound();
  const resolved = await resolvePictures(userId, drafts);
  if (!resolved.ok) return resolved;
  const result = await importCardsDetailed(userId, deckId, resolved.items, {
    max: API_BATCH_MAX,
  });
  if (!result.ok) return result;
  const rows = await prisma.flashcard.findMany({
    where: {
      id: {
        in: result.cards.map((c) => c.id),
      },
      deckId,
      ...AUTHORED_WHERE,
    },
    orderBy: [
      {
        position: 'asc',
      },
      {
        id: 'asc',
      },
    ],
    select: cardSelect,
  });
  return {
    ok: true,
    cards: rows.map(apiCard),
    cardCount: result.cardCount,
  } as const;
}

export async function patchMyCard(userId: string, deckId: string, cardId: string, patch: WithApiPictures<CardPatch>) {
  if (!(await ownedCard(userId, deckId, cardId))) return notFound();
  const resolved = await resolvePictures(userId, [patch]);
  if (!resolved.ok) return resolved;
  const result = await updateCard(userId, cardId, resolved.items[0] as CardPatch);
  if (!result.ok) return result;
  const card = await ownedCard(userId, deckId, cardId);
  return card
    ? ({
        ok: true,
        card: apiCard(card),
      } as const)
    : notFound();
}

export async function deleteMyCard(userId: string, deckId: string, cardId: string): Promise<EditResult> {
  if (!(await ownedCard(userId, deckId, cardId))) return notFound();
  return deleteCard(userId, cardId);
}

/** Create or update the card keyed `externalId`; `created` tells which. */
export async function upsertMyCard(
  userId: string,
  deckId: string,
  externalId: string,
  draft: WithApiPictures<CardDraft>,
) {
  const resolved = await resolvePictures(userId, [draft]);
  if (!resolved.ok) return resolved;
  const result = await upsertCardByExternalId(userId, deckId, externalId, resolved.items[0] as CardDraft);
  if (!result.ok) return result;
  const card = await ownedCard(userId, deckId, result.id);
  return card
    ? ({
        ok: true,
        card: apiCard(card),
        created: result.created,
      } as const)
    : notFound();
}

/** Counts due now and in the next 24 hours for one deck, or null when it is not the owner's. No card content. */
export async function dueFor(userId: string, deckId: string, now = new Date()) {
  const deck = await prisma.flashcardDeck.findFirst({
    where: {
      id: deckId,
      userId,
    },
    select: {
      id: true,
    },
  });
  if (!deck) return null;
  const counts = (await dueCounts(userId, [deckId], now)).get(deckId) ?? {
    dueNow: 0,
    dueNext24h: 0,
    suspended: 0,
  };
  return {
    deckId,
    dueNow: counts.dueNow,
    dueNext24h: counts.dueNext24h,
    asOf: now.toISOString(),
  };
}

/** A card due for review, as `GET …/review` returns it. No sound fields: sounds are the recorder's, on the site. */
export interface ApiReviewCard {
  id: string;
  kind: string;
  front: string;
  back: string;
  /** A cloze card: the deletion this card asks. An occlusion card: the id of the mask it asks. Otherwise null. */
  clozeIndex: number | null;
  /** The external id of the card (a generated card carries its source's), or null. */
  externalId: string | null;
  frontImage: CardImage | null;
  backImage: CardImage | null;
  /** The masks of an occlusion card, or null on every other kind. */
  occlusion: Occlusion | null;
  /** Where the card is on the key owner's schedule. */
  schedule: {
    /** `new` when it was never reviewed. */
    state: 'new' | 'review';
    dueAt: string | null;
    intervalDays: number;
  };
}

/**
 * The cards the site's review queue would show the key owner now for one deck, in its order: scheduled cards due,
 * then new cards within the deck's pace. The deck must be one the owner may read (their own, one they edit, a public
 * one); anything else is null. Sound columns are never read into the answer.
 */
export async function reviewQueueFor(
  userId: string,
  deckId: string,
  limit: number,
  now = new Date(),
): Promise<ApiReviewCard[] | null> {
  const deck = await prisma.flashcardDeck.findUnique({
    where: {
      id: deckId,
    },
    select: {
      id: true,
      isPublic: true,
      userId: true,
    },
  });
  if (!deck || !(await canReadDeck(userId, deck))) return null;
  const queue = await reviewQueue(userId, undefined, now, undefined, undefined, deckId);
  const cards = queue.cards.slice(0, limit);
  if (cards.length === 0) return [];
  const cardIds = cards.map((c) => c.id);
  const authoredIds = cards.map((c) => c.sourceId ?? c.id);
  const [authored, reviews] = await Promise.all([
    prisma.flashcard.findMany({
      where: {
        id: {
          in: authoredIds,
        },
      },
      select: {
        id: true,
        externalId: true,
      },
    }),
    prisma.flashcardReview.findMany({
      where: {
        userId,
        cardId: {
          in: cardIds,
        },
      },
      select: {
        cardId: true,
        dueAt: true,
        intervalDays: true,
      },
    }),
  ]);
  const externalIds = new Map((Array.isArray(authored) ? authored : []).map((r) => [r.id, r.externalId]));
  const schedules = new Map((Array.isArray(reviews) ? reviews : []).map((r) => [r.cardId, r]));
  return cards.map((c) => {
    const review = schedules.get(c.id);
    return {
      id: c.id,
      kind: c.kind,
      front: c.front,
      back: c.back,
      clozeIndex: c.clozeIndex,
      externalId: externalIds.get(c.sourceId ?? c.id) ?? null,
      frontImage: c.frontImage ?? null,
      backImage: c.backImage ?? null,
      occlusion: c.occlusion ? { mode: c.occlusion.mode, masks: c.occlusion.masks } : null,
      schedule: review
        ? {
            state: 'review' as const,
            dueAt: review.dueAt.toISOString(),
            intervalDays: review.intervalDays,
          }
        : {
            state: 'new' as const,
            dueAt: null,
            intervalDays: 0,
          },
    };
  });
}

/**
 * Grade one card of a deck for the key owner, on their own schedule, through the same `reviewCard` as the site
 * and without the quest and XP step. A card that is not in this deck, is not reviewed, or sits in a deck the owner
 * may not read is `not_found`; a card the owner suspended is `conflict` (unsuspend it on the site first).
 */
export async function gradeFor(userId: string, deckId: string, cardId: string, grade: GradeName) {
  const card = await prisma.flashcard.findFirst({
    where: {
      id: cardId,
      deckId,
      ...REVIEWABLE_WHERE,
    },
    select: {
      id: true,
      deck: {
        select: {
          isPublic: true,
          userId: true,
        },
      },
      reviews: {
        where: {
          userId,
        },
        select: {
          suspendedAt: true,
        },
      },
    },
  });
  if (!card || !(await canReadDeck(userId, { id: deckId, ...card.deck }))) return notFound();
  if (card.reviews[0]?.suspendedAt) {
    return {
      ok: false,
      status: 409,
      error: 'This card is suspended. Unsuspend it on the site before grading it.',
    } as const;
  }
  const result = await reviewCard(userId, cardId, gradeOf(grade), {
    rewards: false,
    deckId,
  });
  if (!result.ok) return notFound();
  return {
    ok: true,
    review: {
      dueAt: result.dueAt.toISOString(),
      intervalDays: result.intervalDays,
      leech: result.leech,
    },
  } as const;
}

/** Grades also draw on the key owner's own ceiling: 120 a minute, the site's, so a tool cannot grade faster than the app. */
export function gradeBudgetExceeded(userId: string): boolean {
  return !rateLimit(userId, {
    limit: 120,
    windowMs: 60_000,
    prefix: 'card-review-api',
  }).allowed;
}

/* ---------------------------- route helpers ------------------------------- */

/** Writes also draw on the member's own `write` budget, on top of the key's rate limit. */
export function writeBudgetExceeded(userId: string): boolean {
  return !rateLimit(userId, {
    ...RATE_LIMIT_POLICIES.write,
    prefix: 'v1-study-write',
  }).allowed;
}

/** An editor refusal as a v1 error. The editor's messages are fixed strings, never a caught error. */
export function editFailure(
  error: ApiContext['error'],
  result: {
    status: 400 | 404 | 409;
    error: string;
    code?: 'invalid_media';
  },
) {
  if (result.code === 'invalid_media') return error('invalid_media', result.error, 400);
  if (result.status === 404) return error('not_found', 'Not found.', 404);
  if (result.status === 409) return error('conflict', result.error, 409);
  return error('invalid_request', result.error, 400);
}

/** Parse a request's JSON body; the first issue's message, never the raw input. */
export async function readBody<T extends z.ZodType>(request: Request, schema: T) {
  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? ({
        ok: true,
        data: parsed.data as z.infer<T>,
      } as const)
    : ({
        ok: false,
        message: parsed.error.issues[0]?.message ?? 'Invalid request body',
      } as const);
}

export { queryOf, readInput } from './request-input';
