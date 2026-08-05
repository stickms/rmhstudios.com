import { createFileRoute } from '@tanstack/react-router';
import { defineHandler, notFound } from '@/lib/api/handler.server';
import { approveRecoveryRequest, cancelRecoveryRequest } from '@/lib/recovery/requests.server';

/**
 * POST   /api/account/recovery/requests/$id — vouch for it, as a confirmed
 *        trusted contact of the account being recovered.
 * DELETE /api/account/recovery/requests/$id — the OWNER cancels it.
 *
 * The cancel is the point of the 24-hour mandatory delay: the owner is told in
 * every session and by email the moment a request opens, and this is the button
 * that stops it.
 */
export const Route = createFileRoute('/api/account/recovery/requests/$id')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: {
            limit: 10,
            windowMs: 60 * 60_000,
            prefix: 'recovery-approve',
            scope: 'user',
          },
        },
        async ({ userId, params }) => {
          const result = await approveRecoveryRequest(userId, params.id);
          if (!result.ok) {
            return Response.json(
              { error: result.message, reason: result.reason },
              { status: result.reason === 'not-found' ? 404 : 400 },
            );
          }
          return Response.json({ ok: true, approvals: result.approvals, phase: result.phase });
        },
      ),

      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const cancelled = await cancelRecoveryRequest(userId, params.id);
        if (!cancelled) return notFound('No open recovery request with that id');
        return Response.json({ ok: true });
      }),
    },
  },
});
