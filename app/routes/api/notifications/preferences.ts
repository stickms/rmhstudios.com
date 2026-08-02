import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
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
      GET: defineHandler({}, async ({ session }) => {
        const prefs = await prisma.notificationPreference.findUnique({
          where: { userId: session.user.id },
        });
        const { likes, comments, follows, mentions, reposts, system } = prefs ?? DEFAULTS;
        return Response.json({ likes, comments, follows, mentions, reposts, system });
      }),

      PUT: defineHandler({ body: prefsSchema }, async ({ session, body }) => {
        const prefs = await prisma.notificationPreference.upsert({
          where: { userId: session.user.id },
          create: { userId: session.user.id, ...body },
          update: body,
        });
        const { likes, comments, follows, mentions, reposts, system } = prefs;
        return Response.json({ likes, comments, follows, mentions, reposts, system });
      }),
    },
  },
});
