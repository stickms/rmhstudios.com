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
      GET: defineHandler({ auth: 'optional' }, async ({ session }) => {
        if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
        return Response.json(await getAdminReviewCounts());
      }),
    },
  },
});
