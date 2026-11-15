import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { ringStripsFor } from '@/lib/profile/webrings.server';

/**
 * GET /api/profile/$id/webrings — the `prev · ring · next` strips for a member's
 * profile (P6), at most three. Neighbours are resolved for THIS viewer: anyone
 * deleted, banned, or blocked either way is skipped, so a hop never lands
 * somewhere the viewer cannot go. Per-viewer, so not shared-cacheable.
 * `$id` is the user id.
 */
export const route = apiRoute('/api/profile/$id/webrings', {
  GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) =>
    Response.json(
      { rings: await ringStripsFor(params.id, userId) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    ),
  ),
});
