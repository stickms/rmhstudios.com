import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { noteBodySchema } from '@/lib/context-notes/bridging';
import { getPostNotes, proposeNote } from '@/lib/context-notes/notes.server';

const query = z.object({ postId: z.string().min(1).max(40) });

/**
 * X3 context notes.
 * GET  ?postId= — visible notes, plus (signed in) the pending ones to rate.
 * POST — propose a note on a post.
 */
export const Route = createFileRoute('/api/context-notes/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query },
        async ({ userId, query }) => {
          const notes = await getPostNotes(query.postId, userId);
          if (!notes) return Response.json({ error: 'Post not found' }, { status: 404 });
          return Response.json(notes, { headers: { 'Cache-Control': 'private, no-store' } });
        },
      ),
      POST: defineHandler(
        {
          rateLimit: { limit: 10, windowMs: 24 * 60 * 60_000, prefix: 'context-note-propose' },
          body: noteBodySchema,
        },
        async ({ userId, body }) => {
          const r = await proposeNote(userId, body.postId, body.body);
          if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
          return Response.json({ id: r.id }, { status: 201 });
        },
      ),
    },
  },
});
