import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getRecoveryHoldApi } from '@/lib/recovery/recovery.contract';
import { getRecoveryHold } from '@/lib/recovery/hold.server';

/**
 * GET /api/account/recovery/hold — is this account inside the 72-hour
 * post-recovery hold on coin movement, payout changes and redemptions?
 *
 * Exists so the UI can *say so* up front rather than letting a user compose a
 * redemption and be refused at the end. The refusal itself is enforced server
 * side by `assertNoRecoveryHold`.
 */
export const route = apiRoute('/api/account/recovery/hold', {
  GET: implement(getRecoveryHoldApi, { rateLimit: 'read' }, async ({ userId }) => {
    const hold = await getRecoveryHold(userId);
    return {
      active: hold.active,
      until: hold.until ? hold.until.toISOString() : null,
      recoveredAt: hold.recoveredAt ? hold.recoveredAt.toISOString() : null,
    };
  }),
});
