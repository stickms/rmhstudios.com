import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { rsvp, unrsvp, EventError } from '@/lib/events.server';
import { denyCode, denyText } from '@/lib/communities/bans';
import { refusalBody, type ErrorCode } from '@/lib/errors/codes';

const rsvpSchema = z.object({
  // 'waitlist' joins the waitlist of a full one-off event; a plain 'going' on a full event is still refused.
  status: z.enum(['going', 'maybe', 'waitlist']),
  // K4 — repeating events: carry the RSVP over to every occurrence, or pin it to one date.
  everyTime: z.boolean().optional(),
  occurrenceAt: z.coerce.date().optional(),
});
const withdrawQuery = z.object({
  scope: z.enum(['occurrence', 'all']).optional(),
  occurrenceAt: z.coerce.date().optional(),
});

function mapEventError(err: EventError): [ErrorCode, number] {
  switch (err.code) {
    case 'NOT_FOUND':
      return ['EVENT_NOT_FOUND', 404];
    case 'CAPACITY_FULL':
      return ['EVENT_FULL', 409];
    case 'WAITLIST_CLOSED':
      return ['WAITLIST_CLOSED', 409];
    case 'WAITLIST_FULL':
      return ['WAITLIST_FULL', 409];
    case 'CANCELED':
      return ['EVENT_CANCELED', 409];
    case 'OCCURRENCE_SKIPPED':
      return ['EVENT_DATE_SKIPPED', 409];
    default:
      return ['RSVP_FAILED', 400];
  }
}

/**
 * POST   /api/events/$id/rsvp — RSVP going/maybe, or join the waitlist of a full event (schedules reminders on 'going').
 * DELETE /api/events/$id/rsvp — withdraw RSVP.
 */
export const route = apiRoute('/api/events/$id/rsvp', {
  POST: defineHandler(
    {
      rateLimit: { limit: 30, windowMs: 60_000, prefix: 'event-rsvp' },
      body: rsvpSchema,
      allowEmptyBody: true,
      invalid: () => Response.json({ error: 'Invalid input' }, { status: 400 }),
    },
    async ({ params, session, body }) => {
      try {
        const result = await rsvp(params.id, session.user.id, body.status, {
          everyTime: body.everyTime,
          occurrenceAt: body.occurrenceAt,
        });
        return Response.json(result);
      } catch (error) {
        if (error instanceof EventError) {
          if (error.code === 'COMMUNITY_SANCTIONED' && error.sanction) {
            // The same refusal body as the community's join and write paths (useSanctionRefusal reads it).
            const { kind, endsAt } = error.sanction;
            return Response.json(
              {
                error: denyText(kind, endsAt),
                code: denyCode(kind),
                endsAt: endsAt ? endsAt.toISOString() : null,
              },
              { status: 403 },
            );
          }
          const [code, status] = mapEventError(error);
          return Response.json({ ...refusalBody(code) }, { status });
        }
        throw error;
      }
    },
  ),

  DELETE: defineHandler(
    {
      rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:events/:id/rsvp' },
      query: withdrawQuery,
    },
    async ({ params, session, query }) => {
      try {
        const result = await unrsvp(params.id, session.user.id, {
          scope: query.scope,
          occurrenceAt: query.occurrenceAt,
        });
        return Response.json(result);
      } catch (error) {
        if (error instanceof EventError) {
          const [code, status] = mapEventError(error);
          return Response.json({ ...refusalBody(code) }, { status });
        }
        throw error;
      }
    },
  ),
});
