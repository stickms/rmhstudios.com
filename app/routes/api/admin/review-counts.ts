import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { getAdminReviewCounts } from '@/lib/admin-review.server';

/**
 * GET /api/admin/review-counts — counts of items needing admin review, grouped
 * by type (+ a `total`). Admin only. Powers the nav badge and dashboard.
 */
export const Route = createFileRoute('/api/admin/review-counts')({
  server: {
    handlers: {
      GET: implement(C.getAdminReviewCountsApi, { auth: 'admin' }, async () => {
        return Response.json(await getAdminReviewCounts());
      }),
    },
  },
});
