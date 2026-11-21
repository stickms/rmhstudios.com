/**
 * Thin adapters from the v1 shapes (`/api/v1/me/decks*`) to the study functions the UI already uses.
 * Every write goes through `lib/study/deck-editor.server.ts`, so the limits, `cardCount`, generated
 * siblings and `cardsChangedAt` behave exactly as in the editor. A deck or card that is not the key
 * owner's is `null` / `not_found`, never a different answer (no existence oracle). Generated siblings are
 * never listed (`AUTHORED_WHERE`) and are never addressable. Reviews are not exposed.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import {
  RATE_LIMIT_POLICIES,
  rateLimit,
} from '@/lib/rate-limit';
import type { ApiContext } from '@/lib/api/with-developer-api.server';
import type { z } from 'zod';
import { AUTHORED_WHERE } from '@/lib/study/card-query.server';
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
  decodeCardCursor,
  decodeDeckCursor,
  encodeCardCursor,
  encodeDeckCursor,
} from '@/lib/api/v1/study-schema';

const DAY_MS =
  24 *
  60 *
  60 *
  1000;

export interface ApiDeck {
  id: string;
  title: string;
  description:
    | string
    | null;
  isPublic: boolean;
  cardCount: number;
  dueCount: number;
  updatedAt: string;
}

export interface ApiCard {
  id: string;
  kind: string;
  front: string;
  back: string;
  position: number;
  externalId:
    | string
    | null;
}

export interface Page<
  T,
> {
  data: T[];
  nextCursor:
    | string
    | null;
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
    }
  >
> {
  const out =
    new Map<
      string,
      {
        dueNow: number;
        dueNext24h: number;
      }
    >();
  for (const id of deckIds)
    out.set(
      id,
      {
        dueNow: 0,
        dueNext24h: 0,
      },
    );
  if (
    deckIds.length ===
    0
  )
    return out;
  const soon =
    new Date(
      now.getTime() +
        DAY_MS,
    );
  const rows =
    await prisma.$queryRaw<
      {
        deckId: string;
        dueNow: number;
        dueNext24h: number;
      }[]
    >(Prisma.sql`
    SELECT c."deckId" AS "deckId",
           COUNT(*) FILTER (WHERE r."id" IS NULL OR r."dueAt" <= ${now})::int AS "dueNow",
           COUNT(*) FILTER (WHERE r."dueAt" > ${now} AND r."dueAt" <= ${soon})::int AS "dueNext24h"
    FROM "flashcard" c
    LEFT JOIN "flashcard_review" r ON r."cardId" = c."id" AND r."userId" = ${userId}
    WHERE c."deckId" = ANY(${deckIds}::text[])
      AND NOT (c."kind" = 'cloze' AND c."sourceId" IS NULL)
    GROUP BY c."deckId"`);
  for (const row of Array.isArray(
    rows,
  )
    ? rows
    : []) {
    out.set(
      row.deckId,
      {
        dueNow:
          row.dueNow,
        dueNext24h:
          row.dueNext24h,
      },
    );
  }
  return out;
}

const deckSelect =
  {
    id: true,
    title: true,
    description: true,
    isPublic: true,
    cardCount: true,
    updatedAt: true,
  } satisfies Prisma.FlashcardDeckSelect;

type DeckRow =
  Prisma.FlashcardDeckGetPayload<{
    select: typeof deckSelect;
  }>;

function toDeck(
  row: DeckRow,
  dueNow: number,
): ApiDeck {
  return {
    id: row.id,
    title:
      row.title,
    description:
      row.description,
    isPublic:
      row.isPublic,
    cardCount:
      row.cardCount,
    dueCount:
      dueNow,
    updatedAt:
      row.updatedAt.toISOString(),
  };
}

function notFound() {
  return {
    ok: false,
    status: 404,
    error:
      'Not found',
  } as const;
}

/** The key owner's decks, newest change first, keyset on (`updatedAt`, `id`). */
export async function listMyDecks(
  userId: string,
  limit: number,
  cursor:
    | string
    | undefined,
): Promise<
  | Page<ApiDeck>
  | 'invalid_cursor'
> {
  const at =
    cursor ===
    undefined
      ? null
      : decodeDeckCursor(
          cursor,
        );
  if (
    cursor !==
      undefined &&
    !at
  )
    return 'invalid_cursor';
  const rows =
    await prisma.flashcardDeck.findMany(
      {
        where:
          {
            userId,
            ...(at
              ? {
                  OR: [
                    {
                      updatedAt:
                        {
                          lt: at.updatedAt,
                        },
                    },
                    {
                      updatedAt:
                        at.updatedAt,
                      id: {
                        lt: at.id,
                      },
                    },
                  ],
                }
              : {}),
          },
        orderBy:
          [
            {
              updatedAt:
                'desc',
            },
            {
              id: 'desc',
            },
          ],
        take:
          limit +
          1,
        select:
          deckSelect,
      },
    );
  const more =
    rows.length >
    limit;
  const items =
    more
      ? rows.slice(
          0,
          limit,
        )
      : rows;
  const due =
    await dueCounts(
      userId,
      items.map(
        (
          d,
        ) =>
          d.id,
      ),
    );
  const last =
    items[
      items.length -
        1
    ];
  return {
    data: items.map(
      (
        d,
      ) =>
        toDeck(
          d,
          due.get(
            d.id,
          )
            ?.dueNow ??
            0,
        ),
    ),
    nextCursor:
      more &&
      last
        ? encodeDeckCursor(
            last.updatedAt,
            last.id,
          )
        : null,
  };
}

/** One of the key owner's decks, or null. */
export async function getMyDeck(
  userId: string,
  deckId: string,
): Promise<ApiDeck | null> {
  const row =
    await prisma.flashcardDeck.findFirst(
      {
        where:
          {
            id: deckId,
            userId,
          },
        select:
          deckSelect,
      },
    );
  if (
    !row
  )
    return null;
  const due =
    await dueCounts(
      userId,
      [
        row.id,
      ],
    );
  return toDeck(
    row,
    due.get(
      row.id,
    )
      ?.dueNow ??
      0,
  );
}

export async function createMyDeck(
  userId: string,
  input: {
    title: string;
    description?:
      | string
      | undefined;
    isPublic?:
      | boolean
      | undefined;
  },
) {
  const created =
    await createDeck(
      userId,
      input,
    );
  if (
    !created.ok
  )
    return created;
  const deck =
    await getMyDeck(
      userId,
      created.id,
    );
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
    title?:
      | string
      | undefined;
    description?:
      | string
      | undefined;
    isPublic?:
      | boolean
      | undefined;
  },
) {
  const result =
    await updateDeck(
      userId,
      deckId,
      {
        ...(patch.title !==
        undefined
          ? {
              title:
                patch.title,
            }
          : {}),
        ...(patch.description !==
        undefined
          ? {
              description:
                patch.description,
            }
          : {}),
        ...(patch.isPublic !==
        undefined
          ? {
              isPublic:
                patch.isPublic,
            }
          : {}),
      },
    );
  if (
    !result.ok
  )
    return result;
  const deck =
    await getMyDeck(
      userId,
      deckId,
    );
  return deck
    ? ({
        ok: true,
        deck,
      } as const)
    : notFound();
}

export const deleteMyDeck =
  deleteDeck;

const cardSelect =
  {
    id: true,
    kind: true,
    front: true,
    back: true,
    position: true,
    externalId: true,
  } satisfies Prisma.FlashcardSelect;

/** A deck's authored cards in deck order, keyset on (`position`, `id`); null when the deck is not the owner's. */
export async function listMyCards(
  userId: string,
  deckId: string,
  limit: number,
  cursor:
    | string
    | undefined,
): Promise<
  | Page<ApiCard>
  | 'invalid_cursor'
  | null
> {
  const at =
    cursor ===
    undefined
      ? null
      : decodeCardCursor(
          cursor,
        );
  if (
    cursor !==
      undefined &&
    !at
  )
    return 'invalid_cursor';
  const deck =
    await prisma.flashcardDeck.findFirst(
      {
        where:
          {
            id: deckId,
            userId,
          },
        select:
          {
            id: true,
          },
      },
    );
  if (
    !deck
  )
    return null;
  const rows =
    await prisma.flashcard.findMany(
      {
        where:
          {
            deckId,
            ...AUTHORED_WHERE,
            ...(at
              ? {
                  OR: [
                    {
                      position:
                        {
                          gt: at.position,
                        },
                    },
                    {
                      position:
                        at.position,
                      id: {
                        gt: at.id,
                      },
                    },
                  ],
                }
              : {}),
          },
        orderBy:
          [
            {
              position:
                'asc',
            },
            {
              id: 'asc',
            },
          ],
        take:
          limit +
          1,
        select:
          cardSelect,
      },
    );
  const more =
    rows.length >
    limit;
  const items =
    more
      ? rows.slice(
          0,
          limit,
        )
      : rows;
  const last =
    items[
      items.length -
        1
    ];
  return {
    data: items,
    nextCursor:
      more &&
      last
        ? encodeCardCursor(
            last.position,
            last.id,
          )
        : null,
  };
}

/** The authored card in this deck of this owner, or null (generated siblings are never found). */
async function ownedCard(
  userId: string,
  deckId: string,
  cardId: string,
) {
  return prisma.flashcard.findFirst(
    {
      where:
        {
          id: cardId,
          deckId,
          ...AUTHORED_WHERE,
          deck: {
            userId,
          },
        },
      select:
        cardSelect,
    },
  );
}

/** Add 1 to 100 cards in one transaction; nothing is written when any is invalid or the deck would overflow. */
export async function createMyCards(
  userId: string,
  deckId: string,
  drafts: readonly CardDraft[],
) {
  const result =
    await importCardsDetailed(
      userId,
      deckId,
      drafts,
      {
        max: API_BATCH_MAX,
      },
    );
  if (
    !result.ok
  )
    return result;
  const rows =
    await prisma.flashcard.findMany(
      {
        where:
          {
            id: {
              in: result.cards.map(
                (
                  c,
                ) =>
                  c.id,
              ),
            },
            deckId,
            ...AUTHORED_WHERE,
          },
        orderBy:
          [
            {
              position:
                'asc',
            },
            {
              id: 'asc',
            },
          ],
        select:
          cardSelect,
      },
    );
  return {
    ok: true,
    cards:
      rows,
    cardCount:
      result.cardCount,
  } as const;
}

export async function patchMyCard(
  userId: string,
  deckId: string,
  cardId: string,
  patch: CardPatch,
) {
  if (
    !(await ownedCard(
      userId,
      deckId,
      cardId,
    ))
  )
    return notFound();
  const result =
    await updateCard(
      userId,
      cardId,
      patch,
    );
  if (
    !result.ok
  )
    return result;
  const card =
    await ownedCard(
      userId,
      deckId,
      cardId,
    );
  return card
    ? ({
        ok: true,
        card,
      } as const)
    : notFound();
}

export async function deleteMyCard(
  userId: string,
  deckId: string,
  cardId: string,
): Promise<EditResult> {
  if (
    !(await ownedCard(
      userId,
      deckId,
      cardId,
    ))
  )
    return notFound();
  return deleteCard(
    userId,
    cardId,
  );
}

/** Create or update the card keyed `externalId`; `created` tells which. */
export async function upsertMyCard(
  userId: string,
  deckId: string,
  externalId: string,
  draft: CardDraft,
) {
  const result =
    await upsertCardByExternalId(
      userId,
      deckId,
      externalId,
      draft,
    );
  if (
    !result.ok
  )
    return result;
  const card =
    await ownedCard(
      userId,
      deckId,
      result.id,
    );
  return card
    ? ({
        ok: true,
        card,
        created:
          result.created,
      } as const)
    : notFound();
}

/** Counts due now and in the next 24 hours for one deck, or null when it is not the owner's. No card content. */
export async function dueFor(
  userId: string,
  deckId: string,
  now = new Date(),
) {
  const deck =
    await prisma.flashcardDeck.findFirst(
      {
        where:
          {
            id: deckId,
            userId,
          },
        select:
          {
            id: true,
          },
      },
    );
  if (
    !deck
  )
    return null;
  const counts =
    (
      await dueCounts(
        userId,
        [
          deckId,
        ],
        now,
      )
    ).get(
      deckId,
    ) ?? {
      dueNow: 0,
      dueNext24h: 0,
    };
  return {
    deckId,
    dueNow:
      counts.dueNow,
    dueNext24h:
      counts.dueNext24h,
    asOf: now.toISOString(),
  };
}

/* ---------------------------- route helpers ------------------------------- */

/** Writes also draw on the member's own `write` budget, on top of the key's rate limit. */
export function writeBudgetExceeded(
  userId: string,
): boolean {
  return !rateLimit(
    userId,
    {
      ...RATE_LIMIT_POLICIES.write,
      prefix:
        'v1-study-write',
    },
  )
    .allowed;
}

/** An editor refusal as a v1 error. The editor's messages are fixed strings, never a caught error. */
export function editFailure(
  error: ApiContext['error'],
  result: {
    status:
      | 400
      | 404
      | 409;
    error: string;
  },
) {
  if (
    result.status ===
    404
  )
    return error(
      'not_found',
      'Not found.',
      404,
    );
  if (
    result.status ===
    409
  )
    return error(
      'conflict',
      result.error,
      409,
    );
  return error(
    'invalid_request',
    result.error,
    400,
  );
}

/** Parse a request's JSON body; the first issue's message, never the raw input. */
export async function readBody<
  T extends
    z.ZodType,
>(
  request: Request,
  schema: T,
) {
  const raw =
    await request
      .json()
      .catch(
        () =>
          null,
      );
  const parsed =
    schema.safeParse(
      raw,
    );
  return parsed.success
    ? ({
        ok: true,
        data: parsed.data as z.infer<T>,
      } as const)
    : ({
        ok: false,
        message:
          parsed
            .error
            .issues[0]
            ?.message ??
          'Invalid request body',
      } as const);
}

/** Parse the path parameters or the query string with zod. */
export function readInput<
  T extends
    z.ZodType,
>(
  raw: unknown,
  schema: T,
) {
  const parsed =
    schema.safeParse(
      raw,
    );
  return parsed.success
    ? ({
        ok: true,
        data: parsed.data as z.infer<T>,
      } as const)
    : ({
        ok: false,
        message:
          parsed
            .error
            .issues[0]
            ?.message ??
          'Invalid request',
      } as const);
}

export const queryOf =
  (
    request: Request,
  ) =>
    Object.fromEntries(
      new URL(
        request.url,
      )
        .searchParams,
    );
