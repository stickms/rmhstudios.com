/**
 * Sprint 15 additions to the data export (`GET /api/account/export`), returned
 * under the payload's `sprint15` key. Wave 0 owns the wiring in
 * `account.export.server.ts`; each feature adds one property here, under its own
 * anchor line (a dynamic `import()` of its own module), so no feature edits the
 * route.
 */
export async function exportSprint15(userId: string): Promise<Record<string, unknown>> {
  void userId;
  return {
    // Sprint 15 exports (docs/autonomous/sprint-15/plan.md §Anchors)
    // s15-05 prediction-comments
    predictionComments: await (await import('@/lib/forecasting/forecasting.server')).exportPredictionComments(userId),

    // s15-06 member-text-reports
    guestbookAndComments: await (await import('@/lib/guestbook/export.server')).exportGuestbookAndComments(userId),

    // s15-08 calc-graphs
    calcTools: await (await import('@/lib/rmhcalculator/graphs.server')).exportCalcTools(userId),

    // s15-09 dream-rift-coop
    dreamRiftCoop: await (await import('@features/dream-rift/engine/coop-runs.server')).exportDreamRiftCoop(userId),

    // s15-13 jam-suggestions
    jamSuggestions: await (await import('@/lib/competitive/jam-suggestions.server')).exportJamSuggestions(userId),

    // s15-14 tournament-prizes
    tournaments: await (await import('@/lib/tournaments/mine.server')).exportMyTournaments(userId),

    // s15-16 removal-appeals
    contentRemovals: await (await import('@/lib/moderation/removal-export.server')).exportContentRemovals(userId),
  };
}
