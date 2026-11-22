import { exportCardSounds } from '@/lib/study/card-sound.server';

/**
 * Sprint 10 additions to the data export (`GET /api/account/export`), returned
 * under the payload's `sprint10` key. Wave 0 owns the wiring in
 * `account.export.server.ts`; each feature adds one property here, under its own
 * anchor line, so no feature edits the route.
 */
export async function exportSprint10(userId: string): Promise<Record<string, unknown>> {
  void userId;
  return {
    // Sprint 10 exports (docs/autonomous/sprint-10/plan.md §Anchors)
    // s10-02 card-sound
    cardSounds: await exportCardSounds(userId),
    // s10-03 study-pace
    deckPace: await (await import('@/lib/study/pace.server')).exportDeckPace(userId),
    // s10-04 deck-suggestions
    deckSuggestions: await (await import('@/lib/study/suggestions.server')).exportDeckSuggestions(userId),
    // s10-05 type-texts
    rmhTypeTexts: await (await import('@/lib/rmhtype/texts.server')).exportRmhTypeTexts(userId),
    // s10-09 build-issues
    buildIssues: await (await import('@/lib/builds/issues.server')).exportBuildIssues(userId),
  };
}
