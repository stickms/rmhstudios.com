import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { httpUrl } from '@/lib/url-safety';
import { getEvent, updateEvent, cancelEvent, EventError } from '@/lib/events.server';

const venueKindSchema = z.enum(['SPACE', 'TOURNAMENT', 'GAME', 'URL', 'IRL']);

const updateSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    venueKind: venueKindSchema.optional(),
    venueRef: z.string().trim().max(191).nullable().optional(),
    capacity: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.venueKind === 'URL' && d.venueRef !== undefined && !httpUrl(191).safeParse(d.venueRef ?? '').success) {
      ctx.addIssue({ code: 'custom', message: 'A valid http(s) URL is required', path: ['venueRef'] });
    }
  });

function mapEventError(err: EventError): [string, number] {
  switch (err.code) {
    case 'NOT_FOUND':
      return ['Not found', 404];
    case 'FORBIDDEN':
      return ['You can only manage events you host', 403];
    case 'INVALID_DATES':
      return ['Invalid start/end time', 400];
    case 'INVALID_VENUE_URL':
      return ['Invalid venue URL', 400];
    default:
      return ['Could not update event', 400];
  }
}

/**
 * GET    /api/events/$id — event details (counts + attendee sample + viewer RSVP).
 * PATCH  /api/events/$id — update (host only).
 * DELETE /api/events/$id — cancel (host only).
 */
export const Route = createFileRoute('/api/events/$id/')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const event = await getEvent(params.id, session?.user.id ?? null);
          if (!event) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ event });
        } catch (error) {
          console.error('Get event error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      PATCH: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 20,
            windowMs: 60_000,
            prefix: 'event-update',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
              { status: 400 },
            );
          }

          const event = await updateEvent({ id: params.id, hostId: session.user.id, ...parsed.data });
          return Response.json({ event });
        } catch (error) {
          if (error instanceof EventError) {
            const [message, status] = mapEventError(error);
            return Response.json({ error: message }, { status });
          }
          console.error('Update event error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const event = await cancelEvent(params.id, session.user.id);
          return Response.json({ event });
        } catch (error) {
          if (error instanceof EventError) {
            const [message, status] = mapEventError(error);
            return Response.json({ error: message }, { status });
          }
          console.error('Cancel event error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
