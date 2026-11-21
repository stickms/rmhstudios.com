import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { z } from 'zod';
import { markNotificationsReadApi } from '@/lib/preferences/preferences.contract';
import { NOTIFICATION_FILTER_IDS } from '@/lib/notifications/filters';
import { markAllRead, setRead } from '@/lib/notifications/inbox.server';

/**
 * POST /api/notifications/read — mark notifications read.
 * Body: { all: true } to mark everything (with { filter } only that filter's types), or { ids: string[] } for
 * specific ones ({ read: false } marks those unread instead; a group's rows use this).
 */
const readSchema = z.object({
  all: z.boolean().optional(),
  ids: z.array(z.string().max(64)).max(200).optional(),
  filter: z.enum(NOTIFICATION_FILTER_IDS).optional(),
  read: z.boolean().optional(),
});

export const route = apiRoute('/api/notifications/read', {
  POST: implement(
    markNotificationsReadApi,
    { body: readSchema, allowEmptyBody: true },
    async ({ session, body }) => {
      const userId = session.user.id;
      if (body.all) {
        const updated = await markAllRead(userId, body.filter);
        return Response.json({ success: true, updated });
      }

      if (body.ids && body.ids.length > 0) {
        // Scoped to the caller's own rows inside setRead; only rows that actually flip are counted.
        const { changed } = await setRead(userId, body.ids, body.read ?? true);
        return Response.json({ success: true, updated: changed });
      }

      return Response.json({ success: true, updated: 0 });
    },
  ),
});
