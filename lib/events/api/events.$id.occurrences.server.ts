import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { EventError } from '@/lib/events/event-error';
import {
  restoreOccurrenceApi,
  setOccurrenceApi,
} from '@/lib/events/occurrences.contract';
import {
  restoreOccurrenceQuery,
  setOccurrenceBody,
} from '@/lib/events/occurrences-schema';
import { summarizeOccurrence } from '@/lib/calendar/recurring-events.server';
import type { OccurrencesRes } from '@/lib/events/occurrences.contract';
import {
  OccurrenceChangeError,
  restoreOccurrence,
  setOverride,
} from '@/lib/events/occurrences.server';

/** Adds the caller's counts for the date the card leads with, so a card whose shown date changed is not left stale. */
async function withSummary(
  eventId: string,
  userId: string,
  res: {
    upcoming: OccurrencesRes['upcoming'];
  },
): Promise<OccurrencesRes> {
  const live =
    res.upcoming.find(
      (
        u,
      ) =>
        u.state !==
        'skipped',
    );
  if (
    !live
  )
    return {
      ...res,
      summary:
        null,
    };
  const s =
    await summarizeOccurrence(
      eventId,
      new Date(
        live.occurrenceAt,
      ),
      userId,
    );
  return {
    ...res,
    summary:
      {
        occurrenceAt:
          live.occurrenceAt,
        goingCount:
          s.goingCount,
        maybeCount:
          s.maybeCount,
        viewerRsvp:
          s.viewerRsvp ===
            'going' ||
          s.viewerRsvp ===
            'maybe'
            ? s.viewerRsvp
            : null,
      },
  };
}

/** A refusal as the response: a stable `code` for the client, a plain message, never the caught error. */
function refused(
  error: unknown,
): Response {
  if (
    error instanceof
    EventError
  ) {
    if (
      error.code ===
      'FORBIDDEN'
    ) {
      return Response.json(
        {
          error:
            'Only the host or a co-host can change dates',
          code: 'FORBIDDEN',
        },
        {
          status: 403,
        },
      );
    }
    return Response.json(
      {
        error:
          'Not found',
        code: 'NOT_FOUND',
      },
      {
        status: 404,
      },
    );
  }
  if (
    error instanceof
    OccurrenceChangeError
  ) {
    const status =
      error.code ===
      'CANCELED'
        ? 409
        : 400;
    return Response.json(
      {
        error:
          'That date cannot be changed',
        code: error.code,
      },
      {
        status,
      },
    );
  }
  throw error;
}

/**
 * PUT    /api/events/$id/occurrences                  — skip or move one future date (host, co-host or admin).
 * DELETE /api/events/$id/occurrences?occurrenceAt=…   — bring it back.
 */
export const route =
  apiRoute(
    '/api/events/$id/occurrences',
    {
      PUT: implement(
        setOccurrenceApi,
        {
          rateLimit:
            'write',
          body: setOccurrenceBody,
        },
        async ({
          params,
          userId,
          isAdmin,
          body,
        }) => {
          try {
            return await withSummary(
              params.id,
              userId,
              await setOverride(
                params.id,
                userId,
                isAdmin,
                {
                  occurrenceAt:
                    new Date(
                      body.occurrenceAt,
                    ),
                  kind: body.kind,
                  startsAt:
                    body.startsAt
                      ? new Date(
                          body.startsAt,
                        )
                      : null,
                  endsAt:
                    body.endsAt
                      ? new Date(
                          body.endsAt,
                        )
                      : null,
                  note:
                    body.note ??
                    null,
                },
              ),
            );
          } catch (error) {
            return refused(
              error,
            );
          }
        },
      ),

      DELETE:
        implement(
          restoreOccurrenceApi,
          {
            rateLimit:
              'write',
            query:
              restoreOccurrenceQuery,
          },
          async ({
            params,
            userId,
            isAdmin,
            query,
          }) => {
            try {
              return await withSummary(
                params.id,
                userId,
                await restoreOccurrence(
                  params.id,
                  userId,
                  isAdmin,
                  new Date(
                    query.occurrenceAt,
                  ),
                ),
              );
            } catch (error) {
              return refused(
                error,
              );
            }
          },
        ),
    },
  );
