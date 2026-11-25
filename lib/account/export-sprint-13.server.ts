/**
 * Sprint 13 additions to the data export (`GET /api/account/export`), returned
 * under the payload's `sprint13` key. Wave 0 owns the wiring in
 * `account.export.server.ts`; each feature adds one property here, under its own
 * anchor line (a dynamic `import()` of its own module), so no feature edits the
 * route.
 */
export async function exportSprint13(userId: string): Promise<Record<string, unknown>> {
  return {
    // Sprint 13 exports (docs/autonomous/sprint-13/plan.md §Anchors)
    // s13-03 altair-runs
    altairRuns: await (await import('@features/altair/engine/runs.server')).exportAltairRuns(userId),

    // s13-07 tube-subscriptions
    rmhtubeSubscriptions: await (await import('@/lib/rmhtube/subscriptions.server')).exportTubeSubscriptions(userId),

    // s13-08 ladder-own-jobs
    ladderOwnJobs: await (await import('@/lib/rmhladder/own-jobs.server')).exportLadderOwnJobs(userId),

    // s13-11 lists-on
    listsLeft: await (await import('@/lib/lists/lists-on.server')).exportListsLeft(userId),

    // s13-12 news-stories
    newsStoryFollows: await (await import('@/lib/reading/story-follows.server')).exportStoryFollows(userId),

    // s13-14 prediction-trades
    predictionPositions: await (await import('@/lib/predictions/predictions.server')).exportPredictionPositions(userId),
  };
}
