import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { giveKudosSchema } from '@/lib/gifting/kudos';
import { giveKudos, readKudos } from '@/lib/gifting/kudos.server';

/** Kudos on a profile (G4). GET is public; POST leaves a note (one per sender per day). */
export const Route = createFileRoute('/api/profile/$id/kudos')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'optional',
          rateLimit: 'read',
          query: z.object({ cursor: z.string().max(64).optional() }),
        },
        async ({ userId, params, query }) => {
          const page = await readKudos(params.id, userId, query.cursor ?? null);
          if (!page) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
        },
      ),
      POST: defineHandler(
        {
          rateLimit: { limit: 10, windowMs: 3_600_000, prefix: 'kudos-give' },
          body: giveKudosSchema,
        },
        async ({ userId, params, body }) => {
          const res = await giveKudos(userId, params.id, body.reason);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ id: res.id }, { status: 201 });
        },
      ),
    },
  },
});
