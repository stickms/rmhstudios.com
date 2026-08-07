import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { defineHandler } from '@/lib/api/handler.server';
import { shelf } from '@/lib/slice-it/library.server';

/**
 * L2 — the editorial rows above the library grid.
 *
 * The default sort is `recent`, so new uploads dominate page one permanently
 * and a good chart from three months ago is unreachable without knowing its
 * name. Shelves are the answer to "show me something I would not have searched
 * for".
 */
const QueryZ = z.object({
  shelf: z.enum(['featured', 'hidden-gems', 'recently-ranked', 'fresh']).default('featured'),
});

export const Route = createFileRoute('/api/slice-it/shelves')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: QueryZ },
        async ({ query, userId }) => {
          return Response.json(await shelf(query.shelf, userId));
        },
      ),
    },
  },
});
