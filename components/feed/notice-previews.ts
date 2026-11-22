/**
 * The inbox's system notices, in the reader's language (sprint 09, feature 19).
 *
 * One literal `t()` call per key of `lib/notifications/notice-keys.ts`, so `pnpm i18n:extract` sees every string (a
 * key built at run time is invisible to it, and the computed-key ratchet fails it). The English `defaultValue` of each
 * case says what the key's template says; `notice-keys.test.ts` holds the two equal.
 *
 * `noticeText` answers null for a key it does not know, or params that do not fill the template: the caller then
 * shows the row's English `preview`, as it does for every notice written before the key existed.
 */
import type { TFunction } from 'i18next';
import { NOTICE_TEMPLATES, isNoticeKey, noticeParamNames } from '@/lib/notifications/notice-keys';

/** Writes an ISO instant as the reader's local date and time (`useLocaleFormat().dateTime`). */
export type NoticeInstantFormatter = (iso: string) => string;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The translated text of a notice, or null to fall back to the English preview. Params are rendered as text (React
 * escapes them), and the `*At` instants through `formatAt`.
 */
export function noticeText(
  t: TFunction,
  key: string | null | undefined,
  params: unknown,
  formatAt: NoticeInstantFormatter,
): string | null {
  if (!isNoticeKey(key)) return null;
  const given = isRecord(params) ? params : {};
  const values: Record<string, string | number> = {};
  for (const name of noticeParamNames(NOTICE_TEMPLATES[key])) {
    const v = given[name];
    if (typeof v !== 'string' && typeof v !== 'number') return null;
    // A member-written name inside a translated sentence is isolated, so its direction never reorders the sentence.
    values[name] = name.endsWith('At') ? formatAt(String(v)) : typeof v === 'string' ? `\u2068${v}\u2069` : v;
  }
  switch (key) {
    case 'achievement-almost':
      return t('notice-achievement-almost', {
        ns: 'notice-language',
        defaultValue: 'Almost there: {{name}}',
        ...values,
      });
    case 'achievement-halfway':
      return t('notice-achievement-halfway', { ns: 'notice-language', defaultValue: 'Halfway to {{name}}', ...values });
    case 'achievement-unlocked':
      return t('notice-achievement-unlocked', {
        ns: 'notice-language',
        defaultValue: 'Achievement unlocked: {{name}}',
        ...values,
      });
    case 'achievement-unlocked-coins':
      return t('notice-achievement-unlocked-coins', {
        ns: 'notice-language',
        defaultValue: 'Achievement unlocked: {{name}} (+{{coins}} coins)',
        ...values,
      });
    case 'appeal-accepted':
      return t('notice-appeal-accepted', {
        ns: 'notice-language',
        defaultValue: 'Your appeal was accepted — the strike has been removed from your account.',
        ...values,
      });
    case 'appeal-upheld':
      return t('notice-appeal-upheld', {
        ns: 'notice-language',
        defaultValue: 'Your appeal was reviewed and the strike stands.',
        ...values,
      });
    case 'award-received':
      return t('notice-award-received', {
        ns: 'notice-language',
        defaultValue: 'Your {{target}} received a {{award}} award {{emoji}}',
        ...values,
      });
    case 'balatro-invite':
      return t('notice-balatro-invite', {
        ns: 'notice-language',
        defaultValue: '{{name}} invited you to a Balatro lobby',
        ...values,
      });
    case 'birthday-today':
      return t('notice-birthday-today', {
        ns: 'notice-language',
        defaultValue: "It's {{name}}'s birthday today. Say happy birthday!",
        ...values,
      });
    case 'build-release':
      return t('notice-build-release', {
        ns: 'notice-language',
        defaultValue: '{{title}} {{version}} is out',
        ...values,
      });
    case 'build-unlocked':
      return t('notice-build-unlocked', {
        ns: 'notice-language',
        defaultValue: '{{name}} unlocked your build for {{price}} coins',
        ...values,
      });
    case 'card-order-filled':
      return t('notice-card-order-filled', {
        ns: 'notice-language',
        defaultValue: 'Your buy order for {{card}} filled for {{coins}} coins',
        ...values,
      });
    case 'card-sold':
      return t('notice-card-sold', {
        ns: 'notice-language',
        defaultValue: 'bought your {{card}} card for {{coins}} coins',
        ...values,
      });
    case 'card-trade-accepted':
      return t('notice-card-trade-accepted', {
        ns: 'notice-language',
        defaultValue: 'accepted your trade offer',
        ...values,
      });
    case 'card-trade-declined':
      return t('notice-card-trade-declined', {
        ns: 'notice-language',
        defaultValue: 'declined your trade offer',
        ...values,
      });
    case 'card-trade-offered':
      return t('notice-card-trade-offered', {
        ns: 'notice-language',
        defaultValue: 'sent you a trade offer',
        ...values,
      });
    case 'coins-added':
      return t('notice-coins-added', {
        ns: 'notice-language',
        defaultValue: 'RMH Studios added {{amount}} coins: {{reason}}',
        ...values,
      });
    case 'coins-removed':
      return t('notice-coins-removed', {
        ns: 'notice-language',
        defaultValue: 'RMH Studios removed {{amount}} coins: {{reason}}',
        ...values,
      });
    case 'community-ban-lifted':
      return t('notice-community-ban-lifted', {
        ns: 'notice-language',
        defaultValue: 'Your ban from {{community}} was lifted',
        ...values,
      });
    case 'community-ban-open':
      return t('notice-community-ban-open', {
        ns: 'notice-language',
        defaultValue: 'You were banned from {{community}} until a moderator lifts it',
        ...values,
      });
    case 'community-ban-open-rule':
      return t('notice-community-ban-open-rule', {
        ns: 'notice-language',
        defaultValue: 'You were banned from {{community}} until a moderator lifts it. Rule: {{rule}}',
        ...values,
      });
    case 'community-ban-until':
      return t('notice-community-ban-until', {
        ns: 'notice-language',
        defaultValue: 'You were banned from {{community}} until {{endsAt}}',
        ...values,
      });
    case 'community-ban-until-rule':
      return t('notice-community-ban-until-rule', {
        ns: 'notice-language',
        defaultValue: 'You were banned from {{community}} until {{endsAt}}. Rule: {{rule}}',
        ...values,
      });
    case 'community-challenge-won':
      return t('notice-community-challenge-won', {
        ns: 'notice-language',
        defaultValue: 'You won the "{{title}}" challenge',
        ...values,
      });
    case 'community-hall-of-fame':
      return t('notice-community-hall-of-fame', {
        ns: 'notice-language',
        defaultValue: 'Your post made the hall of fame in {{community}}',
        ...values,
      });
    case 'community-join-approved':
      return t('notice-community-join-approved', {
        ns: 'notice-language',
        defaultValue: "You're in: your request to join {{community}} was approved",
        ...values,
      });
    case 'community-join-asked':
      return t('notice-community-join-asked', {
        ns: 'notice-language',
        defaultValue: '{{name}} asked to join {{community}}',
        ...values,
      });
    case 'community-join-declined':
      return t('notice-community-join-declined', {
        ns: 'notice-language',
        defaultValue: 'Your request to join {{community}} was not approved',
        ...values,
      });
    case 'community-pin':
      return t('notice-community-pin', {
        ns: 'notice-language',
        defaultValue: 'Moderators of {{community}} pinned your post',
        ...values,
      });
    case 'community-post-alert':
      return t('notice-community-post-alert', {
        ns: 'notice-language',
        defaultValue: '{{author}} posted in {{community}}',
        ...values,
      });
    case 'community-post-alerts-collapsed':
      return t('notice-community-post-alerts-collapsed', {
        ns: 'notice-language',
        defaultValue: 'New posts in {{community}}',
        ...values,
      });
    case 'community-timeout-lifted':
      return t('notice-community-timeout-lifted', {
        ns: 'notice-language',
        defaultValue: 'Your timeout in {{community}} was lifted',
        ...values,
      });
    case 'community-timeout-open':
      return t('notice-community-timeout-open', {
        ns: 'notice-language',
        defaultValue: 'You were timed out in {{community}} until a moderator lifts it',
        ...values,
      });
    case 'community-timeout-open-rule':
      return t('notice-community-timeout-open-rule', {
        ns: 'notice-language',
        defaultValue: 'You were timed out in {{community}} until a moderator lifts it. Rule: {{rule}}',
        ...values,
      });
    case 'community-timeout-until':
      return t('notice-community-timeout-until', {
        ns: 'notice-language',
        defaultValue: 'You were timed out in {{community}} until {{endsAt}}',
        ...values,
      });
    case 'community-timeout-until-rule':
      return t('notice-community-timeout-until-rule', {
        ns: 'notice-language',
        defaultValue: 'You were timed out in {{community}} until {{endsAt}}. Rule: {{rule}}',
        ...values,
      });
    case 'creator-supporter':
      return t('notice-creator-supporter', {
        ns: 'notice-language',
        defaultValue: 'You have a new {{tier}} supporter!',
        ...values,
      });
    case 'deletion-drafts-waited':
      return t('notice-deletion-drafts-waited', {
        ns: 'notice-language',
        defaultValue: '{{count}} scheduled posts were not published while your account was set to be deleted',
        ...values,
      });
    case 'deletion-drafts-waited-one':
      return t('notice-deletion-drafts-waited-one', {
        ns: 'notice-language',
        defaultValue: '1 scheduled post was not published while your account was set to be deleted',
        ...values,
      });
    case 'emoji-pack-approved':
      return t('notice-emoji-pack-approved', {
        ns: 'notice-language',
        defaultValue: 'Your pack "{{pack}}" was approved — anyone can install it now',
        ...values,
      });
    case 'emoji-pack-removed':
      return t('notice-emoji-pack-removed', {
        ns: 'notice-language',
        defaultValue: 'Your pack "{{pack}}" was removed by moderators',
        ...values,
      });
    case 'emoji-pack-removed-note':
      return t('notice-emoji-pack-removed-note', {
        ns: 'notice-language',
        defaultValue: 'Your pack "{{pack}}" was removed by moderators: {{note}}',
        ...values,
      });
    case 'event-canceled':
      return t('notice-event-canceled', {
        ns: 'notice-language',
        defaultValue: '"{{title}}" was canceled.',
        ...values,
      });
    case 'event-cohost-accepted':
      return t('notice-event-cohost-accepted', {
        ns: 'notice-language',
        defaultValue: '{{name}} accepted your invitation to co-host {{title}}',
        ...values,
      });
    case 'event-cohost-invited':
      return t('notice-event-cohost-invited', {
        ns: 'notice-language',
        defaultValue: '{{name}} invited you to co-host {{title}}',
        ...values,
      });
    case 'event-host-rotation':
      return t('notice-event-host-rotation', {
        ns: 'notice-language',
        defaultValue: 'You are in the host rotation for "{{title}}".',
        ...values,
      });
    case 'event-occurrence-moved':
      return t('notice-event-occurrence-moved', {
        ns: 'notice-language',
        defaultValue: '{{title}} on {{occurrenceAt}} moves to {{startsAt}}',
        ...values,
      });
    case 'event-occurrence-restored':
      return t('notice-event-occurrence-restored', {
        ns: 'notice-language',
        defaultValue: '{{title}} on {{occurrenceAt}} is back on',
        ...values,
      });
    case 'event-occurrence-skipped':
      return t('notice-event-occurrence-skipped', {
        ns: 'notice-language',
        defaultValue: '{{title}} on {{occurrenceAt}} is skipped',
        ...values,
      });
    case 'event-starts-soon':
      return t('notice-event-starts-soon', {
        ns: 'notice-language',
        defaultValue: '"{{title}}" starts in 15 minutes.',
        ...values,
      });
    case 'event-starts-tomorrow':
      return t('notice-event-starts-tomorrow', {
        ns: 'notice-language',
        defaultValue: '"{{title}}" starts tomorrow.',
        ...values,
      });
    case 'event-waitlist-promoted':
      return t('notice-event-waitlist-promoted', {
        ns: 'notice-language',
        defaultValue: 'A place opened up: you are going to {{title}}',
        ...values,
      });
    case 'exchange-drawn':
      return t('notice-exchange-drawn', {
        ns: 'notice-language',
        defaultValue: '"{{title}}" is drawn: see who you are gifting.',
        ...values,
      });
    case 'exchange-drawn-mixtape':
      return t('notice-exchange-drawn-mixtape', {
        ns: 'notice-language',
        defaultValue: '"{{title}}" is drawn: your mixtape is ready.',
        ...values,
      });
    case 'exchange-undrawable':
      return t('notice-exchange-undrawable', {
        ns: 'notice-language',
        defaultValue: '"{{title}}" could not be drawn: it needs {{min}}+ members the exclusions allow.',
        ...values,
      });
    case 'feedback-replied':
      return t('notice-feedback-replied', {
        ns: 'notice-language',
        defaultValue: 'We replied to your feedback',
        ...values,
      });
    case 'first-week-complete':
      return t('notice-first-week-complete', {
        ns: 'notice-language',
        defaultValue: 'First Week complete! +{{coins}} coins and a starter cosmetic pack 🎉',
        ...values,
      });
    case 'flashcards-due':
      return t('notice-flashcards-due', {
        ns: 'notice-language',
        defaultValue: '{{count}} flashcards are due',
        ...values,
      });
    case 'flashcards-due-one':
      return t('notice-flashcards-due-one', { ns: 'notice-language', defaultValue: '1 flashcard is due', ...values });
    case 'friendly-challenge':
      return t('notice-friendly-challenge', {
        ns: 'notice-language',
        defaultValue: '{{name}} sent you a friendly challenge',
        ...values,
      });
    case 'game-guide-new':
      return t('notice-game-guide-new', {
        ns: 'notice-language',
        defaultValue: 'New guide for {{game}}: {{title}}',
        ...values,
      });
    case 'game-updated':
      return t('notice-game-updated', {
        ns: 'notice-language',
        defaultValue: '{{game}} updated to {{version}}: {{title}}',
        ...values,
      });
    case 'gift-coins':
      return t('notice-gift-coins', {
        ns: 'notice-language',
        defaultValue: '🎁 You received a gift of {{amount}} coins!',
        ...values,
      });
    case 'gift-coins-note':
      return t('notice-gift-coins-note', {
        ns: 'notice-language',
        defaultValue: '🎁 You received a gift of {{amount}} coins: “{{note}}”',
        ...values,
      });
    case 'gift-refunded':
      return t('notice-gift-refunded', {
        ns: 'notice-language',
        defaultValue: 'Your scheduled gift ({{item}}) could not be delivered, so you were refunded.',
        ...values,
      });
    case 'gift-waiting':
      return t('notice-gift-waiting', {
        ns: 'notice-language',
        defaultValue: 'You have a gift waiting to be unwrapped!',
        ...values,
      });
    case 'goal-delivered':
      return t('notice-goal-delivered', {
        ns: 'notice-language',
        defaultValue: 'Your community goal was delivered — thank you for chipping in!',
        ...values,
      });
    case 'goal-funded':
      return t('notice-goal-funded', {
        ns: 'notice-language',
        defaultValue: 'A community goal you pledged to has been fully funded!',
        ...values,
      });
    case 'goal-refunded':
      return t('notice-goal-refunded', {
        ns: 'notice-language',
        defaultValue: 'A community goal you pledged to ended — your coins were refunded.',
        ...values,
      });
    case 'group-added':
      return t('notice-group-added', {
        ns: 'notice-language',
        defaultValue: '{{actor}} added you to {{group}}',
        ...values,
      });
    case 'handover-accepted':
      return t('notice-handover-accepted', {
        ns: 'notice-language',
        defaultValue: '{{name}} accepted ownership of {{community}}',
        ...values,
      });
    case 'handover-declined':
      return t('notice-handover-declined', {
        ns: 'notice-language',
        defaultValue: '{{name}} declined ownership of {{community}}',
        ...values,
      });
    case 'handover-offered':
      return t('notice-handover-offered', {
        ns: 'notice-language',
        defaultValue: '{{name}} offered you ownership of {{community}}',
        ...values,
      });
    case 'handover-owner':
      return t('notice-handover-owner', {
        ns: 'notice-language',
        defaultValue: 'You are now the owner of {{community}}',
        ...values,
      });
    case 'handover-withdrawn':
      return t('notice-handover-withdrawn', {
        ns: 'notice-language',
        defaultValue: '{{name}} withdrew the offer of {{community}}',
        ...values,
      });
    case 'home-watch-rental':
      return t('notice-home-watch-rental', {
        ns: 'notice-language',
        defaultValue: 'New rental matching “{{label}}”: {{title}} — ${{price}} in {{city}}, {{state}}',
        ...values,
      });
    case 'home-watch-sale':
      return t('notice-home-watch-sale', {
        ns: 'notice-language',
        defaultValue: 'New home for sale matching “{{label}}”: {{title}} — ${{price}} in {{city}}, {{state}}',
        ...values,
      });
    case 'jam-feedback-many':
      return t('notice-jam-feedback-many', {
        ns: 'notice-language',
        defaultValue: '{{count}} new pieces of feedback on your entry in {{jam}}',
        ...values,
      });
    case 'jam-feedback-one':
      return t('notice-jam-feedback-one', {
        ns: 'notice-language',
        defaultValue: 'New feedback on your entry in {{jam}}',
        ...values,
      });
    case 'jam-team-added':
      return t('notice-jam-team-added', {
        ns: 'notice-language',
        defaultValue: '{{name}} added you to their entry in {{jam}}',
        ...values,
      });
    case 'jam-team-joined':
      return t('notice-jam-team-joined', {
        ns: 'notice-language',
        defaultValue: '{{name}} joined your entry in {{jam}}',
        ...values,
      });
    case 'jam-theme-revealed':
      return t('notice-jam-theme-revealed', {
        ns: 'notice-language',
        defaultValue: 'The theme of {{jam}} is {{theme}}',
        ...values,
      });
    case 'keyword-alert':
      return t('notice-keyword-alert', { ns: 'notice-language', defaultValue: '"{{keyword}}": {{text}}', ...values });
    case 'kudos-received':
      return t('notice-kudos-received', { ns: 'notice-language', defaultValue: 'Kudos: {{reason}}', ...values });
    case 'level-reached':
      return t('notice-level-reached', {
        ns: 'notice-language',
        defaultValue: 'You reached level {{level}}!',
        ...values,
      });
    case 'member-joined':
      return t('notice-member-joined', {
        ns: 'notice-language',
        defaultValue: '{{name}} became a member 🎉',
        ...values,
      });
    case 'membership-gifted':
      return t('notice-membership-gifted', {
        ns: 'notice-language',
        defaultValue: '{{name}} gifted you {{months}} month(s) of {{tier}}!',
        ...values,
      });
    case 'membership-granted':
      return t('notice-membership-granted', {
        ns: 'notice-language',
        defaultValue: 'An admin granted you {{months}} month(s) of {{tier}}!',
        ...values,
      });
    case 'memory-one-year':
      return t('notice-memory-one-year', {
        ns: 'notice-language',
        defaultValue: '1 year ago today: {{text}}',
        ...values,
      });
    case 'memory-years':
      return t('notice-memory-years', {
        ns: 'notice-language',
        defaultValue: '{{years}} years ago today: {{text}}',
        ...values,
      });
    case 'message-request-accepted':
      return t('notice-message-request-accepted', {
        ns: 'notice-language',
        defaultValue: 'accepted your message request',
        ...values,
      });
    case 'moderation-edited':
      return t('notice-moderation-edited', {
        ns: 'notice-language',
        defaultValue: 'Your {{noun}}{{named}} was edited by site moderation. Reason: {{reason}}',
        ...values,
      });
    case 'moderation-edited-strike':
      return t('notice-moderation-edited-strike', {
        ns: 'notice-language',
        defaultValue:
          'Your {{noun}}{{named}} was edited by site moderation. Reason: {{reason}} A strike was added to your account; you can review or appeal it in Settings → Account status.',
        ...values,
      });
    case 'moderation-removed':
      return t('notice-moderation-removed', {
        ns: 'notice-language',
        defaultValue: 'Your {{noun}}{{named}} was removed by site moderation. Reason: {{reason}}',
        ...values,
      });
    case 'moderation-removed-strike':
      return t('notice-moderation-removed-strike', {
        ns: 'notice-language',
        defaultValue:
          'Your {{noun}}{{named}} was removed by site moderation. Reason: {{reason}} A strike was added to your account; you can review or appeal it in Settings → Account status.',
        ...values,
      });
    case 'moderation-restored':
      return t('notice-moderation-restored', {
        ns: 'notice-language',
        defaultValue: 'Your {{noun}}{{named}} was restored by site moderation.',
        ...values,
      });
    case 'office-hours-booked':
      return t('notice-office-hours-booked', {
        ns: 'notice-language',
        defaultValue: '{{name}} booked your office hours for {{startsAt}}.',
        ...values,
      });
    case 'office-hours-cancelled':
      return t('notice-office-hours-cancelled', {
        ns: 'notice-language',
        defaultValue: '{{name}} cancelled the office-hours booking for {{startsAt}}.',
        ...values,
      });
    case 'office-hours-confirmed':
      return t('notice-office-hours-confirmed', {
        ns: 'notice-language',
        defaultValue: 'You are booked with {{name}} on {{startsAt}}. Download the calendar file from the booking page.',
        ...values,
      });
    case 'onboarding-complete':
      return t('notice-onboarding-complete', {
        ns: 'notice-language',
        defaultValue: 'Checklist complete! +{{coins}} coins. Welcome to RMH Studios 🎉',
        ...values,
      });
    case 'party-cancelled':
      return t('notice-party-cancelled', { ns: 'notice-language', defaultValue: 'Cancelled: {{name}}', ...values });
    case 'party-invite':
      return t('notice-party-invite', {
        ns: 'notice-language',
        defaultValue: '{{name}} invited you to a party',
        ...values,
      });
    case 'party-starting-now':
      return t('notice-party-starting-now', {
        ns: 'notice-language',
        defaultValue: 'Starting now: {{name}}',
        ...values,
      });
    case 'party-starting-soon':
      return t('notice-party-starting-soon', {
        ns: 'notice-language',
        defaultValue: 'Starting in 15 minutes: {{name}}',
        ...values,
      });
    case 'party-time-changed':
      return t('notice-party-time-changed', {
        ns: 'notice-language',
        defaultValue: 'Time changed: {{name}}',
        ...values,
      });
    case 'pile-on':
      return t('notice-pile-on', {
        ns: 'notice-language',
        defaultValue: 'A post of yours is getting a burst of replies from people you do not know.',
        ...values,
      });
    case 'poll-ended-no-votes':
      return t('notice-poll-ended-no-votes', {
        ns: 'notice-language',
        defaultValue: 'Your poll ended with no votes',
        ...values,
      });
    case 'poll-ended-tie':
      return t('notice-poll-ended-tie', {
        ns: 'notice-language',
        defaultValue: 'Your poll ended in a tie: {{names}} with {{percent}}% each',
        ...values,
      });
    case 'poll-ended-won':
      return t('notice-poll-ended-won', {
        ns: 'notice-language',
        defaultValue: 'Your poll ended: {{names}} won with {{percent}}%',
        ...values,
      });
    case 'poll-locked':
      return t('notice-poll-locked', {
        ns: 'notice-language',
        defaultValue: '"{{title}}" is locked in for {{startsAt}}. Open the poll to add it to your calendar.',
        ...values,
      });
    case 'poll-pick-times':
      return t('notice-poll-pick-times', {
        ns: 'notice-language',
        defaultValue: '{{name}} needs you to pick times for "{{title}}".',
        ...values,
      });
    case 'poll-ranked-ended':
      return t('notice-poll-ranked-ended', {
        ns: 'notice-language',
        defaultValue: 'Your ranked poll ended: {{winner}} won the count',
        ...values,
      });
    case 'poll-ranked-ended-no-votes':
      return t('notice-poll-ranked-ended-no-votes', {
        ns: 'notice-language',
        defaultValue: 'Your ranked poll ended with no votes',
        ...values,
      });
    case 'poll-ranked-voter-ended':
      return t('notice-poll-ranked-voter-ended', {
        ns: 'notice-language',
        defaultValue: 'A ranked poll you voted in ended',
        ...values,
      });
    case 'poll-ranked-voter-ended-winner':
      return t('notice-poll-ranked-voter-ended-winner', {
        ns: 'notice-language',
        defaultValue: 'A ranked poll you voted in ended: {{winner}} won the count',
        ...values,
      });
    case 'poll-voter-ended':
      return t('notice-poll-voter-ended', {
        ns: 'notice-language',
        defaultValue: 'A poll you voted in ended',
        ...values,
      });
    case 'post-unlocked':
      return t('notice-post-unlocked', {
        ns: 'notice-language',
        defaultValue: '{{name}} unlocked your post for 🪙 {{price}}',
        ...values,
      });
    case 'ranked-challenge':
      return t('notice-ranked-challenge', {
        ns: 'notice-language',
        defaultValue: '{{name}} challenged you to a ranked match',
        ...values,
      });
    case 'recurring-paused':
      return t('notice-recurring-paused', {
        ns: 'notice-language',
        defaultValue: 'The recurring thread "{{title}}" in {{community}} was paused',
        ...values,
      });
    case 'redemption-approved':
      return t('notice-redemption-approved', {
        ns: 'notice-language',
        defaultValue: 'Your redemption was approved',
        ...values,
      });
    case 'redemption-declined':
      return t('notice-redemption-declined', {
        ns: 'notice-language',
        defaultValue: 'Your redemption was declined and your coins were refunded',
        ...values,
      });
    case 'redemption-fulfilled':
      return t('notice-redemption-fulfilled', {
        ns: 'notice-language',
        defaultValue: 'Your redemption was fulfilled 🎉',
        ...values,
      });
    case 'referral-active':
      return t('notice-referral-active', {
        ns: 'notice-language',
        defaultValue: '{{name}} is now active — you both earned {{coins}} coins!',
        ...values,
      });
    case 'referral-bonus':
      return t('notice-referral-bonus', {
        ns: 'notice-language',
        defaultValue: 'Referral bonus: +{{coins}} coins for joining through an invite!',
        ...values,
      });
    case 'referral-request-accepted':
      return t('notice-referral-request-accepted', {
        ns: 'notice-language',
        defaultValue: 'Your referral request for {{company}} was accepted',
        ...values,
      });
    case 'referral-request-new':
      return t('notice-referral-request-new', {
        ns: 'notice-language',
        defaultValue: 'New referral request for {{company}}',
        ...values,
      });
    case 'referral-request-passed':
      return t('notice-referral-request-passed', {
        ns: 'notice-language',
        defaultValue: 'Your referral request for {{company}} was passed on',
        ...values,
      });
    case 'reminder-note':
      return t('notice-reminder-note', { ns: 'notice-language', defaultValue: '{{label}} — {{note}}', ...values });
    case 'report-action-taken':
      return t('notice-report-action-taken', {
        ns: 'notice-language',
        defaultValue: 'Your report was reviewed: action taken',
        ...values,
      });
    case 'report-no-violation':
      return t('notice-report-no-violation', {
        ns: 'notice-language',
        defaultValue: 'Your report was reviewed: no violation found',
        ...values,
      });
    case 'request-status':
      return t('notice-request-status', {
        ns: 'notice-language',
        defaultValue: 'Your request "{{title}}" is now {{status}}',
        ...values,
      });
    case 'restriction-lifted':
      return t('notice-restriction-lifted', {
        ns: 'notice-language',
        defaultValue: 'The restriction on {{label}} has been lifted.',
        ...values,
      });
    case 'restriction-permanent':
      return t('notice-restriction-permanent', {
        ns: 'notice-language',
        defaultValue: '{{label}} has been permanently restricted on your account. Reason: {{reason}}',
        ...values,
      });
    case 'restriction-until':
      return t('notice-restriction-until', {
        ns: 'notice-language',
        defaultValue: '{{label}} has been restricted on your account until {{endsAt}}. Reason: {{reason}}',
        ...values,
      });
    case 'ride-accepted':
      return t('notice-ride-accepted', {
        ns: 'notice-language',
        defaultValue: '{{driver}} accepted your ride and is on the way.',
        ...values,
      });
    case 'ride-cancelled-by-driver':
      return t('notice-ride-cancelled-by-driver', {
        ns: 'notice-language',
        defaultValue: 'Your driver cancelled — request a new ride anytime.',
        ...values,
      });
    case 'ride-cancelled-by-rider':
      return t('notice-ride-cancelled-by-rider', {
        ns: 'notice-language',
        defaultValue: 'The rider cancelled this trip.',
        ...values,
      });
    case 'ride-complete':
      return t('notice-ride-complete', {
        ns: 'notice-language',
        defaultValue: 'Your trip is complete. Tap to rate your driver.',
        ...values,
      });
    case 'ride-requested':
      return t('notice-ride-requested', {
        ns: 'notice-language',
        defaultValue: 'New {{rideClass}} request: {{pickup}} → {{dropoff}}',
        ...values,
      });
    case 'ride-started':
      return t('notice-ride-started', {
        ns: 'notice-language',
        defaultValue: 'Your trip has started. Enjoy the ride!',
        ...values,
      });
    case 'ride-tipped':
      return t('notice-ride-tipped', {
        ns: 'notice-language',
        defaultValue: 'Your rider added a {{tip}} tip. Thanks for the great ride!',
        ...values,
      });
    case 'rival-beat':
      return t('notice-rival-beat', {
        ns: 'notice-language',
        defaultValue: '{{name}} just beat your best in {{game}}.',
        ...values,
      });
    case 'rival-passed-many':
      return t('notice-rival-passed-many', {
        ns: 'notice-language',
        defaultValue: '{{name}} and {{count}} more rivals just passed your best score.',
        ...values,
      });
    case 'rival-passed-one-more':
      return t('notice-rival-passed-one-more', {
        ns: 'notice-language',
        defaultValue: '{{name}} and 1 more rival just passed your best score.',
        ...values,
      });
    case 'scheduled-alt-required':
      return t('notice-scheduled-alt-required', {
        ns: 'notice-language',
        defaultValue: 'Your scheduled post to {{community}} was not published: an image needs a description',
        ...values,
      });
    case 'scheduled-held':
      return t('notice-scheduled-held', {
        ns: 'notice-language',
        defaultValue: 'Your scheduled post to {{community}} is waiting for a moderator',
        ...values,
      });
    case 'scheduled-refused':
      return t('notice-scheduled-refused', {
        ns: 'notice-language',
        defaultValue: 'Your scheduled post to {{community}} was not published: {{reason}}',
        ...values,
      });
    case 'series-new-part':
      return t('notice-series-new-part', {
        ns: 'notice-language',
        defaultValue: 'New part in "{{series}}"',
        ...values,
      });
    case 'spend-budget-80':
      return t('notice-spend-budget-80', {
        ns: 'notice-language',
        defaultValue: 'You have used 80% of your spending budget',
        ...values,
      });
    case 'streak-continues':
      return t('notice-streak-continues', {
        ns: 'notice-language',
        defaultValue: 'Your {{days}}-day streak continues if you check in today.',
        ...values,
      });
    case 'strike-warning':
      return t('notice-strike-warning', {
        ns: 'notice-language',
        defaultValue:
          'You received a moderation warning: {{reason}}. You can review or appeal it in Settings → Account status.',
        ...values,
      });
    case 'studio-challenge-won':
      return t('notice-studio-challenge-won', {
        ns: 'notice-language',
        defaultValue: 'Your flip won "{{title}}"',
        ...values,
      });
    case 'study-buddy-found-at':
      return t('notice-study-buddy-found-at', {
        ns: 'notice-language',
        defaultValue:
          'Study buddy found: {{name}} will do {{minutes}} minutes of {{subject}} with you at {{startsAt}}.',
        ...values,
      });
    case 'study-buddy-found-now':
      return t('notice-study-buddy-found-now', {
        ns: 'notice-language',
        defaultValue: 'Study buddy found: {{name}} will do {{minutes}} minutes of {{subject}} with you right now.',
        ...values,
      });
    case 'study-buddy-nobody-now':
      return t('notice-study-buddy-nobody-now', {
        ns: 'notice-language',
        defaultValue: 'No study partner for {{subject}} turned up this time. Try again or book a slot.',
        ...values,
      });
    case 'study-buddy-nobody-slot':
      return t('notice-study-buddy-nobody-slot', {
        ns: 'notice-language',
        defaultValue: 'Nobody else booked your {{subject}} study slot. Try another time.',
        ...values,
      });
    case 'sweep-restored':
      return t('notice-sweep-restored', {
        ns: 'notice-language',
        defaultValue: '{{count}} posts and replies were restored by site moderation.',
        ...values,
      });
    case 'sweep-restored-one':
      return t('notice-sweep-restored-one', {
        ns: 'notice-language',
        defaultValue: '1 post or reply was restored by site moderation.',
        ...values,
      });
    case 'time-capsule-opened':
      return t('notice-time-capsule-opened', {
        ns: 'notice-language',
        defaultValue: 'Your time capsule has opened',
        ...values,
      });
    case 'tip-received':
      return t('notice-tip-received', {
        ns: 'notice-language',
        defaultValue: '{{sender}} tipped you 🪙 {{amount}}',
        ...values,
      });
    case 'tip-received-note':
      return t('notice-tip-received-note', {
        ns: 'notice-language',
        defaultValue: '{{sender}} tipped you 🪙 {{amount}} — “{{note}}”',
        ...values,
      });
    case 'tournament-checkin-open':
      return t('notice-tournament-checkin-open', {
        ns: 'notice-language',
        defaultValue: 'Check-in is open for {{name}}',
        ...values,
      });
    case 'tournament-match-awarded':
      return t('notice-tournament-match-awarded', {
        ns: 'notice-language',
        defaultValue: 'The host awarded a match in {{name}}',
        ...values,
      });
    case 'tournament-match-due-soon':
      return t('notice-tournament-match-due-soon', {
        ns: 'notice-language',
        defaultValue: 'Your {{name}} match is due in 12 hours',
        ...values,
      });
    case 'tournament-match-in-hour':
      return t('notice-tournament-match-in-hour', {
        ns: 'notice-language',
        defaultValue: 'Your {{name}} match is in an hour',
        ...values,
      });
    case 'tournament-removed-no-checkin':
      return t('notice-tournament-removed-no-checkin', {
        ns: 'notice-language',
        defaultValue: 'You were removed from {{name}} because you did not check in',
        ...values,
      });
    case 'tournament-result-disputed':
      return t('notice-tournament-result-disputed', {
        ns: 'notice-language',
        defaultValue: 'A result was disputed in {{name}}',
        ...values,
      });
    case 'tournament-result-host-decided':
      return t('notice-tournament-result-host-decided', {
        ns: 'notice-language',
        defaultValue: 'The host decided a result in {{name}}',
        ...values,
      });
    case 'tournament-result-reported':
      return t('notice-tournament-result-reported', {
        ns: 'notice-language',
        defaultValue: 'A result was reported in {{name}}: confirm or dispute it',
        ...values,
      });
    case 'tournament-result-settled-late':
      return t('notice-tournament-result-settled-late', {
        ns: 'notice-language',
        defaultValue: 'A result in {{name}} was settled: it was not answered in time',
        ...values,
      });
    case 'tournament-started':
      return t('notice-tournament-started', {
        ns: 'notice-language',
        defaultValue: '{{name}} has started — check your bracket',
        ...values,
      });
    case 'tournament-time-agreed':
      return t('notice-tournament-time-agreed', {
        ns: 'notice-language',
        defaultValue: 'A time is agreed for your {{name}} match',
        ...values,
      });
    case 'tournament-time-proposed':
      return t('notice-tournament-time-proposed', {
        ns: 'notice-language',
        defaultValue: 'Your opponent proposed a time for your {{name}} match',
        ...values,
      });
    case 'tournament-time-set-by-host':
      return t('notice-tournament-time-set-by-host', {
        ns: 'notice-language',
        defaultValue: 'The host set a time for your {{name}} match',
        ...values,
      });
    case 'wager-accepted':
      return t('notice-wager-accepted', {
        ns: 'notice-language',
        defaultValue: 'Your {{game}} challenge was accepted — play now',
        ...values,
      });
    case 'wager-challenged':
      return t('notice-wager-challenged', {
        ns: 'notice-language',
        defaultValue: "You've been challenged to {{game}} for {{coins}} coins",
        ...values,
      });
    case 'wager-won':
      return t('notice-wager-won', {
        ns: 'notice-language',
        defaultValue: 'You won a wager — {{coins}} coins paid out',
        ...values,
      });
    case 'watch-market-listing':
      return t('notice-watch-market-listing', {
        ns: 'notice-language',
        defaultValue: 'New listing for {{item}}: {{price}} coins',
        ...values,
      });
    case 'wishlist-daily-shop':
      return t('notice-wishlist-daily-shop', {
        ns: 'notice-language',
        defaultValue: "{{item}} is in today's shop",
        ...values,
      });
    case 'wishlist-price-drop':
      return t('notice-wishlist-price-drop', {
        ns: 'notice-language',
        defaultValue: '{{item}} dropped to {{price}} coins',
        ...values,
      });
    case 'wishlist-target-met':
      return t('notice-wishlist-target-met', {
        ns: 'notice-language',
        defaultValue: '{{item}} is at {{price}} coins — within your target price',
        ...values,
      });
    // Sprint 10 notices (docs/autonomous/sprint-10/plan.md §Anchors)
    // s10-04 deck-suggestions
    case 'deck-suggestions-new':
      return t('notice-deck-suggestions-new', {
        ns: 'notice-language',
        defaultValue: 'New suggestions on {{deck}}',
        ...values,
      });
    case 'deck-suggestion-accepted':
      return t('notice-deck-suggestion-accepted', {
        ns: 'notice-language',
        defaultValue: 'Your suggestion to {{deck}} was accepted',
        ...values,
      });
    case 'deck-suggestion-declined':
      return t('notice-deck-suggestion-declined', {
        ns: 'notice-language',
        defaultValue: 'Your suggestion to {{deck}} was not taken: {{reason}}',
        ...values,
      });

    // s10-09 build-issues
    case 'build-issues-new':
      return t('notice-build-issues-new', {
        ns: 'notice-language',
        defaultValue: 'New issues on {{build}}',
        ...values,
      });
    case 'build-issue-confirmed':
      return t('notice-build-issue-confirmed', {
        ns: 'notice-language',
        defaultValue: 'Your issue on {{build}} was confirmed: {{issue}}',
        ...values,
      });
    case 'build-issue-fixed':
      return t('notice-build-issue-fixed', {
        ns: 'notice-language',
        defaultValue: 'Your issue on {{build}} was fixed in {{version}}: {{issue}}',
        ...values,
      });
    case 'build-issue-fixed-seen':
      return t('notice-build-issue-fixed-seen', {
        ns: 'notice-language',
        defaultValue: 'An issue you see too on {{build}} was fixed in {{version}}: {{issue}}',
        ...values,
      });
    case 'build-issue-wont-fix':
      return t('notice-build-issue-wont-fix', {
        ns: 'notice-language',
        defaultValue: 'Your issue on {{build}} will not be fixed: {{issue}}',
        ...values,
      });
    case 'build-issue-duplicate':
      return t('notice-build-issue-duplicate', {
        ns: 'notice-language',
        defaultValue: 'Your issue on {{build}} was marked as a duplicate: {{issue}}',
        ...values,
      });
    case 'build-issue-reopened':
      return t('notice-build-issue-reopened', {
        ns: 'notice-language',
        defaultValue: 'Your issue on {{build}} was reopened: {{issue}}',
        ...values,
      });

    // s10-15 admin-webhooks
    case 'webhook-admin-disabled':
      return t('notice-webhook-admin-disabled', {
        ns: 'notice-language',
        defaultValue: 'An admin turned off your webhook to {{host}}: {{reason}}',
        ...values,
      });

    // s10-16 speedrun-queue
    case 'speedrun-run-verified':
      return t('notice-speedrun-run-verified', {
        ns: 'notice-language',
        defaultValue: 'Your {{game}} run was verified',
        ...values,
      });
    case 'speedrun-run-rejected':
      return t('notice-speedrun-run-rejected', {
        ns: 'notice-language',
        defaultValue: 'Your {{game}} run was not verified: {{reason}}',
        ...values,
      });

    // s10-17 admin-communities
    case 'community-delisted':
      return t('notice-community-delisted', {
        ns: 'notice-language',
        defaultValue: '{{community}} is out of discovery: {{reason}}',
        ...values,
      });

    default:
      return null;
  }
}

/** What the inbox shows for a row: the notice in the reader's language, else the stored English preview. */
export function inboxPreview(
  t: TFunction,
  row: { preview: string | null; previewKey?: string | null; previewParams?: unknown },
  formatAt: NoticeInstantFormatter,
): string | null {
  return noticeText(t, row.previewKey, row.previewParams, formatAt) ?? row.preview;
}
