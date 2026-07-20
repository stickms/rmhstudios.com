import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { httpUrl } from '@/lib/url-safety';
import { createEvent, listEvents, EventError, type EventScope } from '@/lib/events.server';

const venueKindSchema = z.enum(['SPACE', 'TOURNAMENT', 'GAME', 'URL', 'IRL']);

const createSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(2000).optional().default(''),
    communityId: z.string().min(1).max(191).optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional(),
    venueKind: venueKindSchema,
    venueRef: z.string().trim().max(191).optional(),
    capacity: z.coerce.number().int().min(1).max(1_000_000).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.endsAt && d.endsAt <= d.startsAt) {
      ctx.addIssue({ code: 'custom', message: 'End must be after start', path: ['endsAt'] });
    }
    if (d.venueKind === 'URL' && !httpUrl(191).safeParse(d.venueRef ?? '').success) {
      ctx.addIssue({
        code: 'custom',
        message: 'A valid http(s) URL is required',
        path: ['venueRef'],
      });
    }
  });

/** Map an EventError code to an [message, status] pair for the response. */
function mapEventError(err: EventError): [string, number] {
  switch (err.code) {
    case 'NOT_FOUND':
      return ['Not found', 404];
    case 'FORBIDDEN':
      return ['Only community mods can host events here', 403];
    case 'INVALID_DATES':
      return ['Invalid start/end time', 400];
    case 'INVALID_VENUE_URL':
      return ['Invalid venue URL', 400];
    case 'CAPACITY_FULL':
      return ['This event is full', 409];
    case 'CANCELED':
      return ['This event was canceled', 409];
    default:
      return ['Could not save event', 400];
  }
}

/**
 * GET  /api/events?scope=upcoming|community|mine[&communityId=] — list events.
 * POST /api/events — create an event (community events require mod/owner role).
 */
export const Route = createFileRoute('/api/events/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const url = new URL(request.url);
          const scopeParam = url.searchParams.get('scope') ?? 'upcoming';
          const scope: EventScope =
            scopeParam === 'community' || scopeParam === 'mine' ? scopeParam : 'upcoming';
          if (scope === 'mine' && !session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const events = await listEvents({
            scope,
            communityId: url.searchParams.get('communityId'),
            userId: session?.user.id ?? null,
          });
          return Response.json({ events });
        } catch (error) {
          console.error('List events error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 10,
            windowMs: 60_000,
            prefix: 'event-create',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
              { status: 400 },
            );
          }

          const event = await createEvent({
            hostId: session.user.id,
            communityId: parsed.data.communityId ?? null,
            title: parsed.data.title,
            description: parsed.data.description,
            startsAt: parsed.data.startsAt,
            endsAt: parsed.data.endsAt ?? null,
            venueKind: parsed.data.venueKind,
            venueRef: parsed.data.venueRef ?? null,
            capacity: parsed.data.capacity ?? null,
          });
          return Response.json({ event }, { status: 201 });
        } catch (error) {
          if (error instanceof EventError) {
            const [message, status] = mapEventError(error);
            return Response.json({ error: message }, { status });
          }
          console.error('Create event error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
