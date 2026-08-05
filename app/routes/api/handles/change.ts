import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { changeHandle, getHandleHistory } from '@/lib/handles/history.server';
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH } from '@/lib/handle';

/**
 * POST /api/handles/change — change the signed-in user's handle, recording it.
 * GET  /api/handles/change — the caller's own change history.
 *
 * The J2 path: 30-day cooldown, a 30-day block on reclaiming a handle somebody
 * else released, and a `HandleChange` row per change. (`PATCH /api/profile`
 * still has its own older, unrecorded path — see the note in
 * `lib/handles/history.server.ts`.)
 */
const changeSchema = z.object({
  handle: z.string().trim().min(HANDLE_MIN_LENGTH).max(HANDLE_MAX_LENGTH),
});

export const Route = createFileRoute('/api/handles/change')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const history = await getHandleHistory(userId);
        return Response.json({
          history: history.map((row) => ({
            oldHandle: row.oldHandle,
            newHandle: row.newHandle,
            createdAt: row.createdAt.toISOString(),
          })),
        });
      }),

      POST: defineHandler(
        {
          rateLimit: { limit: 5, windowMs: 60 * 60_000, prefix: 'handle-change', scope: 'user' },
          body: changeSchema,
          verboseValidationErrors: true,
        },
        async ({ userId, isAdmin, body }) => {
          const result = await changeHandle(userId, body.handle, { isAdmin });
          if (result.ok) {
            return Response.json({
              handle: result.newHandle,
              previousHandle: result.oldHandle || null,
            });
          }
          const status =
            result.reason === 'taken' || result.reason === 'reclaim-blocked'
              ? 409
              : result.reason === 'cooldown'
                ? 429
                : result.reason === 'no-account'
                  ? 404
                  : 400;
          return Response.json(
            {
              error: result.message,
              reason: result.reason,
              ...(result.retryAfterMs ? { retryAfterMs: result.retryAfterMs } : {}),
            },
            {
              status,
              ...(result.reason === 'cooldown' && result.retryAfterMs
                ? { headers: { 'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)) } }
                : {}),
            },
          );
        },
      ),
    },
  },
});
