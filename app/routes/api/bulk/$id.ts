import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { cancelBulkOperation, getBulkOperation } from '@/lib/bulk/bulk.server';

/**
 * GET    /api/bulk/$id — one operation's status and progress.
 * DELETE /api/bulk/$id — ask it to stop.
 *
 * Cancellation takes effect at the next chunk boundary; rows already processed
 * stay in their new state (a bulk delete cannot be one transaction, so "undo"
 * for those rows is the recycle bin, not this endpoint).
 *
 * Both are scoped to the caller inside the query, never by a check after the
 * fetch — the id is attacker-supplied.
 */
export const Route = createFileRoute('/api/bulk/$id')({
  server: {
    handlers: {
      GET: defineHandler(
        { feature: 'bulk-content', rateLimit: 'read' },
        async ({ userId, params }) => {
          const operation = await getBulkOperation(userId, params.id);
          if (!operation) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ operation });
        },
      ),

      DELETE: defineHandler(
        { feature: 'bulk-content', rateLimit: { policy: 'write', scope: 'user' } },
        async ({ userId, params }) => {
          const cancelled = await cancelBulkOperation(userId, params.id);
          if (!cancelled) {
            return Response.json(
              { error: 'Not running', reason: 'not-cancellable' },
              { status: 409 },
            );
          }
          const operation = await getBulkOperation(userId, params.id);
          return Response.json({ ok: true, operation });
        },
      ),
    },
  },
});
