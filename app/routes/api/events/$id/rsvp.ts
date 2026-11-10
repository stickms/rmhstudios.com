import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { rsvp, unrsvp, EventError } from '@/lib/events.server';

const rsvpSchema = z.object({
  status: z.enum(['going', 'maybe']),
  // K4 — repeating events: carry the RSVP over to every occurrence, or pin it to one date.
  everyTime: z.boolean().optional(),
  occurrenceAt: z.coerce.date().optional(),
});
const withdrawQuery = z.object({
  scope: z.enum(['occurrence', 'all']).optional(),
  occurrenceAt: z.coerce.date().optional(),
});

function mapEventError(err: EventError): [string, number] {
  switch (err.code) {
    case 'NOT_FOUND':
      return ['Not found', 404];
    case 'CAPACITY_FULL':
      return ['This event is full', 409];
    case 'CANCELED':
      return ['This event was canceled', 409];
    default:
      return ['Could not update RSVP', 400];
  }
}

/**
 * POST   /api/events/$id/rsvp — RSVP going/maybe (schedules reminders on 'going').
 * DELETE /api/events/$id/rsvp — withdraw RSVP.
 */
export const Route = createFileRoute('/api/events/$id/rsvp')({
  server: {
    handlers: {
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
              const [message, status] = mapEventError(error);
              return Response.json({ error: message }, { status });
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
              const [message, status] = mapEventError(error);
              return Response.json({ error: message }, { status });
            }
            throw error;
          }
        },
      ),
    },
  },
});
