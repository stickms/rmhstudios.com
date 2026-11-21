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
      default: 'RMH Studios',
    });
  });

  it('has a fallback label for an entity type it does not know', () => {
    const { t } = recordingT();
    expect(systemLabels(t).default).toBe('RMH Studios');
  });
});
