/**
 * The notifications inbox's verbs and system labels are literal `t()` calls
 * (so `pnpm i18n:extract` sees them). A notification type added to the schema
 * without a verb here would ship untranslated in every locale but English.
 */
import { describe, expect, it } from 'vitest';
import { NotificationType } from '@prisma/client';
import { recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { notificationVerbs, systemLabels } from '@/components/feed/notification-labels';

describe('notification verbs', () => {
  it('covers every actor notification type, in the feed namespace', () => {
    const { t, calls } = recordingT();
    const verbs = notificationVerbs(t);
    const actorTypes = Object.values(NotificationType).filter((type) => type !== 'SYSTEM');
    expect(Object.keys(verbs).sort()).toEqual([...actorTypes].sort());
    expect(calls.map((c) => c.key).sort()).toEqual(
      actorTypes.map((type) => `notification-verb-${type.toLowerCase()}`).sort(),
    );
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['feed']));
  });

  it('keeps the English the inbox has always shown', () => {
    const { t } = recordingT();
    expect(notificationVerbs(t)).toEqual({
      LIKE: 'liked your post',
      COMMENT: 'commented on your post',
      REPLY: 'replied to you',
      FOLLOW: 'followed you',
      MENTION: 'mentioned you',
      REPOST: 'reposted your post',
    });
  });
});

describe('system notification labels', () => {
  it('gives every entity type its own key, in the feed namespace', () => {
    const { t, calls } = recordingT();
    const labels = systemLabels(t);
    expect(calls.map((c) => c.key)).toEqual(Object.keys(labels).map((entity) => `system-label-${entity}`));
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['feed']));
  });

  it('keeps the English the inbox has always shown', () => {
    const { t } = recordingT();
    expect(systemLabels(t)).toEqual({
      game_update: 'Game update',
      game_guide: 'Game guide',
      achievement: 'Achievement',
      level: 'Level up',
      membership: 'Membership',
      ride: 'RMH Rideshare',
      ride_request: 'New ride request',
      ride_message: 'Ride message',
      ladder_job: 'RMH Ladder',
      rmhtube_party: 'RMHTube',
      moderation: 'Site moderation',
      strike: 'Site moderation',
      report_outcome: 'Safety',
      blog_post: 'Logs',
      news_article: 'News',
      event_waitlist: 'Events',
      tournament_checkin: 'Tournaments',
      poll_result: 'Polls',
      'watch-build': 'User Builds',
      'watch-build-release': 'User Builds',
      group_chat: 'Group chats',
      community_handover: 'Communities',
      // Sprint 05 system labels (docs/autonomous/sprint-05/plan.md §Anchors)
      // s05-05 event-cohosts
      event_cohost: 'Events',

      // s05-15 jam-teams
      jam_team: 'Game jams',

      // s05-17 community-post-alerts
      community_post: 'Communities',

      // s05-20 flashcard-reminders
      study_due: 'Study',

      // Sprint 06 system labels (docs/autonomous/sprint-06/plan.md §Anchors)
      // s06-01 community-bans
      community_ban: 'Communities',

      // s06-05 feedback-inbox
      feedback_reply: 'Feedback',

      // s06-06 admin-secure-account
      account_secured: 'Account security',

      // s06-07 jam-feedback
      jam_feedback: 'Game jams',

      // s06-10 event-occurrences
      event_occurrence: 'Events',

      // s06-11 event-updates
      event_update: 'Event updates',

      // s06-20 match-results
      tournament_result: 'Tournaments',

      // Sprint 07 system labels (docs/autonomous/sprint-07/plan.md §Anchors)
      // s07-05 group-mentions
      'group-mention': 'Group mentions',

      // s07-06 match-scheduling
      'match-proposal': 'Match time proposals',
      'match-agreed': 'Match times',
      'match-reminder': 'Match reminders',
      'match-deadline': 'Match deadlines',
      'match-awarded': 'Match awards',

      // s07-07 jam-themes
      jam_theme: 'Game jams',

      // s07-16 community-alt-text
      'scheduled-alt-required': 'Scheduled post held',

      // Sprint 08 system labels (docs/autonomous/sprint-08/plan.md §Anchors)
      // s08-08 admin-api-oversight
      'api-key-suspended': 'API key suspended',
      'api-key-restored': 'API key restored',

      // s08-09 recurring-threads
      'community-recurring-paused': 'Recurring thread paused',

      // s08-18 admin-spam-sweep
      'moderation-sweep': 'Content removed',
      'moderation-sweep-undone': 'Content restored',

      // Sprint 09 system labels (docs/autonomous/sprint-09/plan.md §Anchors)
      // s09-06 community-pins
      'community-pin': 'Post pinned',

      // s09-11 scheduled-gate
      'scheduled-held': 'Scheduled post in review',
      'scheduled-refused': 'Scheduled post not published',

      // s09-14 deletion-pause
      'deletion-drafts-waited': 'Scheduled posts waited',

      default: 'RMH Studios',
    });
  });

  it('has a fallback label for an entity type it does not know', () => {
    const { t } = recordingT();
    expect(systemLabels(t).default).toBe('RMH Studios');
  });
});
