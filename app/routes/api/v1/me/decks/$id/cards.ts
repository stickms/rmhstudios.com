import { createFileRoute } from '@tanstack/react-router';
import {
  withDeveloperApi,
  apiOptions,
} from '@/lib/api/with-developer-api.server';
import {
  batchBody,
  deckPath,
  pageQuery,
} from '@/lib/api/v1/study-schema';
import {
  createMyCards,
  editFailure,
  listMyCards,
  queryOf,
  readBody,
  readInput,
  writeBudgetExceeded,
} from '@/lib/api/v1/study.server';

/**
 * GET  /api/v1/me/decks/{id}/cards — the deck's authored cards in deck order (keyset by ?cursor).
 *      Generated siblings (reverse sides, cloze deletions) are never listed.
 * POST /api/v1/me/decks/{id}/cards — add 1 to 100 cards, all or nothing.
 */
export const Route =
  createFileRoute(
    '/api/v1/me/decks/$id/cards',
  )(
    {
      server:
        {
          handlers:
            {
              OPTIONS:
                () =>
                  apiOptions(),

              GET: ({
                request,
                params,
              }) =>
                withDeveloperApi(
                  request,
                  async ({
                    userId,
                    json,
                    error,
                  }) => {
                    const p =
                      readInput(
                        params,
                        deckPath,
                      );
                    if (
                      !p.ok
                    )
                      return error(
                        'invalid_request',
                        p.message,
                        400,
                      );
                    const q =
                      readInput(
                        queryOf(
                          request,
                        ),
                        pageQuery,
                      );
                    if (
                      !q.ok
                    )
                      return error(
                        'invalid_request',
                        q.message,
                        400,
                      );
                    const page =
                      await listMyCards(
                        userId,
                        p
                          .data
                          .id,
                        q
                          .data
                          .limit,
                        q
                          .data
                          .cursor,
                      );
                    if (
                      page ===
                      'invalid_cursor'
                    )
                      return error(
                        'invalid_request',
                        'Invalid cursor.',
                        400,
                      );
                    return page
                      ? json(
                          page,
                        )
                      : error(
                          'not_found',
                          'Deck not found.',
                          404,
                        );
                  },
                  {
                    scope:
                      'read:study',
                  },
                ),

              POST: ({
                request,
                params,
              }) =>
                withDeveloperApi(
                  request,
                  async ({
                    userId,
                    json,
                    error,
                  }) => {
                    const p =
                      readInput(
                        params,
                        deckPath,
                      );
                    if (
                      !p.ok
                    )
                      return error(
                        'invalid_request',
                        p.message,
                        400,
                      );
                    const body =
                      await readBody(
                        request,
                        batchBody,
                      );
                    if (
                      !body.ok
                    )
                      return error(
                        'invalid_request',
                        body.message,
                        400,
                      );
                    if (
                      writeBudgetExceeded(
                        userId,
                      )
                    )
                      return error(
                        'rate_limited',
                        'Too many writes. Slow down.',
                        429,
                      );
                    const result =
                      await createMyCards(
                        userId,
                        p
                          .data
                          .id,
                        body
                          .data
                          .cards,
                      );
                    if (
                      !result.ok
                    )
                      return editFailure(
                        error,
                        result,
                      );
                    return json(
                      {
                        data: result.cards,
                        cardCount:
                          result.cardCount,
                      },
                      201,
                    );
                  },
                  {
                    scope:
                      'write:study',
                    idempotent: true,
                  },
                ),
            },
        },
    },
  );
