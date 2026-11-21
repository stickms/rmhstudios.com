import { createFileRoute } from '@tanstack/react-router';
import {
  withDeveloperApi,
  apiOptions,
} from '@/lib/api/with-developer-api.server';
import {
  externalCardPath,
  upsertCardBody,
} from '@/lib/api/v1/study-schema';
import {
  editFailure,
  readBody,
  readInput,
  upsertMyCard,
  writeBudgetExceeded,
} from '@/lib/api/v1/study.server';

/**
 * PUT /api/v1/me/decks/{id}/cards/by-external-id/{externalId} — create the card keyed by your own id,
 * or update it; the same body twice changes nothing. 201 when created, 200 when it already existed.
 */
export const Route =
  createFileRoute(
    '/api/v1/me/decks/$id/cards/by-external-id/$externalId',
  )(
    {
      server:
        {
          handlers:
            {
              OPTIONS:
                () =>
                  apiOptions(),

              PUT: ({
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
                        externalCardPath,
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
                        upsertCardBody,
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
                      await upsertMyCard(
                        userId,
                        p
                          .data
                          .id,
                        p
                          .data
                          .externalId,
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
                      result.card,
                      result.created
                        ? 201
                        : 200,
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
