import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getAdminPuzzlesApi } from '@/lib/daily-puzzles/reports.contract';
import { adminPuzzlesQuery } from '@/lib/daily-puzzles/reports-schema';
import { adminDays } from '@/lib/daily-puzzles/reports.server';

/**
 * GET /api/admin/daily-puzzles?mode=: today's, the next two days' and the last seven days' puzzles for one mode, with
 * their answers (as plain text), the reports by kind and each report's note with the member's handle. Admin only: the
 * answer appears nowhere else.
 */
export const route = apiRoute('/api/admin/daily-puzzles', {
  GET: implement(
    getAdminPuzzlesApi,
    { auth: 'admin', rateLimit: 'read', query: adminPuzzlesQuery },
    async ({ query }) => adminDays(query.mode),
  ),
});
