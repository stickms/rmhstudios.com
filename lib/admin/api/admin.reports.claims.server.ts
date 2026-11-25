import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { z } from 'zod';
import { reportClaimsApi } from '@/lib/admin/reports-claims.contract';
import { claimsForAccount } from '@/lib/admin/reports-claims.server';

/**
 * GET /api/admin/reports/claims?userId= — the websites a reported account claims, and for each one the other accounts
 * that claim it (verified first, at most 10). Admin only; the evidence an impersonation report is decided on.
 */
const claimsQuery = z.object({ userId: z.string().min(1).max(64) });

export const route = apiRoute('/api/admin/reports/claims', {
  GET: implement(reportClaimsApi, { auth: 'admin', rateLimit: 'read', query: claimsQuery }, async ({ query }) => ({
    hosts: await claimsForAccount(query.userId),
  })),
});
