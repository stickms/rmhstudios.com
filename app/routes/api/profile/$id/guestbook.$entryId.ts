import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { moderateEntry } from '@/lib/guestbook/guestbook.server';

/**
 * PATCH  /api/profile/:id/guestbook/:entryId — owner hides or restores an entry.
 * DELETE /api/profile/:id/guestbook/:entryId — the author removes their own.
 */
const hideSchema = z.object({ hidden: z.boolean() });

export const Route = createFileRoute('/api/profile/$id/guestbook/$entryId')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { rateLimit: 'write', body: hideSchema },
        async ({ userId, params, body }) => {
          if (params.id !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });
          const ok = await moderateEntry(params.entryId, userId, body.hidden ? 'hide' : 'unhide');
          if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ ok: true });
        },
      ),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const ok = await moderateEntry(params.entryId, userId, 'delete');
        if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ ok: true });
      }),
    },
  },
});
