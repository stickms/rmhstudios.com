import { exportAwayMessage } from '@/lib/messages/away.server';
import { exportBuildComments } from '@/lib/builds/comments.server';
import { exportCommunitySanctions } from '@/lib/communities/bans.server';
import { exportFeedback } from '@/lib/feedback/inbox.server';
import { exportEventUpdates } from '@/lib/events/updates.server';
import { exportGroupInvites } from '@/lib/group-chat/invites.server';
import { exportMatchResults } from '@/lib/tournaments/match-results.server';
import { exportJamFeedback } from '@/lib/competitive/jam-feedback.server';

/**
 * Sprint 06 additions to the data export (`GET /api/account/export`), returned
 * under the payload's `sprint06` key. Wave 0 owns the wiring in
 * `account.export.server.ts`; each feature adds one property here, under its own
 * anchor line, so no feature edits the route.
 */
export async function exportSprint06(
  userId: string,
): Promise<
  Record<
    string,
    unknown
  >
> {
  void userId;
  return {
    // Sprint 06 exports (docs/autonomous/sprint-06/plan.md §Anchors)
    // s06-01 community-bans
    communitySanctions: await exportCommunitySanctions(userId),

    // s06-05 feedback-inbox
    feedback: await exportFeedback(userId),

    // s06-07 jam-feedback
    jamFeedback: await exportJamFeedback(userId),

    // s06-09 group-invites
    groupInvites: await exportGroupInvites(userId),

    // s06-11 event-updates
    eventUpdates: await exportEventUpdates(userId),

    // s06-14 build-comments
    buildComments: await exportBuildComments(userId),

    // s06-18 away-message
    awayMessage: await exportAwayMessage(userId),

    // s06-20 match-results
    matchResults: await exportMatchResults(userId),
  };
}
