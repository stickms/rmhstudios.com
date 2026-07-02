import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

/**
 * GET /api/notifications/preferences — the caller's per-type toggles
 * (defaults when no row exists yet).
 * PUT /api/notifications/preferences — save toggles (upsert).
 */
const DEFAULTS = {
  likes: true,
  comments: true,
  follows: true,
  mentions: true,
  reposts: true,
  system: true,
};

const prefsSchema = z.object({
  likes: z.boolean().optional(),
  comments: z.boolean().optional(),
  follows: z.boolean().optional(),
  mentions: z.boolean().optional(),
  reposts: z.boolean().optional(),
  system: z.boolean().optional(),
});

export const Route = createFileRoute('/api/notifications/preferences')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const prefs = await prisma.notificationPreference.findUnique({
            where: { userId: session.user.id },
          });
          const { likes, comments, follows, mentions, reposts, system } = prefs ?? DEFAULTS;
          return Response.json({ likes, comments, follows, mentions, reposts, system });
        } catch (error) {
          console.error('Notification prefs fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      PUT: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const body = await request.json().catch(() => null);
          const parsed = prefsSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }
          const prefs = await prisma.notificationPreference.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, ...parsed.data },
            update: parsed.data,
          });
          const { likes, comments, follows, mentions, reposts, system } = prefs;
          return Response.json({ likes, comments, follows, mentions, reposts, system });
        } catch (error) {
          console.error('Notification prefs save error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
