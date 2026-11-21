import { createFileRoute } from '@tanstack/react-router';
import {
  withDeveloperApi,
  apiOptions,
} from '@/lib/api/with-developer-api.server';
import {
  cardPath,
  patchCardBody,
} from '@/lib/api/v1/study-schema';
import {
  deleteMyCard,
  editFailure,
  patchMyCard,
  readBody,
  readInput,
  writeBudgetExceeded,
} from '@/lib/api/v1/study.server';

/**
 * PATCH  /api/v1/me/decks/{id}/cards/{cardId} — edit an authored card (its review history stays).
 * DELETE /api/v1/me/decks/{id}/cards/{cardId} — delete it with its generated cards.
 * A deck or card that is not yours, or a generated card, is 404.
 */
export const Route =
  createFileRoute(
    '/api/v1/me/decks/$id/cards/$cardId',
  )(
    {
      server:
        {
          handlers:
            {
              OPTIONS:
                () =>
                  apiOptions(),

              PATCH:
                ({
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
                          cardPath,
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
                          patchCardBody,
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
                        await patchMyCard(
                          userId,
                          p
                            .data
                            .id,
                          p
                            .data
                            .cardId,
                          body.data,
                        );
                      return result.ok
                        ? json(
                            result.card,
                          )
                        : editFailure(
                            error,
                            result,
                          );
                    },
                    {
                      scope:
                        'write:study',
                      idempotent: true,
                    },
                  ),

              DELETE:
                ({
                  request,
                  params,
                }) =>
                  withDeveloperApi(
                    request,
                    async ({
                      userId,
                      noContent,
                      error,
                    }) => {
                      const p =
                        readInput(
                          params,
                          cardPath,
                        );
                      if (
                        !p.ok
                      )
                        return error(
                          'invalid_request',
                          p.message,
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
                        await deleteMyCard(
                          userId,
                          p
                            .data
                            .id,
                          p
                            .data
                            .cardId,
                        );
                      return result.ok
                        ? noContent()
                        : editFailure(
                            error,
                            result,
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
