/**
 * Sprint 14 additions to the data export (`GET /api/account/export`), returned
 * under the payload's `sprint14` key. Wave 0 owns the wiring in
 * `account.export.server.ts`; each feature adds one property here, under its own
 * anchor line (a dynamic `import()` of its own module), so no feature edits the
 * route.
 */
export async function exportSprint14(userId: string): Promise<Record<string, unknown>> {
  void userId;
  return {
    // Sprint 14 exports (docs/autonomous/sprint-14/plan.md §Anchors)
    // s14-03 synapse-matches
    synapseMatches: await (await import('@features/synapse-storm/engine/matches.server')).exportSynapseMatches(userId),

    // s14-04 altair-coop
    altairCoop: await (await import('@features/altair/engine/coop-record.server')).exportAltairCoop(userId),

    // s14-05 doctrine-ledger
    doctrineReputation: await (
      await import('@features/doctrine/engine/ledger.server')
    ).exportDoctrineReputation(userId),

    // s14-06 puzzle-reports
    puzzleReports: await (await import('@/lib/daily-puzzles/reports.server')).exportPuzzleReports(userId),
  };
}
