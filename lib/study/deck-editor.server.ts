/**
 * Deck editing: every write checks the deck's owner inside the same query or
 * transaction, so a foreign or missing deck or card is indistinguishable
 * (`not_found`), and `cardCount` moves in the same transaction as the cards.
 */
import { prisma } from '@/lib/prisma.server';
import {
  MAX_DECK_CARDS,
  MAX_IMPORT_CARDS,
} from '@/lib/study/limits';

export type EditResult<
  T =
    object,
> =
  | ({
      ok: true;
    } & T)
  | {
      ok: false;
      status:
        | 400
        | 404;
      error: string;
    };

const NOT_FOUND =
  {
    ok: false,
    status: 404,
    error:
      'Not found',
  } as const;

export async function updateDeck(
  userId: string,
  deckId: string,
  patch: {
    title?: string;
    description?: string;
    isPublic?: boolean;
  },
): Promise<EditResult> {
  const data: {
    title?: string;
    description?:
      | string
      | null;
    isPublic?: boolean;
  } =
    {};
  if (
    patch.title !==
    undefined
  )
    data.title =
      patch.title;
  // A blank description clears it.
  if (
    patch.description !==
    undefined
  )
    data.description =
      patch.description ||
      null;
  if (
    patch.isPublic !==
    undefined
  )
    data.isPublic =
      patch.isPublic;
  const {
    count,
  } =
    await prisma.flashcardDeck.updateMany(
      {
        where:
          {
            id: deckId,
            userId,
          },
        data,
      },
    );
  return count ===
    0
    ? NOT_FOUND
    : {
        ok: true,
      };
}

/** Edits the text only; the card row, and so its reviews, stay. */
export async function updateCard(
  userId: string,
  cardId: string,
  patch: {
    front?: string;
    back?: string;
  },
): Promise<EditResult> {
  const {
    count,
  } =
    await prisma.flashcard.updateMany(
      {
        where:
          {
            id: cardId,
            deck: {
              userId,
            },
          },
        data: patch,
      },
    );
  return count ===
    0
    ? NOT_FOUND
    : {
        ok: true,
      };
}

/** Deletes the card (its reviews go with it) and lowers the deck's count. */
export async function deleteCard(
  userId: string,
  cardId: string,
): Promise<EditResult> {
  return prisma.$transaction(
    async (
      tx,
    ) => {
      const card =
        await tx.flashcard.findFirst(
          {
            where:
              {
                id: cardId,
                deck: {
                  userId,
                },
              },
            select:
              {
                deckId: true,
              },
          },
        );
      if (
        !card
      )
        return NOT_FOUND;
      // deleteMany: a concurrent second delete finds nothing and answers 404, not a 500.
      const {
        count,
      } =
        await tx.flashcard.deleteMany(
          {
            where:
              {
                id: cardId,
              },
          },
        );
      if (
        count ===
        0
      )
        return NOT_FOUND;
      await tx.flashcardDeck.update(
        {
          where:
            {
              id: card.deckId,
            },
          data: {
            cardCount:
              {
                decrement: 1,
              },
          },
        },
      );
      return {
        ok: true,
      } as const;
    },
  );
}

/**
 * Add cards after the current last one. Refused whole when the import is over
 * its size or the deck would pass its cap; nothing is written then.
 */
export async function importCards(
  userId: string,
  deckId: string,
  cards: {
    front: string;
    back: string;
  }[],
): Promise<
  EditResult<{
    created: number;
    cardCount: number;
  }>
> {
  if (
    cards.length ===
      0 ||
    cards.length >
      MAX_IMPORT_CARDS
  ) {
    return {
      ok: false,
      status: 400,
      error:
        'Invalid import',
    };
  }
  return prisma.$transaction(
    async (
      tx,
    ) => {
      const deck =
        await tx.flashcardDeck.findFirst(
          {
            where:
              {
                id: deckId,
                userId,
              },
            select:
              {
                cardCount: true,
              },
          },
        );
      if (
        !deck
      )
        return NOT_FOUND;
      if (
        deck.cardCount +
          cards.length >
        MAX_DECK_CARDS
      ) {
        return {
          ok: false,
          status: 400,
          error:
            'Deck is full',
        } as const;
      }
      const last =
        await tx.flashcard.aggregate(
          {
            where:
              {
                deckId,
              },
            _max: {
              position: true,
            },
          },
        );
      const start =
        (last
          ._max
          .position ??
          -1) +
        1;
      await tx.flashcard.createMany(
        {
          data: cards.map(
            (
              c,
              i,
            ) => ({
              deckId,
              front:
                c.front,
              back: c.back,
              position:
                start +
                i,
            }),
          ),
        },
      );
      const updated =
        await tx.flashcardDeck.update(
          {
            where:
              {
                id: deckId,
              },
            data: {
              cardCount:
                {
                  increment:
                    cards.length,
                },
            },
            select:
              {
                cardCount: true,
              },
          },
        );
      return {
        ok: true,
        created:
          cards.length,
        cardCount:
          updated.cardCount,
      } as const;
    },
  );
}

/** `cardIds` must be exactly the deck's cards (no more, no fewer, no repeats). */
export async function reorderCards(
  userId: string,
  deckId: string,
  cardIds: string[],
): Promise<EditResult> {
  return prisma.$transaction(
    async (
      tx,
    ) => {
      const deck =
        await tx.flashcardDeck.findFirst(
          {
            where:
              {
                id: deckId,
                userId,
              },
            select:
              {
                cards:
                  {
                    select:
                      {
                        id: true,
                        position: true,
                      },
                  },
              },
          },
        );
      if (
        !deck
      )
        return NOT_FOUND;
      const current =
        new Map(
          deck.cards.map(
            (
              c,
            ) => [
              c.id,
              c.position,
            ],
          ),
        );
      const unique =
        new Set(
          cardIds,
        );
      if (
        unique.size !==
          cardIds.length ||
        cardIds.length !==
          current.size ||
        !cardIds.every(
          (
            id,
          ) =>
            current.has(
              id,
            ),
        )
      ) {
        return {
          ok: false,
          status: 400,
          error:
            'Cards do not match the deck',
        } as const;
      }
      // Only the cards whose slot changed are written.
      for (const [
        position,
        id,
      ] of cardIds.entries()) {
        if (
          current.get(
            id,
          ) !==
          position
        ) {
          await tx.flashcard.update(
            {
              where:
                {
                  id,
                },
              data: {
                position,
              },
            },
          );
        }
      }
      return {
        ok: true,
      } as const;
    },
    {
      timeout: 30_000,
    },
  );
}
