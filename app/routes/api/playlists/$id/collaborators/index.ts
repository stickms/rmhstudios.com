import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { HANDLE_REGEX } from '@/lib/handle';
import { addCollaborator, listCollaborators } from '@/lib/playlists.server';

/** Accepts "@name" or "name"; normalises to the stored lowercase handle. */
const addSchema = z.object({
  handle: z
    .string()
    .trim()
    .max(21)
    .transform((h) => h.replace(/^@/, '').toLowerCase())
    .pipe(z.string().regex(HANDLE_REGEX, 'Invalid handle')),
});

/**
 * GET  /api/playlists/$id/collaborators — list collaborators (owner only).
 * POST /api/playlists/$id/collaborators — add one by handle (owner only, max 10).
 */
export const Route = createFileRoute('/api/playlists/$id/collaborators/')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ params, session }) => {
        const collaborators = await listCollaborators(params.id, session.user.id);
        if (!collaborators) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ collaborators });
      }),

      POST: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'playlist-collab-add' },
          body: addSchema,
        },
        async ({ params, session, body }) => {
          const result = await addCollaborator(params.id, session.user.id, body.handle);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ success: true }, { status: 201 });
        },
      ),
    },
  },
});
