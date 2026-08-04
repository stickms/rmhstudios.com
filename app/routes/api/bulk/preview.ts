import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { previewBulk } from '@/lib/bulk/bulk.server';
import { BULK_KINDS, bulkFilterSchema } from '@/lib/bulk/types';

const bodySchema = z.object({
  kind: z.enum(BULK_KINDS),
  filter: bulkFilterSchema.default({}),
});

/**
 * POST /api/bulk/preview — the exact count and ten real matches for a filter.
 *
 * A POST rather than a GET because the filter is a structured object, and this
 * is the read half of a two-step: nothing is mutated here, and the UI cannot
 * offer Confirm until it has this response. Gated on `bulk-content` like the
 * commit endpoint so a free account is told what it costs before it composes a
 * filter, not after.
 */
export const Route = createFileRoute('/api/bulk/preview')({
  server: {
    handlers: {
      POST: defineHandler(
        { feature: 'bulk-content', rateLimit: { policy: 'read', scope: 'user' }, body: bodySchema },
        async ({ userId, body }) => {
          return Response.json(await previewBulk(userId, body.kind, body.filter));
        },
      ),
    },
  },
});
