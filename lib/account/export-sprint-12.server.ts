/**
 * Sprint 12 additions to the data export (`GET /api/account/export`), returned
 * under the payload's `sprint12` key. Wave 0 owns the wiring in
 * `account.export.server.ts`; each feature adds one property here, under its own
 * anchor line (a dynamic `import()` of its own module), so no feature edits the
 * route.
 */
export async function exportSprint12(userId: string): Promise<Record<string, unknown>> {
  void userId;
  return {
    // Sprint 12 exports (docs/autonomous/sprint-12/plan.md §Anchors)
    // s12-01 party-rolls
    partyRolls: await (await import('@features/rmhcharacters/engine/party-rolls.server')).exportPartyRolls(userId),

    // s12-08 deck-ratings
    deckRatings: await (await import('@/lib/study/deck-ratings.server')).exportDeckRatings(userId),

    // s12-10 homes-compare
    savedHomes: await (await import('@/lib/homes/saved-export.server')).exportSavedHomes(userId),
  };
}
