import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { addItem } from '@/lib/playlists.server';

const itemSchema = z.object({
  externalId: z.string().min(1).max(255),
  title: z.string().min(1).max(300),
  subtitle: z.string().max(300).optional().nullable(),
  thumbnail: z.string().max(500).optional().nullable(),
  url: z.string().max(1000).optional().nullable(),
  durationMs: z.number().int().nonnegative().optional().nullable(),
});

/** POST /api/playlists/$id/items — add an item to the caller's playlist. */
export const Route = createFileRoute('/api/playlists/$id/items/')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'playlist-add' },
          body: itemSchema,
          allowEmptyBody: true,
        },
        async ({ params, session, body }) => {
          const result = await addItem(params.id, session.user.id, body);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ success: true, duplicate: result.duplicate });
        },
      ),
    },
  },
});
