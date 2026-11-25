/**
 * System notices in the reader's language (sprint 09, feature 19).
 *
 * A `SYSTEM` notice the site writes is stored with a translation key and plain params beside its English sentence.
 * The inbox renders the key in the reader's language (`components/feed/notice-previews.ts` holds one literal `t()`
 * call per key); push, e-mail and rows written before the key existed read the English `preview`.
 *
 * - A key is named after the notice, not the emitter (`scheduled-alt-required`, `community-timeout`).
 * - `NOTICE_TEMPLATES` is the English, with `{{name}}` slots; `notice()` fills it in as the stored fallback. The
 *   catalogue's `defaultValue`s say the same thing, and `lib/notifications/__tests__/notice-keys.test.ts` holds them
 *   equal for every key.
 * - Params are strings and numbers. An instant is an ISO string under a name ending `At`: the fallback writes it as UTC,
 *   the inbox as the reader's local date and time. Member-written text (a community name, a title) is a param and is
 *   never translated.
 * - Adding a key: add the template here, the matching `case` in `notice-previews.ts`, then `pnpm i18n:extract` and keep
 *   only `locales/en/notice-language.json`. Changing the wording of a shipped key means a new key.
 *
 * Pure and client-safe: no server imports.
 */

export const NOTICE_TEMPLATES = {
  'achievement-almost': 'Almost there: {{name}}',
  'achievement-halfway': 'Halfway to {{name}}',
  'achievement-unlocked': 'Achievement unlocked: {{name}}',
  'achievement-unlocked-coins': 'Achievement unlocked: {{name}} (+{{coins}} coins)',
  'appeal-accepted': 'Your appeal was accepted — the strike has been removed from your account.',
  'appeal-upheld': 'Your appeal was reviewed and the strike stands.',
  'award-received': 'Your {{target}} received a {{award}} award {{emoji}}',
  'balatro-invite': '{{name}} invited you to a Balatro lobby',
  'birthday-today': "It's {{name}}'s birthday today. Say happy birthday!",
  'build-release': '{{title}} {{version}} is out',
  'build-unlocked': '{{name}} unlocked your build for {{price}} coins',
  'card-order-filled': 'Your buy order for {{card}} filled for {{coins}} coins',
  'card-sold': 'bought your {{card}} card for {{coins}} coins',
  'card-trade-accepted': 'accepted your trade offer',
  'card-trade-declined': 'declined your trade offer',
  'card-trade-offered': 'sent you a trade offer',
  'coins-added': 'RMH Studios added {{amount}} coins: {{reason}}',
  'coins-removed': 'RMH Studios removed {{amount}} coins: {{reason}}',
  'community-ban-lifted': 'Your ban from {{community}} was lifted',
  'community-ban-open': 'You were banned from {{community}} until a moderator lifts it',
  'community-ban-open-rule': 'You were banned from {{community}} until a moderator lifts it. Rule: {{rule}}',
  'community-ban-until': 'You were banned from {{community}} until {{endsAt}}',
  'community-ban-until-rule': 'You were banned from {{community}} until {{endsAt}}. Rule: {{rule}}',
  'community-challenge-won': 'You won the "{{title}}" challenge',
  'community-hall-of-fame': 'Your post made the hall of fame in {{community}}',
  'community-join-approved': "You're in: your request to join {{community}} was approved",
  'community-join-asked': '{{name}} asked to join {{community}}',
  'community-join-declined': 'Your request to join {{community}} was not approved',
  'community-pin': 'Moderators of {{community}} pinned your post',
  'community-post-alert': '{{author}} posted in {{community}}',
  'community-post-alerts-collapsed': 'New posts in {{community}}',
  'community-timeout-lifted': 'Your timeout in {{community}} was lifted',
  'community-timeout-open': 'You were timed out in {{community}} until a moderator lifts it',
  'community-timeout-open-rule': 'You were timed out in {{community}} until a moderator lifts it. Rule: {{rule}}',
  'community-timeout-until': 'You were timed out in {{community}} until {{endsAt}}',
  'community-timeout-until-rule': 'You were timed out in {{community}} until {{endsAt}}. Rule: {{rule}}',
  'creator-supporter': 'You have a new {{tier}} supporter!',
  'deletion-drafts-waited': '{{count}} scheduled posts were not published while your account was set to be deleted',
  'deletion-drafts-waited-one': '1 scheduled post was not published while your account was set to be deleted',
  'emoji-pack-approved': 'Your pack "{{pack}}" was approved — anyone can install it now',
  'emoji-pack-removed': 'Your pack "{{pack}}" was removed by moderators',
  'emoji-pack-removed-note': 'Your pack "{{pack}}" was removed by moderators: {{note}}',
  'event-canceled': '"{{title}}" was canceled.',
  'event-cohost-accepted': '{{name}} accepted your invitation to co-host {{title}}',
  'event-cohost-invited': '{{name}} invited you to co-host {{title}}',
  'event-host-rotation': 'You are in the host rotation for "{{title}}".',
  'event-occurrence-moved': '{{title}} on {{occurrenceAt}} moves to {{startsAt}}',
  'event-occurrence-restored': '{{title}} on {{occurrenceAt}} is back on',
  'event-occurrence-skipped': '{{title}} on {{occurrenceAt}} is skipped',
  'event-starts-soon': '"{{title}}" starts in 15 minutes.',
  'event-starts-tomorrow': '"{{title}}" starts tomorrow.',
  'event-waitlist-promoted': 'A place opened up: you are going to {{title}}',
  'exchange-drawn': '"{{title}}" is drawn: see who you are gifting.',
  'exchange-drawn-mixtape': '"{{title}}" is drawn: your mixtape is ready.',
  'exchange-undrawable': '"{{title}}" could not be drawn: it needs {{min}}+ members the exclusions allow.',
  'feedback-replied': 'We replied to your feedback',
  'first-week-complete': 'First Week complete! +{{coins}} coins and a starter cosmetic pack 🎉',
  'flashcards-due': '{{count}} flashcards are due',
  'flashcards-due-one': '1 flashcard is due',
  'friendly-challenge': '{{name}} sent you a friendly challenge',
  'game-guide-new': 'New guide for {{game}}: {{title}}',
  'game-updated': '{{game}} updated to {{version}}: {{title}}',
  'gift-coins': '🎁 You received a gift of {{amount}} coins!',
  'gift-coins-note': '🎁 You received a gift of {{amount}} coins: “{{note}}”',
  'gift-refunded': 'Your scheduled gift ({{item}}) could not be delivered, so you were refunded.',
  'gift-waiting': 'You have a gift waiting to be unwrapped!',
  'goal-delivered': 'Your community goal was delivered — thank you for chipping in!',
  'goal-funded': 'A community goal you pledged to has been fully funded!',
  'goal-refunded': 'A community goal you pledged to ended — your coins were refunded.',
  'group-added': '{{actor}} added you to {{group}}',
  'handover-accepted': '{{name}} accepted ownership of {{community}}',
  'handover-declined': '{{name}} declined ownership of {{community}}',
  'handover-offered': '{{name}} offered you ownership of {{community}}',
  'handover-owner': 'You are now the owner of {{community}}',
  'handover-withdrawn': '{{name}} withdrew the offer of {{community}}',
  'home-watch-rental': 'New rental matching “{{label}}”: {{title}} — ${{price}} in {{city}}, {{state}}',
  'home-watch-sale': 'New home for sale matching “{{label}}”: {{title}} — ${{price}} in {{city}}, {{state}}',
  'jam-feedback-many': '{{count}} new pieces of feedback on your entry in {{jam}}',
  'jam-feedback-one': 'New feedback on your entry in {{jam}}',
  'jam-team-added': '{{name}} added you to their entry in {{jam}}',
  'jam-team-joined': '{{name}} joined your entry in {{jam}}',
  'jam-theme-revealed': 'The theme of {{jam}} is {{theme}}',
  'keyword-alert': '"{{keyword}}": {{text}}',
  'kudos-received': 'Kudos: {{reason}}',
  'level-reached': 'You reached level {{level}}!',
  'member-joined': '{{name}} became a member 🎉',
  'membership-gifted': '{{name}} gifted you {{months}} month(s) of {{tier}}!',
  'membership-granted': 'An admin granted you {{months}} month(s) of {{tier}}!',
  'medschools-qa-limit-approved': 'Your request for a higher Q&A limit was approved',
  'medschools-qa-limit-approved-note': 'Your request for a higher Q&A limit was approved: {{note}}',
  'medschools-qa-limit-declined': 'Your request for a higher Q&A limit was declined',
  'medschools-qa-limit-declined-note': 'Your request for a higher Q&A limit was declined: {{note}}',
  'medschools-qa-limit-revoked': 'Your higher Q&A limit was withdrawn',
  'medschools-qa-limit-revoked-note': 'Your higher Q&A limit was withdrawn: {{note}}',
  'memory-one-year': '1 year ago today: {{text}}',
  'memory-years': '{{years}} years ago today: {{text}}',
  'message-request-accepted': 'accepted your message request',
  'moderation-edited': 'Your {{noun}}{{named}} was edited by site moderation. Reason: {{reason}}',
  'moderation-edited-strike':
    'Your {{noun}}{{named}} was edited by site moderation. Reason: {{reason}} A strike was added to your account; you can review or appeal it in Settings → Account status.',
  'moderation-removed': 'Your {{noun}}{{named}} was removed by site moderation. Reason: {{reason}}',
  'moderation-removed-strike':
    'Your {{noun}}{{named}} was removed by site moderation. Reason: {{reason}} A strike was added to your account; you can review or appeal it in Settings → Account status.',
  'moderation-restored': 'Your {{noun}}{{named}} was restored by site moderation.',
  'office-hours-booked': '{{name}} booked your office hours for {{startsAt}}.',
  'office-hours-cancelled': '{{name}} cancelled the office-hours booking for {{startsAt}}.',
  'office-hours-confirmed':
    'You are booked with {{name}} on {{startsAt}}. Download the calendar file from the booking page.',
  'onboarding-complete': 'Checklist complete! +{{coins}} coins. Welcome to RMH Studios 🎉',
  'party-cancelled': 'Cancelled: {{name}}',
  'party-invite': '{{name}} invited you to a party',
  'party-starting-now': 'Starting now: {{name}}',
  'party-starting-soon': 'Starting in 15 minutes: {{name}}',
  'party-time-changed': 'Time changed: {{name}}',
  'pile-on': 'A post of yours is getting a burst of replies from people you do not know.',
  'poll-ended-no-votes': 'Your poll ended with no votes',
  'poll-ended-tie': 'Your poll ended in a tie: {{names}} with {{percent}}% each',
  'poll-ended-won': 'Your poll ended: {{names}} won with {{percent}}%',
  'poll-locked': '"{{title}}" is locked in for {{startsAt}}. Open the poll to add it to your calendar.',
  'poll-pick-times': '{{name}} needs you to pick times for "{{title}}".',
  'poll-ranked-ended': 'Your ranked poll ended: {{winner}} won the count',
  'poll-ranked-ended-no-votes': 'Your ranked poll ended with no votes',
  'poll-ranked-voter-ended': 'A ranked poll you voted in ended',
  'poll-ranked-voter-ended-winner': 'A ranked poll you voted in ended: {{winner}} won the count',
  'poll-voter-ended': 'A poll you voted in ended',
  'post-unlocked': '{{name}} unlocked your post for 🪙 {{price}}',
  'ranked-challenge': '{{name}} challenged you to a ranked match',
  'recurring-paused': 'The recurring thread "{{title}}" in {{community}} was paused',
  'redemption-approved': 'Your redemption was approved',
  'redemption-declined': 'Your redemption was declined and your coins were refunded',
  'redemption-fulfilled': 'Your redemption was fulfilled 🎉',
  'referral-active': '{{name}} is now active — you both earned {{coins}} coins!',
  'referral-bonus': 'Referral bonus: +{{coins}} coins for joining through an invite!',
  'referral-request-accepted': 'Your referral request for {{company}} was accepted',
  'referral-request-new': 'New referral request for {{company}}',
  'referral-request-passed': 'Your referral request for {{company}} was passed on',
  'reminder-note': '{{label}} — {{note}}',
  'report-action-taken': 'Your report was reviewed: action taken',
  'report-no-violation': 'Your report was reviewed: no violation found',
  'request-status': 'Your request "{{title}}" is now {{status}}',
  'restriction-lifted': 'The restriction on {{label}} has been lifted.',
  'restriction-permanent': '{{label}} has been permanently restricted on your account. Reason: {{reason}}',
  'restriction-until': '{{label}} has been restricted on your account until {{endsAt}}. Reason: {{reason}}',
  'ride-accepted': '{{driver}} accepted your ride and is on the way.',
  'ride-cancelled-by-driver': 'Your driver cancelled — request a new ride anytime.',
  'ride-cancelled-by-rider': 'The rider cancelled this trip.',
  'ride-complete': 'Your trip is complete. Tap to rate your driver.',
  'ride-requested': 'New {{rideClass}} request: {{pickup}} → {{dropoff}}',
  'ride-started': 'Your trip has started. Enjoy the ride!',
  'ride-tipped': 'Your rider added a {{tip}} tip. Thanks for the great ride!',
  'rival-beat': '{{name}} just beat your best in {{game}}.',
  'rival-passed-many': '{{name}} and {{count}} more rivals just passed your best score.',
  'rival-passed-one-more': '{{name}} and 1 more rival just passed your best score.',
  'scheduled-alt-required': 'Your scheduled post to {{community}} was not published: an image needs a description',
  'scheduled-held': 'Your scheduled post to {{community}} is waiting for a moderator',
  'scheduled-refused': 'Your scheduled post to {{community}} was not published: {{reason}}',
  'series-new-part': 'New part in "{{series}}"',
  'spend-budget-80': 'You have used 80% of your spending budget',
  'streak-continues': 'Your {{days}}-day streak continues if you check in today.',
  'strike-warning':
    'You received a moderation warning: {{reason}}. You can review or appeal it in Settings → Account status.',
  'studio-challenge-won': 'Your flip won "{{title}}"',
  'study-buddy-found-at':
    'Study buddy found: {{name}} will do {{minutes}} minutes of {{subject}} with you at {{startsAt}}.',
  'study-buddy-found-now': 'Study buddy found: {{name}} will do {{minutes}} minutes of {{subject}} with you right now.',
  'study-buddy-nobody-now': 'No study partner for {{subject}} turned up this time. Try again or book a slot.',
  'study-buddy-nobody-slot': 'Nobody else booked your {{subject}} study slot. Try another time.',
  'sweep-restored': '{{count}} posts and replies were restored by site moderation.',
  'sweep-restored-one': '1 post or reply was restored by site moderation.',
  'time-capsule-opened': 'Your time capsule has opened',
  'tip-received': '{{sender}} tipped you 🪙 {{amount}}',
  'tip-received-note': '{{sender}} tipped you 🪙 {{amount}} — “{{note}}”',
  'tournament-checkin-open': 'Check-in is open for {{name}}',
  'tournament-match-awarded': 'The host awarded a match in {{name}}',
  'tournament-match-due-soon': 'Your {{name}} match is due in 12 hours',
  'tournament-match-in-hour': 'Your {{name}} match is in an hour',
  'tournament-removed-no-checkin': 'You were removed from {{name}} because you did not check in',
  'tournament-result-disputed': 'A result was disputed in {{name}}',
  'tournament-result-host-decided': 'The host decided a result in {{name}}',
  'tournament-result-reported': 'A result was reported in {{name}}: confirm or dispute it',
  'tournament-result-settled-late': 'A result in {{name}} was settled: it was not answered in time',
  'tournament-started': '{{name}} has started — check your bracket',
  'tournament-time-agreed': 'A time is agreed for your {{name}} match',
  'tournament-time-proposed': 'Your opponent proposed a time for your {{name}} match',
  'tournament-time-set-by-host': 'The host set a time for your {{name}} match',
  'wager-accepted': 'Your {{game}} challenge was accepted — play now',
  'wager-challenged': "You've been challenged to {{game}} for {{coins}} coins",
  'wager-won': 'You won a wager — {{coins}} coins paid out',
  'watch-market-listing': 'New listing for {{item}}: {{price}} coins',
  'wishlist-daily-shop': "{{item}} is in today's shop",
  'wishlist-price-drop': '{{item}} dropped to {{price}} coins',
  'wishlist-target-met': '{{item}} is at {{price}} coins — within your target price',

  // Sprint 10 notices (docs/autonomous/sprint-10/plan.md §Anchors)
  // s10-04 deck-suggestions
  'deck-suggestions-new': 'New suggestions on {{deck}}',
  'deck-suggestion-accepted': 'Your suggestion to {{deck}} was accepted',
  'deck-suggestion-declined': 'Your suggestion to {{deck}} was not taken: {{reason}}',

  // s10-09 build-issues
  'build-issues-new': 'New issues on {{build}}',
  'build-issue-confirmed': 'Your issue on {{build}} was confirmed: {{issue}}',
  'build-issue-fixed': 'Your issue on {{build}} was fixed in {{version}}: {{issue}}',
  'build-issue-fixed-seen': 'An issue you see too on {{build}} was fixed in {{version}}: {{issue}}',
  'build-issue-wont-fix': 'Your issue on {{build}} will not be fixed: {{issue}}',
  'build-issue-duplicate': 'Your issue on {{build}} was marked as a duplicate: {{issue}}',
  'build-issue-reopened': 'Your issue on {{build}} was reopened: {{issue}}',

  // s10-15 admin-webhooks
  'webhook-admin-disabled': 'An admin turned off your webhook to {{host}}: {{reason}}',

  // s10-16 speedrun-queue
  'speedrun-run-verified': 'Your {{game}} run was verified',
  'speedrun-run-rejected': 'Your {{game}} run was not verified: {{reason}}',

  // s10-17 admin-communities
  'community-delisted': '{{community}} is out of discovery: {{reason}}',

  // Sprint 11 notices (docs/autonomous/sprint-11/plan.md §Anchors)
  // s11-09 read-alongs
  'read-along-part-open': '{{book}}: "{{part}}" is open in {{community}}',

  // s11-10 deck-coeditors
  'deck-editor-invited': '{{name}} invited you to edit {{deck}}',
  'deck-editor-accepted': '{{name}} accepted your invitation to edit {{deck}}',

  // s11-12 type-challenges
  'type-challenge-received': "{{name}} challenged you to beat {{wpm}} WPM on '{{passage}}'",
  'type-challenge-won': "You beat {{name}}'s {{wpm}} WPM on '{{passage}}'",
  'type-challenge-lost': "You lost to {{name}}'s {{wpm}} WPM on '{{passage}}'",
  'type-challenge-draw': "You drew with {{name}} at {{wpm}} WPM on '{{passage}}'",
  'type-challenge-unfinished': "You did not finish the race against {{name}}'s {{wpm}} WPM on '{{passage}}'",
  'type-challenge-forfeited': "{{name}} did not finish your race on '{{passage}}'",

  // s11-13 listing-prices
  'home-price-drop': '{{title}} in {{city}}, {{state}} dropped from ${{was}} to ${{now}}',
} as const;

export type NoticeKey = keyof typeof NOTICE_TEMPLATES;

/** The params each key takes. An `*At` param may be given as a Date; it is stored as an ISO string. */
export interface NoticeParamTypes {
  'achievement-almost': { name: string | number };
  'achievement-halfway': { name: string | number };
  'achievement-unlocked': { name: string | number };
  'achievement-unlocked-coins': { name: string | number; coins: string | number };
  'appeal-accepted': Record<string, never>;
  'appeal-upheld': Record<string, never>;
  'award-received': { target: string | number; award: string | number; emoji: string | number };
  'balatro-invite': { name: string | number };
  'birthday-today': { name: string | number };
  'build-release': { title: string | number; version: string | number };
  'build-unlocked': { name: string | number; price: string | number };
  'card-order-filled': { card: string | number; coins: string | number };
  'card-sold': { card: string | number; coins: string | number };
  'card-trade-accepted': Record<string, never>;
  'card-trade-declined': Record<string, never>;
  'card-trade-offered': Record<string, never>;
  'coins-added': { amount: string | number; reason: string | number };
  'coins-removed': { amount: string | number; reason: string | number };
  'community-ban-lifted': { community: string | number };
  'community-ban-open': { community: string | number };
  'community-ban-open-rule': { community: string | number; rule: string | number };
  'community-ban-until': { community: string | number; endsAt: string | Date };
  'community-ban-until-rule': { community: string | number; endsAt: string | Date; rule: string | number };
  'community-challenge-won': { title: string | number };
  'community-hall-of-fame': { community: string | number };
  'community-join-approved': { community: string | number };
  'community-join-asked': { name: string | number; community: string | number };
  'community-join-declined': { community: string | number };
  'community-pin': { community: string | number };
  'community-post-alert': { author: string | number; community: string | number };
  'community-post-alerts-collapsed': { community: string | number };
  'community-timeout-lifted': { community: string | number };
  'community-timeout-open': { community: string | number };
  'community-timeout-open-rule': { community: string | number; rule: string | number };
  'community-timeout-until': { community: string | number; endsAt: string | Date };
  'community-timeout-until-rule': { community: string | number; endsAt: string | Date; rule: string | number };
  'creator-supporter': { tier: string | number };
  'deletion-drafts-waited': { count: string | number };
  'deletion-drafts-waited-one': Record<string, never>;
  'emoji-pack-approved': { pack: string | number };
  'emoji-pack-removed': { pack: string | number };
  'emoji-pack-removed-note': { pack: string | number; note: string | number };
  'event-canceled': { title: string | number };
  'event-cohost-accepted': { name: string | number; title: string | number };
  'event-cohost-invited': { name: string | number; title: string | number };
  'event-host-rotation': { title: string | number };
  'event-occurrence-moved': { title: string | number; occurrenceAt: string | Date; startsAt: string | Date };
  'event-occurrence-restored': { title: string | number; occurrenceAt: string | Date };
  'event-occurrence-skipped': { title: string | number; occurrenceAt: string | Date };
  'event-starts-soon': { title: string | number };
  'event-starts-tomorrow': { title: string | number };
  'event-waitlist-promoted': { title: string | number };
  'exchange-drawn': { title: string | number };
  'exchange-drawn-mixtape': { title: string | number };
  'exchange-undrawable': { title: string | number; min: string | number };
  'feedback-replied': Record<string, never>;
  'first-week-complete': { coins: string | number };
  'flashcards-due': { count: string | number };
  'flashcards-due-one': Record<string, never>;
  'friendly-challenge': { name: string | number };
  'game-guide-new': { game: string | number; title: string | number };
  'game-updated': { game: string | number; version: string | number; title: string | number };
  'gift-coins': { amount: string | number };
  'gift-coins-note': { amount: string | number; note: string | number };
  'gift-refunded': { item: string | number };
  'gift-waiting': Record<string, never>;
  'goal-delivered': Record<string, never>;
  'goal-funded': Record<string, never>;
  'goal-refunded': Record<string, never>;
  'group-added': { actor: string | number; group: string | number };
  'handover-accepted': { name: string | number; community: string | number };
  'handover-declined': { name: string | number; community: string | number };
  'handover-offered': { name: string | number; community: string | number };
  'handover-owner': { community: string | number };
  'handover-withdrawn': { name: string | number; community: string | number };
  'home-watch-rental': {
    label: string | number;
    title: string | number;
    price: string | number;
    city: string | number;
    state: string | number;
  };
  'home-watch-sale': {
    label: string | number;
    title: string | number;
    price: string | number;
    city: string | number;
    state: string | number;
  };
  'jam-feedback-many': { count: string | number; jam: string | number };
  'jam-feedback-one': { jam: string | number };
  'jam-team-added': { name: string | number; jam: string | number };
  'jam-team-joined': { name: string | number; jam: string | number };
  'jam-theme-revealed': { jam: string | number; theme: string | number };
  'keyword-alert': { keyword: string | number; text: string | number };
  'kudos-received': { reason: string | number };
  'level-reached': { level: string | number };
  'member-joined': { name: string | number };
  'membership-gifted': { name: string | number; months: string | number; tier: string | number };
  'membership-granted': { months: string | number; tier: string | number };
  'medschools-qa-limit-approved': Record<string, never>;
  'medschools-qa-limit-approved-note': { note: string | number };
  'medschools-qa-limit-declined': Record<string, never>;
  'medschools-qa-limit-declined-note': { note: string | number };
  'medschools-qa-limit-revoked': Record<string, never>;
  'medschools-qa-limit-revoked-note': { note: string | number };
  'memory-one-year': { text: string | number };
  'memory-years': { years: string | number; text: string | number };
  'message-request-accepted': Record<string, never>;
  'moderation-edited': { noun: string | number; named: string | number; reason: string | number };
  'moderation-edited-strike': { noun: string | number; named: string | number; reason: string | number };
  'moderation-removed': { noun: string | number; named: string | number; reason: string | number };
  'moderation-removed-strike': { noun: string | number; named: string | number; reason: string | number };
  'moderation-restored': { noun: string | number; named: string | number };
  'office-hours-booked': { name: string | number; startsAt: string | Date };
  'office-hours-cancelled': { name: string | number; startsAt: string | Date };
  'office-hours-confirmed': { name: string | number; startsAt: string | Date };
  'onboarding-complete': { coins: string | number };
  'party-cancelled': { name: string | number };
  'party-invite': { name: string | number };
  'party-starting-now': { name: string | number };
  'party-starting-soon': { name: string | number };
  'party-time-changed': { name: string | number };
  'pile-on': Record<string, never>;
  'poll-ended-no-votes': Record<string, never>;
  'poll-ended-tie': { names: string | number; percent: string | number };
  'poll-ended-won': { names: string | number; percent: string | number };
  'poll-locked': { title: string | number; startsAt: string | Date };
  'poll-pick-times': { name: string | number; title: string | number };
  'poll-ranked-ended': { winner: string | number };
  'poll-ranked-ended-no-votes': Record<string, never>;
  'poll-ranked-voter-ended': Record<string, never>;
  'poll-ranked-voter-ended-winner': { winner: string | number };
  'poll-voter-ended': Record<string, never>;
  'post-unlocked': { name: string | number; price: string | number };
  'ranked-challenge': { name: string | number };
  'recurring-paused': { title: string | number; community: string | number };
  'redemption-approved': Record<string, never>;
  'redemption-declined': Record<string, never>;
  'redemption-fulfilled': Record<string, never>;
  'referral-active': { name: string | number; coins: string | number };
  'referral-bonus': { coins: string | number };
  'referral-request-accepted': { company: string | number };
  'referral-request-new': { company: string | number };
  'referral-request-passed': { company: string | number };
  'reminder-note': { label: string | number; note: string | number };
  'report-action-taken': Record<string, never>;
  'report-no-violation': Record<string, never>;
  'request-status': { title: string | number; status: string | number };
  'restriction-lifted': { label: string | number };
  'restriction-permanent': { label: string | number; reason: string | number };
  'restriction-until': { label: string | number; endsAt: string | Date; reason: string | number };
  'ride-accepted': { driver: string | number };
  'ride-cancelled-by-driver': Record<string, never>;
  'ride-cancelled-by-rider': Record<string, never>;
  'ride-complete': Record<string, never>;
  'ride-requested': { rideClass: string | number; pickup: string | number; dropoff: string | number };
  'ride-started': Record<string, never>;
  'ride-tipped': { tip: string | number };
  'rival-beat': { name: string | number; game: string | number };
  'rival-passed-many': { name: string | number; count: string | number };
  'rival-passed-one-more': { name: string | number };
  'scheduled-alt-required': { community: string | number };
  'scheduled-held': { community: string | number };
  'scheduled-refused': { community: string | number; reason: string | number };
  'series-new-part': { series: string | number };
  'spend-budget-80': Record<string, never>;
  'streak-continues': { days: string | number };
  'strike-warning': { reason: string | number };
  'studio-challenge-won': { title: string | number };
  'study-buddy-found-at': {
    name: string | number;
    minutes: string | number;
    subject: string | number;
    startsAt: string | Date;
  };
  'study-buddy-found-now': { name: string | number; minutes: string | number; subject: string | number };
  'study-buddy-nobody-now': { subject: string | number };
  'study-buddy-nobody-slot': { subject: string | number };
  'sweep-restored': { count: string | number };
  'sweep-restored-one': Record<string, never>;
  'time-capsule-opened': Record<string, never>;
  'tip-received': { sender: string | number; amount: string | number };
  'tip-received-note': { sender: string | number; amount: string | number; note: string | number };
  'tournament-checkin-open': { name: string | number };
  'tournament-match-awarded': { name: string | number };
  'tournament-match-due-soon': { name: string | number };
  'tournament-match-in-hour': { name: string | number };
  'tournament-removed-no-checkin': { name: string | number };
  'tournament-result-disputed': { name: string | number };
  'tournament-result-host-decided': { name: string | number };
  'tournament-result-reported': { name: string | number };
  'tournament-result-settled-late': { name: string | number };
  'tournament-started': { name: string | number };
  'tournament-time-agreed': { name: string | number };
  'tournament-time-proposed': { name: string | number };
  'tournament-time-set-by-host': { name: string | number };
  'wager-accepted': { game: string | number };
  'wager-challenged': { game: string | number; coins: string | number };
  'wager-won': { coins: string | number };
  'watch-market-listing': { item: string | number; price: string | number };
  'wishlist-daily-shop': { item: string | number };
  'wishlist-price-drop': { item: string | number; price: string | number };
  'wishlist-target-met': { item: string | number; price: string | number };

  // Sprint 10 notices (docs/autonomous/sprint-10/plan.md §Anchors)
  // s10-04 deck-suggestions
  'deck-suggestions-new': { deck: string | number };
  'deck-suggestion-accepted': { deck: string | number };
  'deck-suggestion-declined': { deck: string | number; reason: string | number };

  // s10-09 build-issues
  'build-issues-new': { build: string | number };
  'build-issue-confirmed': { build: string | number; issue: string | number };
  'build-issue-fixed': { build: string | number; version: string | number; issue: string | number };
  'build-issue-fixed-seen': { build: string | number; version: string | number; issue: string | number };
  'build-issue-wont-fix': { build: string | number; issue: string | number };
  'build-issue-duplicate': { build: string | number; issue: string | number };
  'build-issue-reopened': { build: string | number; issue: string | number };

  // s10-15 admin-webhooks
  'webhook-admin-disabled': { host: string | number; reason: string | number };

  // s10-16 speedrun-queue
  'speedrun-run-verified': { game: string | number };
  'speedrun-run-rejected': { game: string | number; reason: string | number };

  // s10-17 admin-communities
  'community-delisted': { community: string | number; reason: string | number };

  // Sprint 11 notices (docs/autonomous/sprint-11/plan.md §Anchors)
  // s11-09 read-alongs
  'read-along-part-open': { book: string | number; part: string | number; community: string | number };

  // s11-10 deck-coeditors
  'deck-editor-invited': { name: string | number; deck: string | number };
  'deck-editor-accepted': { name: string | number; deck: string | number };

  // s11-12 type-challenges
  'type-challenge-received': { name: string | number; wpm: string | number; passage: string | number };
  'type-challenge-won': { name: string | number; wpm: string | number; passage: string | number };
  'type-challenge-lost': { name: string | number; wpm: string | number; passage: string | number };
  'type-challenge-draw': { name: string | number; wpm: string | number; passage: string | number };
  'type-challenge-unfinished': { name: string | number; wpm: string | number; passage: string | number };
  'type-challenge-forfeited': { name: string | number; passage: string | number };

  // s11-13 listing-prices
  'home-price-drop': {
    title: string | number;
    city: string | number;
    state: string | number;
    was: string | number;
    now: string | number;
  };
}

export type NoticeParamValue = string | number;
export type NoticeParams = Record<string, NoticeParamValue>;

/** What a converted emitter hands to `createNotification` / `dispatch` as its `preview`. */
export interface NoticePreview<K extends NoticeKey = NoticeKey> {
  key: K;
  /** Stored as JSON beside the key. Instants are ISO strings under `*At`. */
  params: NoticeParams;
  /** The English sentence: the stored `preview`, and what push and e-mail send. */
  fallback: string;
}

/** The longest key the `Notification.previewKey` column holds. */
export const NOTICE_KEY_MAX = 64;

export function isNoticeKey(key: unknown): key is NoticeKey {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(NOTICE_TEMPLATES, key);
}

/** The `{{name}}` slots of a template, in order of first use. */
export function noticeParamNames(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(/\{\{(\w+)\}\}/g)) if (m[1] && !out.includes(m[1])) out.push(m[1]);
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1 Dec 2026, 14:30 UTC": the English a push or e-mail carries for an instant (the server has no reader locale). */
export function formatNoticeInstantUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** Fill a template's slots. `formatAt` writes the `*At` instants (the fallback uses UTC; the inbox the reader's locale). */
export function fillNotice(
  template: string,
  params: Record<string, unknown>,
  formatAt: (iso: string) => string = formatNoticeInstantUtc,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => {
    const v = params[name];
    if (v === undefined || v === null) return '';
    return name.endsWith('At') ? formatAt(String(v)) : String(v);
  });
}

function storable(params: Record<string, unknown>): NoticeParams {
  const out: NoticeParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === 'number' || typeof v === 'string') out[k] = v;
    else if (v !== undefined && v !== null) out[k] = String(v);
  }
  return out;
}

/**
 * Build the key-based preview of a notice: `notice('community-timeout', { community, endsAt })`. The literal key keeps
 * the params honest at compile time.
 */
export function notice<K extends NoticeKey>(key: K, params: NoticeParamTypes[K]): NoticePreview<K> {
  const stored = storable(params);
  return { key, params: stored, fallback: fillNotice(NOTICE_TEMPLATES[key], stored) };
}

/** A `preview` as the plain English a push or e-mail carries. */
export function noticeFallbackText(preview: string | NoticePreview | null | undefined): string | null {
  if (preview === null || preview === undefined) return null;
  return typeof preview === 'string' ? preview : preview.fallback;
}

/** The three columns a direct `prisma.notification.create` writes for a notice. */
export function noticeColumns(preview: NoticePreview): {
  preview: string;
  previewKey: string;
  previewParams: NoticeParams;
} {
  return { preview: preview.fallback.slice(0, 280), previewKey: preview.key, previewParams: preview.params };
}
