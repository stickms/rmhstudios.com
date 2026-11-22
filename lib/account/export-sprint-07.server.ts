import { exportDeckFolders } from '@/lib/study/folders.server';
import { exportStudioHistory } from '@/lib/studio/project-history.server';
import { exportSuspendedCards } from '@/lib/study/queue.server';
import { exportReadingTime } from '@/lib/reading/time.server';
import { exportBuildScreenshots } from '@/lib/builds/screenshots.server';
import { exportJamThemeVotes } from '@/lib/competitive/jam-themes.server';
import { exportMatchScheduling } from '@/lib/tournaments/scheduling.server';

/**
 * Sprint 07 additions to the data export (`GET /api/account/export`), returned
 * under the payload's `sprint07` key. Wave 0 owns the wiring in
 * `account.export.server.ts`; each feature adds one property here, under its own
 * anchor line, so no feature edits the route.
 */
export async function exportSprint07(userId: string): Promise<Record<string, unknown>> {
  void userId;
  return {
    // Sprint 07 exports (docs/autonomous/sprint-07/plan.md §Anchors)
    // s07-06 match-scheduling
    matchScheduling: await exportMatchScheduling(userId),

    // s07-07 jam-themes
    jamThemeVotes: await exportJamThemeVotes(userId),

    // s07-08 study-queue
    suspendedCards: await exportSuspendedCards(userId),

    // s07-09 deck-folders
    deckFolders: await exportDeckFolders(userId),

    // s07-14 studio-history
    studioHistory: await exportStudioHistory(userId),

    // s07-17 build-screenshots
    buildScreenshots: await exportBuildScreenshots(userId),

    // s07-18 reading-time
    readingTime: await exportReadingTime(userId),
  };
}
