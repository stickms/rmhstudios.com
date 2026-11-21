import { createFileRoute } from '@tanstack/react-router';
import {
  withDeveloperApi,
  apiOptions,
} from '@/lib/api/with-developer-api.server';
import {
  createDeckBody,
  pageQuery,
} from '@/lib/api/v1/study-schema';
import {
  createMyDeck,
  editFailure,
  listMyDecks,
  queryOf,
  readBody,
  readInput,
  writeBudgetExceeded,
} from '@/lib/api/v1/study.server';

/**
 * GET  /api/v1/me/decks — your flashcard decks, newest change first (keyset by ?cursor).
 * POST /api/v1/me/decks — create a deck.
 */
export const Route =
  createFileRoute(
    '/api/v1/me/decks',
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
              }) =>
                withDeveloperApi(
                  request,
                  async ({
                    userId,
                    json,
                    error,
                  }) => {
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
                      await listMyDecks(
                        userId,
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
                    return json(
                      page,
                    );
                  },
                  {
                    scope:
                      'read:study',
                  },
                ),

              POST: ({
                request,
              }) =>
                withDeveloperApi(
                  request,
                  async ({
                    userId,
                    json,
                    error,
                  }) => {
                    const body =
                      await readBody(
                        request,
                        createDeckBody,
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
                      await createMyDeck(
                        userId,
                        body.data,
                      );
                    if (
                      !result.ok
                    )
                      return editFailure(
                        error,
                        result,
                      );
                    return json(
                      result.deck,
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
