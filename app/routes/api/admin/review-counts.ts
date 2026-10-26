import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getAdminReviewCounts } from '@/lib/admin-review.server';

/**
 * GET /api/admin/review-counts — counts of items needing admin review, grouped
 * by type (+ a `total`). Admin only. Powers the nav badge and dashboard.
 */
export const Route = createFileRoute('/api/admin/review-counts')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin' }, async () => {
        return Response.json(await getAdminReviewCounts());
      }),
    },
  },
});
