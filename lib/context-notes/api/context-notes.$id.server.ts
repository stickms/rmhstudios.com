import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { withdrawNote } from '@/lib/context-notes/notes.server';

/** DELETE /api/context-notes/:id — an author withdraws their own note. */
export const route = apiRoute('/api/context-notes/$id', {
  DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) =>
    (await withdrawNote(userId, params.id))
      ? Response.json({ ok: true })
      : Response.json({ error: 'Not found' }, { status: 404 }),
  ),
});
