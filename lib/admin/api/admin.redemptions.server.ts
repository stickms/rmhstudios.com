import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { listPendingRedemptions } from '@/lib/creator/earnings.server';

export const route = apiRoute('/api/admin/redemptions', {
  GET: implement(C.listAdminRedemptionsApi, { auth: 'admin' }, async () => {
    try {
      const requests = await listPendingRedemptions({});
      return Response.json({ requests });
    } catch (error) {
      console.error('Admin redemptions list error:', error);
      return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  }),
});
