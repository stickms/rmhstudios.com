import { exportStudioShares } from '@/lib/studio/share.server';

/**
 * Sprint 11 additions to the data export (`GET /api/account/export`), returned
 * under the payload's `sprint11` key. Wave 0 owns the wiring in
 * `account.export.server.ts`; each feature adds one property here, under its own
 * anchor line, so no feature edits the route.
 */
export async function exportSprint11(userId: string): Promise<Record<string, unknown>> {
  void userId;
  return {
    // Sprint 11 exports (docs/autonomous/sprint-11/plan.md §Anchors)
    // s11-03 character-party
    characterParties: await (
      await import('@features/rmhcharacters/engine/party.server')
    ).exportCharacterParties(userId),

    // s11-05 lights-out-maker
    lightsOutBoards: await (await import('@/lib/lights-out/boards.server')).exportLightsOutBoards(userId),

    // s11-07 studio-share
    studioShares: await exportStudioShares(userId),

    // s11-09 read-alongs
    readAlongs: await (await import('@/lib/communities/read-along.server')).exportReadAlongs(userId),

    // s11-10 deck-coeditors
    deckEditors: await (await import('@/lib/study/deck-editors.server')).exportDeckEditors(userId),

    // s11-12 type-challenges
    typeChallenges: await (await import('@/lib/rmhtype/challenges.server')).exportTypeChallenges(userId),

    // s11-16 rmhtube-subtitles
    rmhtubeSubtitles: await (await import('@/lib/rmhtube/subtitles-export.server')).exportRmhTubeSubtitles(userId),
  };
}
