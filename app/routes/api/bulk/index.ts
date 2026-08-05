import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import {
  cancelBulkOperation,
  createBulkOperation,
  listBulkOperations,
  startBulkOperation,
} from '@/lib/bulk/bulk.server';
import { BULK_KINDS, bulkFilterSchema } from '@/lib/bulk/types';

const bodySchema = z.object({
  kind: z.enum(BULK_KINDS),
  filter: bulkFilterSchema.default({}),
  /**
   * The count the user was shown by `/api/bulk/preview`.
   *
   * Sent back and compared against a fresh count so a preview the user left
   * open while they kept posting cannot commit a wider operation than the one
   * they read. A mismatch is a 409 with both numbers, not a silent widening.
   */
  confirmedTotal: z.number().int().min(0),
});

/**
 * GET  /api/bulk — the caller's recent bulk operations (progress lives here).
 * POST /api/bulk — record an operation and start it.
 *
 * The POST returns as soon as the row exists; the work runs detached and writes
 * progress back to `processed`, which is what keeps a 5,000-row delete off the
 * request. Poll the GET (or `/api/bulk/$id`) for progress.
 */
export const Route = createFileRoute('/api/bulk/')({
  server: {
    handlers: {
      GET: defineHandler({ feature: 'bulk-content', rateLimit: 'read' }, async ({ userId }) =>
        Response.json({ operations: await listBulkOperations(userId) }),
      ),

      POST: defineHandler(
        {
          feature: 'bulk-content',
          rateLimit: { policy: 'write', scope: 'user' },
          body: bodySchema,
        },
        async ({ userId, body }) => {
          const created = await createBulkOperation(userId, body.kind, body.filter);
          if (!created.ok) {
            return Response.json(
              {
                error: 'An operation is already running',
                reason: created.reason,
                operation: created.operation,
              },
              { status: 409 },
            );
          }
          if (created.operation.total !== body.confirmedTotal) {
            // Roll it back rather than leaving a PENDING row nothing will run.
            await cancelBulkOperation(userId, created.operation.id);
            return Response.json(
              {
                error: 'The number of matches changed since the preview',
                reason: 'total-changed',
                previewedTotal: body.confirmedTotal,
                currentTotal: created.operation.total,
              },
              { status: 409 },
            );
          }
          startBulkOperation(created.operation.id);
          return Response.json({ operation: created.operation }, { status: 202 });
        },
      ),
    },
  },
});
