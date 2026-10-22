import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { mediaUrlSchema } from '@/lib/rmhtube/party';
import { heatFor } from '@/lib/rmhtube/watch.server';

/** RMHTube most-replayed (T3): reaction + rewind counts per 10 s bucket of a media URL. */
export const Route = createFileRoute('/api/rmhtube/heat')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: 'read', query: z.object({ url: mediaUrlSchema }) },
        async ({ query }) => Response.json({ buckets: await heatFor(query.url) }),
      ),
    },
  },
});
