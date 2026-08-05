import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getRecoveryHold } from '@/lib/recovery/hold.server';

/**
 * GET /api/account/recovery/hold — is this account inside the 72-hour
 * post-recovery hold on coin movement, payout changes and redemptions?
 *
 * Exists so the UI can *say so* up front rather than letting a user compose a
 * redemption and be refused at the end. The refusal itself is enforced server
 * side by `assertNoRecoveryHold`.
 */
export const Route = createFileRoute('/api/account/recovery/hold')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const hold = await getRecoveryHold(userId);
        return Response.json({
          active: hold.active,
          until: hold.until ? hold.until.toISOString() : null,
          recoveredAt: hold.recoveredAt ? hold.recoveredAt.toISOString() : null,
        });
      }),
    },
  },
});
