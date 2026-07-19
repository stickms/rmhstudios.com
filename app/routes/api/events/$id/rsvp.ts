import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { rsvp, unrsvp, EventError } from '@/lib/events.server';

const rsvpSchema = z.object({ status: z.enum(['going', 'maybe']) });

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
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'event-rsvp',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const parsed = rsvpSchema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const result = await rsvp(params.id, session.user.id, parsed.data.status);
          return Response.json(result);
        } catch (error) {
          if (error instanceof EventError) {
            const [message, status] = mapEventError(error);
            return Response.json({ error: message }, { status });
          }
          console.error('RSVP error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const result = await unrsvp(params.id, session.user.id);
          return Response.json(result);
        } catch (error) {
          console.error('Un-RSVP error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
