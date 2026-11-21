import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { reverseCoinAdjustmentApi } from '@/lib/economy/adjustments.contract';
import { idParam } from '@/lib/economy/adjustments-schema';
import { reverseAdjustment } from '@/lib/economy/adjustments.server';

/**
 * POST /api/admin/users/$id/coins/$adjustmentId/reverse — undo one adjustment with
 * the opposite one (reason "reversal", linked). Once per adjustment; reversing a
 * debit the member has since spent is refused with their balance. Admin only.
 */
export const route = apiRoute('/api/admin/users/$id/coins/$adjustmentId/reverse', {
  POST: implement(
    reverseCoinAdjustmentApi,
    { auth: 'admin', rateLimit: { policy: 'write', scope: 'user' } },
    async ({ params, session }) => {
      const userId = idParam.safeParse(params.id);
      const adjustmentId = idParam.safeParse(params.adjustmentId);
      if (!userId.success || !adjustmentId.success) {
        return Response.json({ error: 'Adjustment not found' }, { status: 404 });
      }
      const out = await reverseAdjustment({
        adminId: session.user.id,
        userId: userId.data,
        adjustmentId: adjustmentId.data,
      });
      switch (out.status) {
        case 'ok':
          return { adjustment: out.adjustment, balance: out.balance };
        case 'not_found':
        case 'deleted_account':
          return Response.json({ error: 'Adjustment not found' }, { status: 404 });
        case 'already_reversed':
          return Response.json({ error: 'That adjustment was already reversed' }, { status: 409 });
        case 'is_reversal':
          return Response.json({ error: 'A reversal cannot be reversed' }, { status: 409 });
        case 'insufficient':
          return Response.json(
            { error: 'The member has spent those coins', balance: out.balance },
            { status: 409 },
          );
      }
    },
  ),
});
