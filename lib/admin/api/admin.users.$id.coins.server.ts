import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adjustCoinsApi, getCoinAdjustmentsApi } from '@/lib/economy/adjustments.contract';
import { adjustBody, idParam } from '@/lib/economy/adjustments-schema';
import { adjustCoins, listAdjustments } from '@/lib/economy/adjustments.server';
import { prisma } from '@/lib/prisma.server';
import { DELETED_USER_ID } from '@/lib/account/deleted-user';

/**
 * GET  /api/admin/users/$id/coins — balance, reconciliation (read-only) and the
 *                                   member's last 20 adjustments. Admin only.
 * POST /api/admin/users/$id/coins — add or remove coins through the ledger with a
 *                                   reason; a repeat of the same `key` applies once.
 *
 * Replaces the balance-overwriting `set-coins` endpoint: every coin moved here is
 * a ledger row, so the member's statement can explain it.
 */
export const route = apiRoute('/api/admin/users/$id/coins', {
  GET: implement(getCoinAdjustmentsApi, { auth: 'admin', rateLimit: 'read' }, async ({ params }) => {
    const id = idParam.safeParse(params.id);
    if (!id.success || id.data === DELETED_USER_ID) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    const exists = await prisma.user.findUnique({ where: { id: id.data }, select: { id: true } });
    if (!exists) return Response.json({ error: 'User not found' }, { status: 404 });
    return listAdjustments(id.data);
  }),
  POST: implement(
    adjustCoinsApi,
    { auth: 'admin', rateLimit: { policy: 'write', scope: 'user' }, body: adjustBody },
    async ({ params, session, body }) => {
      const id = idParam.safeParse(params.id);
      if (!id.success) return Response.json({ error: 'User not found' }, { status: 404 });
      const out = await adjustCoins({
        adminId: session.user.id,
        userId: id.data,
        direction: body.direction,
        amount: body.amount,
        reason: body.reason,
        note: body.note,
        key: body.key,
      });
      switch (out.status) {
        case 'ok':
          return { adjustment: out.adjustment, balance: out.balance, replayed: out.replayed };
        case 'not_found':
          return Response.json({ error: 'User not found' }, { status: 404 });
        case 'deleted_account':
          return Response.json({ error: 'This account has been deleted' }, { status: 409 });
        case 'key_conflict':
          return Response.json({ error: 'That request key was already used' }, { status: 409 });
        case 'insufficient':
          return Response.json(
            { error: 'The member does not have that many coins', balance: out.balance },
            { status: 409 },
          );
      }
    },
  ),
});
