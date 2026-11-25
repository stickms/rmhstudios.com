import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listAdminDeletionsApi } from '@/lib/admin/deletions.contract';
import { listDeletions } from '@/lib/admin/deletions.server';

/**
 * GET /api/admin/deletions — accounts waiting out their grace period, overdue deletions with their last attempt's
 * error name and the attempt count, and the last 30 days' finished erasures per day. Admin only; no e-mail address.
 */
export const route = apiRoute('/api/admin/deletions', {
  GET: implement(listAdminDeletionsApi, { auth: 'admin', rateLimit: 'read' }, async () => listDeletions()),
});
