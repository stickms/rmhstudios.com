import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createSpace, listLiveSpaces, SpaceError } from '@/lib/spaces.server';

/**
 * POST /api/spaces — create/schedule a Space (community spaces require the host
 *                    to be a community mod — enforced in `createSpace`).
 * GET  /api/spaces?live=1 — list live spaces (mirror of /api/spaces/live).
 */

const pinnedSchema = z
  .object({
    kind: z.enum(['post', 'url', 'music_room', 'tube_room']),
    ref: z.string().min(1).max(500),
  })
  .optional();

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  communityId: z.string().min(1).max(64).optional(),
  scheduledAt: z.string().datetime().optional(),
  recordChat: z.boolean().optional(),
  pinned: pinnedSchema,
});

export const Route = createFileRoute('/api/spaces/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const live = new URL(request.url).searchParams.get('live');
        if (live !== '1') {
          return Response.json({ error: 'Pass ?live=1 to list live spaces' }, { status: 400 });
        }
        const spaces = await listLiveSpaces();
        return Response.json({ spaces });
      },
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 10,
            windowMs: 60_000,
            prefix: 'space-create',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
              { status: 400 },
            );
          }

          const space = await createSpace({
            hostId: session.user.id,
            communityId: parsed.data.communityId ?? null,
            title: parsed.data.title,
            scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
            recordChat: parsed.data.recordChat,
            pinned: parsed.data.pinned ?? null,
          });

          return Response.json({ space }, { status: 201 });
        } catch (error) {
          if (error instanceof SpaceError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error('Create space error:', error);
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});
