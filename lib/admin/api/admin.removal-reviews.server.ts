/**
 * GET /api/admin/removal-reviews — requested second looks at removals after a report (sprint 15, feature 16). Admin
 * only. `?status=pending` (default, oldest request first) or `decided` (newest decision first).
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listAdminRemovalReviewsApi } from '@/lib/moderation/removal-reviews.contract';
import { adminRemovalReviewsQuery } from '@/lib/moderation/removal-reviews-schema';
import { listAdminRemovalReviews } from '@/lib/moderation/removal-reviews.server';

export const route = apiRoute('/api/admin/removal-reviews', {
  GET: implement(
    listAdminRemovalReviewsApi,
    { auth: 'admin', rateLimit: 'read', query: adminRemovalReviewsQuery },
    async ({ query }) => listAdminRemovalReviews(query.status ?? 'pending'),
  ),
});
