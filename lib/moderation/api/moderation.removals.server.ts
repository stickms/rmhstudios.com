/**
 * GET /api/moderation/removals — the caller's own removals after a report (sprint 15, feature 16), newest first.
 * Each row is the kind, the item's own title when it still exists, the date and the review state: never the report's
 * id, reason, note or count, the reporter or the moderator.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listMyRemovalsApi } from '@/lib/moderation/removal-reviews.contract';
import { listMyRemovals } from '@/lib/moderation/removal-reviews.server';

export const route = apiRoute('/api/moderation/removals', {
  GET: implement(listMyRemovalsApi, { rateLimit: 'read' }, async ({ session }) => ({
    items: await listMyRemovals(session.user.id),
  })),
});
