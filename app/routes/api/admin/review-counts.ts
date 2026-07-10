import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getAdminReviewCounts } from '@/lib/admin-review.server';

/**
 * GET /api/admin/review-counts — counts of items needing admin review, grouped
 * by type (+ a `total`). Admin only. Powers the nav badge and dashboard.
 */
export const Route = createFileRoute('/api/admin/review-counts')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }
          return Response.json(await getAdminReviewCounts());
        } catch (error) {
          console.error('Admin review-counts error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
