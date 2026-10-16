import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { rateNoteSchema } from '@/lib/context-notes/bridging';
import { rateNote } from '@/lib/context-notes/notes.server';

/** POST /api/context-notes/:id/rate — { helpful } (one rating per member, changeable). */
export const Route = createFileRoute('/api/context-notes/$id/rate')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'context-note-rate' },
          body: rateNoteSchema,
        },
        async ({ userId, params, body }) => {
          const r = await rateNote(userId, params.id, body.helpful);
          if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
