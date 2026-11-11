import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { z } from 'zod';
import { getNotificationToggles } from '@/lib/settings/prefs.server';
import { prisma } from '@/lib/prisma.server';
import { invalidateNotificationPrefs } from '@/lib/notifications.server';
import { getNotificationTogglesApi } from '@/lib/preferences/preferences.contract';
import { setNotificationTogglesApi } from '@/lib/preferences/preferences.contract';

/**
 * GET /api/notifications/preferences — the caller's per-type toggles
 * (defaults when no row exists yet).
 * PUT /api/notifications/preferences — save toggles (upsert).
 */

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
      GET: implement(getNotificationTogglesApi, {}, async ({ session }) =>
        Response.json(await getNotificationToggles(session.user.id)),
      ),

      PUT: implement(
        setNotificationTogglesApi,
        { body: prefsSchema },
        async ({ session, body }) => {
          const prefs = await prisma.notificationPreference.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, ...body },
            update: body,
          });
          // perf: createNotification() caches mute prefs for 60s; drop it so the toggle is instant.
          invalidateNotificationPrefs(session.user.id);
          const { likes, comments, follows, mentions, reposts, system } = prefs;
          return Response.json({ likes, comments, follows, mentions, reposts, system });
        },
      ),
    },
  },
});
