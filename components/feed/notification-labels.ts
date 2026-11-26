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
    event_cohost: t('system-label-event_cohost', { ns: 'feed', defaultValue: 'Events' }),

    // s05-15 jam-teams
    jam_team: t('system-label-jam_team', { ns: 'feed', defaultValue: 'Game jams' }),

    // s05-17 community-post-alerts
    community_post: t('system-label-community_post', { ns: 'feed', defaultValue: 'Communities' }),

    // s05-20 flashcard-reminders
    study_due: t('system-label-study_due', { ns: 'feed', defaultValue: 'Study' }),

    // Sprint 06 system labels (docs/autonomous/sprint-06/plan.md §Anchors)
    // s06-01 community-bans
    community_ban: t('system-label-community_ban', { ns: 'feed', defaultValue: 'Communities' }),

    // s06-05 feedback-inbox
    feedback_reply: t('system-label-feedback_reply', { ns: 'feed', defaultValue: 'Feedback' }),

    // s06-06 admin-secure-account
    account_secured: t('system-label-account_secured', { ns: 'feed', defaultValue: 'Account security' }),

    // s06-07 jam-feedback
    jam_feedback: t('system-label-jam_feedback', { ns: 'feed', defaultValue: 'Game jams' }),

    // s06-10 event-occurrences
    event_occurrence: t('system-label-event_occurrence', { ns: 'feed', defaultValue: 'Events' }),

    // s06-11 event-updates
    event_update: t('system-label-event_update', { ns: 'feed', defaultValue: 'Event updates' }),

    // s06-20 match-results
    tournament_result: t('system-label-tournament_result', { ns: 'feed', defaultValue: 'Tournaments' }),

    // Sprint 07 system labels (docs/autonomous/sprint-07/plan.md §Anchors)
    // s07-05 group-mentions
    'group-mention': t('system-label-group-mention', { ns: 'feed', defaultValue: 'Group mentions' }),

    // s07-06 match-scheduling
    'match-proposal': t('system-label-match-proposal', { ns: 'feed', defaultValue: 'Match time proposals' }),
    'match-agreed': t('system-label-match-agreed', { ns: 'feed', defaultValue: 'Match times' }),
    'match-reminder': t('system-label-match-reminder', { ns: 'feed', defaultValue: 'Match reminders' }),
    'match-deadline': t('system-label-match-deadline', { ns: 'feed', defaultValue: 'Match deadlines' }),
    'match-awarded': t('system-label-match-awarded', { ns: 'feed', defaultValue: 'Match awards' }),

    // s07-07 jam-themes
    jam_theme: t('system-label-jam_theme', { ns: 'feed', defaultValue: 'Game jams' }),

    // s07-16 community-alt-text
    'scheduled-alt-required': t('system-label-scheduled-alt-required', {
      ns: 'feed',
      defaultValue: 'Scheduled post held',
    }),

    // Sprint 08 system labels (docs/autonomous/sprint-08/plan.md §Anchors)
    // s08-08 admin-api-oversight
    'api-key-suspended': t('system-label-api-key-suspended', {
      ns: 'feed',
      defaultValue: 'API key suspended',
    }),
    'api-key-restored': t('system-label-api-key-restored', {
      ns: 'feed',
      defaultValue: 'API key restored',
    }),

    // s08-09 recurring-threads
    'community-recurring-paused': t('system-label-community-recurring-paused', {
      ns: 'feed',
      defaultValue: 'Recurring thread paused',
    }),

    // s08-18 admin-spam-sweep
    'moderation-sweep': t('system-label-moderation-sweep', {
      ns: 'feed',
      defaultValue: 'Content removed',
    }),
    'moderation-sweep-undone': t('system-label-moderation-sweep-undone', {
      ns: 'feed',
      defaultValue: 'Content restored',
    }),

    // Sprint 09 system labels (docs/autonomous/sprint-09/plan.md §Anchors)
    // s09-06 community-pins
    'community-pin': t('system-label-community-pin', { ns: 'feed', defaultValue: 'Post pinned' }),

    // s09-11 scheduled-gate
    'scheduled-held': t('system-label-scheduled-held', { ns: 'feed', defaultValue: 'Scheduled post in review' }),
    'scheduled-refused': t('system-label-scheduled-refused', {
      ns: 'feed',
      defaultValue: 'Scheduled post not published',
    }),

    // s09-14 deletion-pause
    'deletion-drafts-waited': t('system-label-deletion-drafts-waited', {
      ns: 'feed',
      defaultValue: 'Scheduled posts waited',
    }),

    // Sprint 10 system labels (docs/autonomous/sprint-10/plan.md §Anchors)
    // s10-04 deck-suggestions
    'deck-suggestion': t('system-label-deck-suggestion', { ns: 'feed', defaultValue: 'Deck suggestion' }),

    // s10-09 build-issues
    'build-issue': t('system-label-build-issue', { ns: 'feed', defaultValue: 'Build issue' }),

    // s10-15 admin-webhooks
    'webhook-admin-disabled': t('system-label-webhook-admin-disabled', {
      ns: 'feed',
      defaultValue: 'Webhook turned off',
    }),

    // s10-16 speedrun-queue
    'speedrun-verdict': t('system-label-speedrun-verdict', { ns: 'feed', defaultValue: 'Speedrun verdict' }),

    // s10-17 admin-communities
    'community-delisted': t('system-label-community-delisted', { ns: 'feed', defaultValue: 'Out of discovery' }),

    // Sprint 11 system labels (docs/autonomous/sprint-11/plan.md §Anchors)
    // s11-09 read-alongs
    'read-along': t('system-label-read-along', { ns: 'feed', defaultValue: 'Read-alongs' }),

    // s11-10 deck-coeditors
    'deck-editor': t('system-label-deck-editor', { ns: 'feed', defaultValue: 'Deck editors' }),

    // s11-12 type-challenges
    'type-challenge': t('system-label-type-challenge', { ns: 'feed', defaultValue: 'Typing challenge' }),

    // s11-13 listing-prices
    home_price_drop: t('system-label-home_price_drop', { ns: 'feed', defaultValue: 'Price drop' }),

    // Sprint 12 system labels (docs/autonomous/sprint-12/plan.md §Anchors)
    // s12-16 member-reports

    // s12-19 notice-helpers

    // Sprint 13 system labels (docs/autonomous/sprint-13/plan.md §Anchors)
    // s13-07 tube-subscriptions

    // s13-12 news-stories
    news_story: t('system-label-news_story', { ns: 'feed', defaultValue: 'News story' }),

    // s13-20 message-push
    dm: t('system-label-dm', { ns: 'feed', defaultValue: 'Message' }),

    // Sprint 14 system labels (docs/autonomous/sprint-14/plan.md §Anchors)
    // s14-11 thread-replies
    game_thread: t('system-label-game_thread', { ns: 'feed', defaultValue: 'Game discussion' }),
    song: t('system-label-song', { ns: 'feed', defaultValue: 'Slice It' }),

    // Sprint 15 system labels (docs/autonomous/sprint-15/plan.md §Anchors)
    // s15-07 fix-notices
    puzzle_report: t('system-label-puzzle_report', { ns: 'feed', defaultValue: 'Daily puzzles' }),
    jam_deadline: t('system-label-jam_deadline', { ns: 'feed', defaultValue: 'Game jams' }),

    // s15-12 thread-mentions

    // s15-16 removal-appeals

    default: t('system-label-default', { ns: 'feed', defaultValue: 'RMH Studios' }),
  };
}
