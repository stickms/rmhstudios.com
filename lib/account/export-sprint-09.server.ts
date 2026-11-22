/**
 * Sprint 09 additions to the data export (`GET /api/account/export`), returned
 * under the payload's `sprint09` key. Wave 0 owns the wiring in
 * `account.export.server.ts`; each feature adds one property here, under its own
 * anchor line, so no feature edits the route.
 */
export async function exportSprint09(userId: string): Promise<Record<string, unknown>> {
  void userId;
  return {
    // Sprint 09 exports (docs/autonomous/sprint-09/plan.md §Anchors)
    // s09-02 weak-keys
    rmhTypeKeyStats: await (await import('@/lib/rmhtype/keystats.server')).exportRmhTypeKeyStats(userId),

    // s09-03 occlusion-cards
    // (imported here, not at the top, so the anchor stays the only line this feature touches)
    occlusionCards: await import('@/lib/study/occlusion.server').then((m) => m.exportOcclusionCards(userId)),

    // s09-04 community-wiki
    communityPageEdits: await (
      await import('@/lib/communities/pages-export.server')
    ).exportCommunityPageRevisions(userId),

    // s09-05 guide-history
    guides: await (await import('@/lib/games/guide-history.server')).exportGuides(userId),
    guideRevisions: await (await import('@/lib/games/guide-history.server')).exportGuideRevisions(userId),
  };
}
