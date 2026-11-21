/**
 * The notifications inbox's verbs and system labels, translated.
 *
 * A key built at run time (`notification-verb-${type}`) is invisible to
 * `pnpm i18n:extract`, so these strings never reached `locales/en/feed.json`
 * and every other locale showed English. Each one is written out here as a
 * literal call instead. `components/feed/__tests__/notification-labels.test.ts`
 * holds the verbs equal to Prisma's `NotificationType` and pins every system
 * label's key and English text.
 */
import type { TFunction } from 'i18next';

/** Notification types that have a human actor and so a verb (`SYSTEM` leads with its message). */
export type ActorNotificationType = 'LIKE' | 'COMMENT' | 'REPLY' | 'FOLLOW' | 'MENTION' | 'REPOST';

/** What the actor did, per notification type (namespace `feed`). */
export function notificationVerbs(t: TFunction): Record<ActorNotificationType, string> {
  return {
    LIKE: t('notification-verb-like', { ns: 'feed', defaultValue: 'liked your post' }),
    COMMENT: t('notification-verb-comment', { ns: 'feed', defaultValue: 'commented on your post' }),
    REPLY: t('notification-verb-reply', { ns: 'feed', defaultValue: 'replied to you' }),
    FOLLOW: t('notification-verb-follow', { ns: 'feed', defaultValue: 'followed you' }),
    MENTION: t('notification-verb-mention', { ns: 'feed', defaultValue: 'mentioned you' }),
    REPOST: t('notification-verb-repost', { ns: 'feed', defaultValue: 'reposted your post' }),
  };
}

/**
 * The label of a system notification, per the entity it refers to (namespace
 * `feed`). `default` is the label of an entity type this list does not know.
 * `game_update` and `game_guide` are the fallbacks for when the notification's
 * link does not name a game; otherwise the game's own title leads.
 */
export function systemLabels(t: TFunction): Record<string, string> {
  return {
    game_update: t('system-label-game_update', { ns: 'feed', defaultValue: 'Game update' }),
    game_guide: t('system-label-game_guide', { ns: 'feed', defaultValue: 'Game guide' }),
    achievement: t('system-label-achievement', { ns: 'feed', defaultValue: 'Achievement' }),
    level: t('system-label-level', { ns: 'feed', defaultValue: 'Level up' }),
    membership: t('system-label-membership', { ns: 'feed', defaultValue: 'Membership' }),
    ride: t('system-label-ride', { ns: 'feed', defaultValue: 'RMH Rideshare' }),
    ride_request: t('system-label-ride_request', { ns: 'feed', defaultValue: 'New ride request' }),
    ride_message: t('system-label-ride_message', { ns: 'feed', defaultValue: 'Ride message' }),
    ladder_job: t('system-label-ladder_job', { ns: 'feed', defaultValue: 'RMH Ladder' }),
    rmhtube_party: t('system-label-rmhtube_party', { ns: 'feed', defaultValue: 'RMHTube' }),
    moderation: t('system-label-moderation', { ns: 'feed', defaultValue: 'Site moderation' }),
    strike: t('system-label-strike', { ns: 'feed', defaultValue: 'Site moderation' }),
    report_outcome: t('system-label-report_outcome', { ns: 'feed', defaultValue: 'Safety' }),
    blog_post: t('system-label-blog_post', { ns: 'feed', defaultValue: 'Logs' }),
    news_article: t('system-label-news_article', { ns: 'feed', defaultValue: 'News' }),
    event_waitlist: t('system-label-event_waitlist', { ns: 'feed', defaultValue: 'Events' }),
    tournament_checkin: t('system-label-tournament_checkin', { ns: 'feed', defaultValue: 'Tournaments' }),
    poll_result: t('system-label-poll_result', { ns: 'feed', defaultValue: 'Polls' }),
    'watch-build': t('system-label-watch-build', { ns: 'feed', defaultValue: 'User Builds' }),
    'watch-build-release': t('system-label-watch-build-release', { ns: 'feed', defaultValue: 'User Builds' }),
    group_chat: t('system-label-group_chat', { ns: 'feed', defaultValue: 'Group chats' }),
    community_handover: t('system-label-community_handover', { ns: 'feed', defaultValue: 'Communities' }),
    // Sprint 05 system labels (docs/autonomous/sprint-05/plan.md §Anchors)
    // s05-05 event-cohosts

    // s05-15 jam-teams

    // s05-17 community-post-alerts

    // s05-20 flashcard-reminders

    default: t('system-label-default', { ns: 'feed', defaultValue: 'RMH Studios' }),
  };
}
