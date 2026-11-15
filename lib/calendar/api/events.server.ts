import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { httpUrl } from '@/lib/url-schema';
import { createEvent, listEvents, EventError, type EventScope } from '@/lib/events.server';
import { eventRecurrenceSchema } from '@/lib/calendar/schema';

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
    recurrence: eventRecurrenceSchema.optional(),
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
    case 'INVALID_RECURRENCE':
      return ['Invalid repeat settings', 400];
    default:
      return ['Could not save event', 400];
  }
}

/**
 * GET  /api/events?scope=upcoming|community|mine[&communityId=] — list events.
 * POST /api/events — create an event (community events require mod/owner role).
 */
export const route = apiRoute('/api/events', {
  GET: defineHandler({ auth: 'optional' }, async ({ request, session }) => {
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
  }),

  POST: defineHandler(
    {
      rateLimit: { limit: 10, windowMs: 60_000, prefix: 'event-create' },
      body: createSchema,
      allowEmptyBody: true,
      invalid: (error) =>
        Response.json({ error: error.issues[0]?.message ?? 'Invalid input' }, { status: 400 }),
    },
    async ({ session, body }) => {
      try {
        const event = await createEvent({
          hostId: session.user.id,
          communityId: body.communityId ?? null,
          title: body.title,
          description: body.description,
          startsAt: body.startsAt,
          endsAt: body.endsAt ?? null,
          venueKind: body.venueKind,
          venueRef: body.venueRef ?? null,
          capacity: body.capacity ?? null,
          recurrence: body.recurrence ?? null,
        });
        return Response.json({ event }, { status: 201 });
      } catch (error) {
        if (error instanceof EventError) {
          const [message, status] = mapEventError(error);
          return Response.json({ error: message }, { status });
        }
        throw error;
      }
    },
  ),
});
