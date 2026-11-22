import { exportRecurringThreads } from '@/lib/communities/recurring.server';
import { exportTypeGhosts } from '@/lib/rmhtype/ghost.server';
import { exportRmhTubeStats } from '@/lib/rmhtube/stats.server';

/**
 * Sprint 08 additions to the data export (`GET /api/account/export`), returned
 * under the payload's `sprint08` key. Wave 0 owns the wiring in
 * `account.export.server.ts`; each feature adds one property here, under its own
 * anchor line, so no feature edits the route.
 */
export async function exportSprint08(userId: string): Promise<Record<string, unknown>> {
  void userId;
  return {
    // Sprint 08 exports (docs/autonomous/sprint-08/plan.md §Anchors)
    // s08-01 rmhtube-stats
    rmhTubeStats: await exportRmhTubeStats(userId),

    // s08-09 recurring-threads
    recurringThreads: await exportRecurringThreads(userId),

    // s08-11 type-ghost
    typeGhosts: await exportTypeGhosts(userId),

    // s08-15 card-images
    cardImages: await (await import('@/lib/study/card-images.server')).exportCardImages(userId),
  };
}
