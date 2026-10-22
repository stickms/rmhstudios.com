import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { setNoteHidden } from '@/lib/context-notes/notes.server';

/** PATCH /api/admin/context-notes/:id — { hidden } hides or restores a note. */
export const Route = createFileRoute('/api/admin/context-notes/$id')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: z.object({ hidden: z.boolean() }) },
        async ({ params, body }) =>
          (await setNoteHidden(params.id, body.hidden))
            ? Response.json({ ok: true })
            : Response.json({ error: 'Not found' }, { status: 404 }),
      ),
    },
  },
});
