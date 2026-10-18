import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { withdrawNote } from '@/lib/context-notes/notes.server';

/** DELETE /api/context-notes/:id — an author withdraws their own note. */
export const Route = createFileRoute('/api/context-notes/$id/')({
  server: {
    handlers: {
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) =>
        (await withdrawNote(userId, params.id))
          ? Response.json({ ok: true })
          : Response.json({ error: 'Not found' }, { status: 404 }),
      ),
    },
  },
});
