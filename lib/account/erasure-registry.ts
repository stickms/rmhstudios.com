/**
 * Erasure registry: what account deletion does with every model that has a relation to `User`.
 *
 * Data only, no imports, client-safe. The coverage test (`lib/account/__tests__/erasure-coverage.test.ts`) parses
 * `prisma/schema/**` and fails, naming the model, when a model with a `User` relation has no entry here, when an
 * entry has no model, or when an entry says something `anonymizeAccount` does not do. `docs/account-deletion.md`
 * lists the same entries in four groups and is checked against this file.
 *
 * `anonymizeAccount` anonymises the `User` row in place, so `onDelete: Cascade` from `User` never fires: a model
 * is erased only when an operation in `deletion.server.ts` says so.
 */

export type ErasureDecision = 'erase' | 'deidentify' | 'cascade' | 'keep' | 'owner' | 'todo';

export interface ErasureEntry {
  decision: ErasureDecision;
  /** One line a reviewer can check. */
  reason: string;
  /** `erase` only: the rows erased when it is not all of them. */
  scope?: string;
  /** `cascade` only: the `erase` model whose deletion removes these rows through a database cascade. */
  parent?: string;
}

/**
 * The most `todo` entries the registry may hold. It may fall (erase one, or classify it, and lower this number in
 * the same change) and must never rise: a new model lands classified, not as `todo`.
 */
export const TODO_CEILING = 4;

/**
 * Entries by decision:
 * - `erase`: deleted in `anonymizeAccount` (a `deleteMany` or `delete` on the model);
 * - `deidentify`: kept, the member reference replaced or nulled (an `updateMany` or `update`);
 * - `cascade`: deleted by the database when its `parent` (an `erase` model) goes;
 * - `keep`: kept on purpose (ledger, audit trail, another member's record, published content under "Deleted user");
 * - `owner`: an open owner decision (follows, game reviews, guides, jam entries, public decks), left as it is;
 * - `todo`: not handled yet, with the reason it was deferred.
 */
export const ERASURE_REGISTRY: Record<string, ErasureEntry> = {
  Account: {
    decision: 'erase',
    reason: 'Every way to authenticate as the account is destroyed first, so a tombstone can never sign in.',
  },
  AchievementTip: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  AchievementTipVote: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  AchievementTrack: {
    decision: 'erase',
    reason:
      "The member's trading cards, drop ledger, badges, pinned achievements, library collections and showcase; the cascade never fires.",
  },
  Activity: {
    decision: 'erase',
    reason:
      'Derived "X did Y" rows that followers see; the content they point at follows its own rule. `meta` goes with the row.',
  },
  AdminAuditLog: { decision: 'keep', reason: 'Rule 4: admin audit trail.' },
  AdventClaim: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  AiPersona: {
    decision: 'erase',
    reason:
      "Only private personas (isPublic = false) that no other member has chatted with are the member's tool and are erased; their messages go by the cascade. Public personas stay under the tombstone as published content others chat with (chatCount). A persona made private after being public, with other members' chats, is kept so their chats survive (it is unreachable: its owner is a tombstone). The generated avatar object stays in storage (no personal data; classified not-recorded).",
  },
  AiPersonaMessage: {
    decision: 'erase',
    reason: "The member's side of persona chats, on any persona (rows with the member as userId).",
  },
  AiUsage: {
    decision: 'keep',
    reason:
      "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. A row holds the user id, task, prompt id, token counts, cost and time, never text: the RMH Med Schools Q&A (`medschools-qa`) writes no question or answer anywhere else either (`features/medschools/CLAUDE.md`), so its rows are the only trace and carry nothing to erase.",
  },
  AltairCoopProfile: {
    decision: 'erase',
    reason:
      'The co-op board orders this table (`totalCoopWins`, `totalRevivesGiven` indexes) at read time; the row going takes the member off it.',
  },
  AltairMatchPlayer: {
    decision: 'deidentify',
    reason:
      'A row in a shared co-op match (up to four players): `userId` is required so the row stays and the copied `userName` becomes "Deleted user"; no board lists it by name.',
  },
  AltairMetaProgress: {
    decision: 'erase',
    reason: 'Solo meta progress (in-game coins only; the site ledger is separate); no board.',
  },
  AltairPlayer: {
    decision: 'erase',
    reason:
      'Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy).',
  },
  AltairSoloRun: {
    decision: 'erase',
    reason: 'Solo runs (in-game coins only); no board reads them by member.',
  },
  AppearancePreference: { decision: 'erase', reason: 'Rule 1: settings only the member sees.' },
  ArcadeRival: {
    decision: 'erase',
    reason: "Both directions: the member's own rivals, and rows naming them as a rival (`rivalUserId` is indexed).",
  },
  ArcadeSeedRun: {
    decision: 'erase',
    reason:
      'Daily, seed and basket boards read these rows in `board()` (`lib/arcade/runs.server.ts`), cached 30 s per seed key; the TTL is the drop.',
  },
  AvailabilityPoll: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  AvailabilityPollInvitee: {
    decision: 'erase',
    reason:
      "The member's invitation rows on a poll; their answers are `AvailabilityPollResponse`, kept for the poll's integrity.",
  },
  AvailabilityPollResponse: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  AwayMessage: { decision: 'erase', reason: "The away message and its reply markers are the member's own." },
  BlogAnnouncementSeen: {
    decision: 'erase',
    reason: "The member's seen markers.",
  },
  BlogComment: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  BotQueuedComment: {
    decision: 'keep',
    reason: "Rows of a bot persona (botId), not a member's data; bots are never deleted through member deletion.",
  },
  BotQueuedPost: {
    decision: 'keep',
    reason: "Rows of a bot persona (botId), not a member's data; bots are never deleted through member deletion.",
  },
  BotReaction: {
    decision: 'keep',
    reason: "Rows of a bot persona (botId), not a member's data; bots are never deleted through member deletion.",
  },
  BracketPick: {
    decision: 'erase',
    reason:
      "Rule 1: the member's own pick'em picks; standings are computed from picks when read, so nobody else's points change.",
  },
  BuildComment: {
    decision: 'deidentify',
    reason:
      'Published build comments stay under "Deleted user" (as post comments do); only where the member hid comments is the reference (hiddenById) nulled.',
  },
  BuildGrant: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  BuildIssue: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: a published bug report on a build stays under "Deleted user" (as build comments do; the reporter row is anonymised in place, so it keeps no name); the creator\'s status and the other members\' "me too" marks are theirs.',
  },
  BuildIssueVote: {
    decision: 'erase',
    reason:
      'The member\'s "I see this too" marks are their own: deleted, and each issue\'s voteCount is decremented in the same transaction.',
  },
  BuildLike: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  BuildUnlock: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  BuildView: {
    decision: 'deidentify',
    reason: "A first view is a count on the creator's insights; the row stays without its viewer.",
  },
  BulkOperation: {
    decision: 'erase',
    reason: 'Bulk clean-up operations (sprint 07 bulk-durable); a run in progress stops at its next chunk.',
  },
  CalcNotebook: { decision: 'erase', reason: "Rule 1: the member's own calculator notebooks." },
  CalendarFeed: {
    decision: 'erase',
    reason: 'The private calendar URL token is a credential that calendar apps send.',
  },
  Call: {
    decision: 'keep',
    reason:
      'Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone.',
  },
  CallMute: {
    decision: 'erase',
    reason:
      "Both directions: the member's own mutes, and rows naming them as the muted user. `mutedUserId` is unindexed; the small table is scanned once per deletion.",
  },
  CanvasCooldown: {
    decision: 'erase',
    reason: 'A placement timer; no board.',
  },
  CanvasPlacement: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  CardBuyOrder: {
    decision: 'erase',
    reason: 'Open buy orders only; nothing was held for them, so nothing is refunded.',
    scope: 'status: OPEN rows only',
  },
  CardDrop: {
    decision: 'erase',
    reason:
      "The member's trading cards, drop ledger, badges, pinned achievements, library collections and showcase; the cascade never fires.",
  },
  CardTrade: {
    decision: 'erase',
    reason: 'Pending trade offers in either direction; finished trades stay as anonymous history.',
    scope: 'status: PENDING rows only',
  },
  Chart: { decision: 'keep', reason: 'Rule 3: published content others use stays under "Deleted user".' },
  ChartPack: { decision: 'keep', reason: 'Rule 3: published content others use stays under "Deleted user".' },
  ChartReview: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  Chat: {
    decision: 'erase',
    reason:
      'A message request of theirs still waiting has its chat deleted so its one message cannot surface as "Deleted user".',
    scope: 'chats of pending or draft message requests only',
  },
  ChatFolder: {
    decision: 'erase',
    reason: 'Inbox arrangement (folder items go by cascade).',
  },
  ChatInvite: { decision: 'erase', reason: 'Group invite links the member created.' },
  ChatMember: {
    decision: 'keep',
    reason:
      'Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone.',
  },
  ChatMention: { decision: 'erase', reason: 'Group mentions that name the member (sprint 07 group-mentions).' },
  ChatMessage: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  ChatMessageReaction: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  ChatPin: {
    decision: 'keep',
    reason:
      'Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone.',
  },
  ChatPollVote: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  CloseFriend: {
    decision: 'erase',
    reason:
      "Both directions: the member's own list (ownerId) and their presence in others' lists (memberId); a tombstone in someone's circle widens and narrows nothing.",
  },
  CoinAdjustment: {
    decision: 'deidentify',
    reason: "Adjustments are financial records; the admin's free-text note about the member goes.",
  },
  CoinStake: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  CoinTransaction: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  Community: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  CommunityAnnouncement: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  CommunityBan: {
    decision: 'erase',
    reason: 'Sanctions about the member are deleted; where they were the moderator the reference is nulled.',
  },
  CommunityCensusParticipant: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  CommunityChallengeEntry: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  CommunityChallengeVote: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  CommunityContributorScore: {
    decision: 'erase',
    reason:
      "Rule 1: the member's row on contributor lists; each row is independent, so other members' scores are unaffected.",
  },
  CommunityGoalPledge: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  CommunityHandover: {
    decision: 'erase',
    reason: 'Open ownership offers to or from the member; a decided offer only names the tombstone.',
    scope: 'status: pending rows only',
  },
  CommunityInvite: {
    decision: 'erase',
    reason: 'Invite links the member created grant entry without approval and must stop working.',
  },
  CommunityJoinRequest: {
    decision: 'erase',
    reason:
      "Pending requests are withdrawn (they can never be honoured). Decided and removed rows stay as the moderators' record and cooldown marker, with the free-text message set to null.",
  },
  CommunityMember: {
    decision: 'deidentify',
    reason: 'Membership survives an anonymised account, so post alerts are reset to off.',
  },
  CommunityModItem: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  CommunityRecurringThread: {
    decision: 'deidentify',
    reason:
      'Thread templates the member authored are handed to the community owner and paused (nothing posts under their name until a moderator saves one); when the member owned the community, or it has no owner, they are deleted.',
  },
  CommunityOnboardingAnswer: {
    decision: 'erase',
    reason: "The member's answers, seen only by the community's moderators.",
  },
  CommunityPinnedPost: {
    decision: 'keep',
    reason: "Rule 2: a community's arrangement of its own content; it never shows who pinned.",
  },
  CommunityPageRevision: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  ComputeGrant: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  ConnectionsGrid: { decision: 'keep', reason: 'Rule 3: published content others use stays under "Deleted user".' },
  ConnectionsPlay: {
    decision: 'erase',
    reason:
      "The member's own plays; no board. No children: it is the child of `ConnectionsGrid`, whose anonymous play and rating tallies stay (counter rule).",
  },
  ContentAward: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  ContentReport: {
    decision: 'deidentify',
    reason: "The report stays as the moderators' record; the reporter's free-text details are nulled.",
  },
  ContextNote: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  ContextNoteRating: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  ConversationPref: { decision: 'erase', reason: 'Per-conversation notification choices (muted posts and chats).' },
  CreatorMembership: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  CreatorTier: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  CustomFeed: {
    decision: 'erase',
    reason:
      "Only feeds where isPublic is false and visibility is not PUBLIC (private and by-link): the member's tools, with members and subscribers going by the cascade. Public feeds (either flag) have subscribers and stay under the tombstone as published content.",
  },
  CustomFeedMember: {
    decision: 'keep',
    reason:
      'Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone.',
  },
  CustomFeedSubscription: {
    decision: 'erase',
    reason:
      'Subscriptions to things (a feed, a series, a community, build or market watch), not the social graph the `Follow` owner decision covers; `CustomFeed.subscriberCount` is decremented (floored) in the same transaction.',
  },
  DailyPuzzleScore: {
    decision: 'erase',
    reason:
      "The daily leaderboard and results endpoints read at request time; the member's cached stats (`dailyStatsKey`) are dropped after the transaction.",
  },
  DailyWheelSpin: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  DeckFolder: { decision: 'erase', reason: 'Private deck folders (sprint 07 deck-folders); decks stay, folderless.' },
  DeckSuggestion: {
    decision: 'erase',
    scope:
      "rows where the member is the suggester (suggesterId); suggestions to the member's own decks stay with the decks",
    reason:
      "The member's proposed corrections to other members' cards are their own writing, private to them and the deck's author: erased, so open ones leave the author's list.",
  },
  DeletionHold: {
    decision: 'erase',
    reason:
      'The ids of the keys and webhooks a deletion request paused (sprint 09 deletion-pause); the hold has no use once the account is anonymised.',
  },
  DevRecipe: {
    decision: 'erase',
    reason: "The member's automation recipes (webhook and DM actions).",
  },
  DeveloperApiKey: {
    decision: 'erase',
    reason: 'Hashed developer API keys; deleting a key also cascades its usage, refusal and idempotency rows.',
  },
  DirectMessageHide: {
    decision: 'erase',
    reason: "Inbox arrangement: the member's hidden messages.",
  },
  DiscordWatchAlert: {
    decision: 'erase',
    reason: "The member's alert subscriptions.",
  },
  DoctrineAccessLog: {
    decision: 'keep',
    reason: 'Rule 4: access and incident logs are a security and moderation record.',
  },
  DoctrineIncidentReport: {
    decision: 'keep',
    reason: 'Rule 4: access and incident logs are a security and moderation record.',
  },
  DoctrinePuzzleReplay: {
    decision: 'erase',
    reason: "Rule 1: the member's private replays of their own puzzle runs.",
  },
  DoctrinePuzzleSubmission: {
    decision: 'erase',
    reason:
      "Rule 1: the member's per-puzzle results; the puzzle keeps no solve counter, so nothing is left to correct.",
  },
  DoctrineReaction: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  DoctrineRecruitmentCode: { decision: 'erase', reason: 'Recruitment codes the member issued (recruiterId).' },
  DoctrineReputation: {
    decision: 'erase',
    reason:
      "Rule 1: the member's Doctrine reputation (totalXp is what the board reads); the ledger rows go with it by the database cascade.",
  },
  DreamRiftCoopRun: {
    decision: 'deidentify',
    reason: 'A co-op run loses its host (hostUserId nulled); the run stays for its other players.',
  },
  DreamRiftPlayer: {
    decision: 'erase',
    reason:
      'Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy).',
  },
  ElectionLeague: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  ElectionLeagueMember: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  ElectionRoom: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  EloRating: {
    decision: 'erase',
    reason:
      "Rule 1: the member's ratings on ranked boards; opponents' ratings are not recomputed (their gains and losses happened).",
  },
  EmailCampaign: { decision: 'keep', reason: "Rule 4: an admin's campaign record." },
  EmailCampaignRecipient: {
    decision: 'deidentify',
    reason:
      "The row stays as the campaign's delivery record; queued mail (pending or claimed) is set to skipped so no later send picks it up.",
  },
  EmailDelivery: { decision: 'keep', reason: 'Rule 4: delivery audit for mail already sent.' },
  EmojiPack: { decision: 'keep', reason: 'Rule 3: published content others use stays under "Deleted user".' },
  EmojiPackSubscription: {
    decision: 'erase',
    reason: "The member's subscription; EmojiPack.subscriberCount is an anonymous tally and is left.",
  },
  Event: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  EventCohost: { decision: 'erase', reason: "The member's co-host rows and every row on events they host." },
  ExperimentExposure: {
    decision: 'erase',
    reason: 'Analytics exposure tied to the member; experiment counts computed at read drop by one, accepted.',
  },
  FeatureRequest: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  FeatureRequestVote: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  FeatureRestriction: { decision: 'keep', reason: 'Rule 4: a moderation action about the member.' },
  FeedAnnouncement: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  FeedAnnouncementPollVote: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  FeedSignal: {
    decision: 'erase',
    reason:
      "The member's own rows (userId). Rows naming the member as a less_author target are other members' tuning: they name an id that now reads Deleted user, change nothing anyone sees, and have no targetId index, so they are kept.",
  },
  Feedback: {
    decision: 'erase',
    reason: "The member's feedback is deleted; rows they handled as an admin are unlinked.",
  },
  FlashcardDeck: {
    decision: 'owner',
    reason:
      'Open owner decision: public decks of a deleted member. Today decks stay and only their folder is cleared; private decks (cards, reviews, clones) are a candidate for a later change.',
  },
  FlashcardReminder: { decision: 'erase', reason: "The member's own study reminder." },
  FlashcardReview: { decision: 'erase', reason: 'Private study history and SM-2 state.' },
  FlashcardReviewLog: { decision: 'erase', reason: 'Private study history and SM-2 state.' },
  FlashcardTestResult: {
    decision: 'erase',
    reason: "The member's practice-test results.",
  },
  Follow: {
    decision: 'owner',
    reason:
      "Open owner decision: a deleted member's follows (sprint 05 README). Rows stay today; followEvent history is handled separately.",
  },
  FortuneCookie: {
    decision: 'erase',
    reason:
      "The text is the member's own words and nothing names its author; if today's fortune is theirs the next approved one replaces it after the 60 s cache.",
  },
  FriendlyChallenge: {
    decision: 'keep',
    reason:
      'Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone.',
  },
  GabrielsHornPlayer: {
    decision: 'erase',
    reason:
      'Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy).',
  },
  GabrielsHornTableRead: {
    decision: 'erase',
    reason: "The member's own tells statistics; no board.",
  },
  GameAssistPreference: { decision: 'erase', reason: 'The cross-game assist preference (sprint 07 game-assists).' },
  GameBadge: {
    decision: 'erase',
    reason:
      "The member's trading cards, drop ledger, badges, pinned achievements, library collections and showcase; the cascade never fires.",
  },
  GameCollectionItem: {
    decision: 'erase',
    reason:
      "The member's trading cards, drop ledger, badges, pinned achievements, library collections and showcase; the cascade never fires.",
  },
  GameFollow: { decision: 'erase', reason: 'Games the member follows would keep notifying the erased account.' },
  GameGuide: {
    decision: 'owner',
    reason: "Open owner decision: a deleted member's guides (sprint 05 README); rows untouched.",
  },
  GameJam: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  GameJamEntry: {
    decision: 'owner',
    reason: "Open owner decision: a deleted member's jam entries (sprint 05 README); entries stay.",
  },
  GameJamFeedback: { decision: 'erase', reason: 'Feedback the member wrote on jam entries.' },
  GameJamRating: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  GameJamTeamMember: { decision: 'erase', reason: "The member's team rows and pending invitations on their entries." },
  GameJamThemeVote: { decision: 'erase', reason: "The member's theme votes (sprint 07 jam-themes)." },
  GamePersonalBest: { decision: 'erase', reason: "The member's own record history." },
  GamePlayStatus: {
    decision: 'erase',
    reason: "The member's own play statuses; counts by status are computed at read, no board.",
  },
  GamePlaytime: {
    decision: 'erase',
    reason: 'Per-title playtime would keep a tombstone in "Most played by" with its hours.',
  },
  GamePlaytimeDay: {
    decision: 'erase',
    reason: 'Per-title playtime would keep a tombstone in "Most played by" with its hours.',
  },
  GameProfileShowcase: {
    decision: 'erase',
    reason:
      "The member's trading cards, drop ledger, badges, pinned achievements, library collections and showcase; the cascade never fires.",
  },
  GameReplay: {
    decision: 'erase',
    reason: 'Saved replays, except the proofs behind speedrun entries, which stay as board history.',
    scope: 'rows not backing a speedrun entry',
  },
  GameReview: {
    decision: 'owner',
    reason: "Open owner decision: a deleted member's game reviews (sprint 05 README); rows untouched.",
  },
  GameReviewVote: {
    decision: 'owner',
    reason: 'Votes on reviews follow the open game-reviews decision; rows untouched.',
  },
  GameSave: { decision: 'erase', reason: 'Cloud saves and their version history: private progress.' },
  GameSaveSnapshot: { decision: 'erase', reason: 'Cloud saves and their version history: private progress.' },
  GameStat: {
    decision: 'erase',
    reason:
      'Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy).',
  },
  GameThread: {
    decision: 'erase',
    reason: "Community Hub discussions: replies, then threads (with everyone's replies).",
  },
  GameThreadPost: {
    decision: 'erase',
    reason: "Community Hub discussions: replies, then threads (with everyone's replies).",
  },
  GemEntry: { decision: 'erase', reason: 'Gem balance and entries.' },
  GiftExchange: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  GiftExchangeMember: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  GiftMembership: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  GlobeSetPlayer: {
    decision: 'erase',
    reason:
      'Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy).',
  },
  GlossaryTerm: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  GroupCall: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  GroupCallMessage: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  GroupCallParticipant: {
    decision: 'keep',
    reason:
      'Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone.',
  },
  GuestbookEntry: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  HandleChange: {
    decision: 'erase',
    reason:
      'Rows past the 30-day reclaim window go with the account; newer ones stay so the released handle is still protected, and a daily job erases them once they pass it. "Previously known as" is never shown for a deleted profile.',
    scope: 'Rows older than the reclaim window at deletion; the rest by the daily job',
  },
  HeldNotification: { decision: 'erase', reason: 'Rule 1: notifications held for the member by quiet hours.' },
  HistoryEntry: { decision: 'erase', reason: "Rule 1: the member's own browsing history." },
  HomeFavorite: {
    decision: 'erase',
    reason: "The member's saved homes.",
  },
  HomeListing: {
    decision: 'erase',
    reason: "The member's listings (inquiries and favourites cascade from the listing).",
  },
  HomeRoommateProfile: {
    decision: 'erase',
    reason: "The member's roommate profile.",
  },
  HomeWatch: {
    decision: 'erase',
    reason: "The member's saved home searches.",
  },
  HuntProgress: {
    decision: 'erase',
    reason: "The hunt's finish board orders `durationMs` at read; the row going takes the member off it.",
  },
  KaikaiDebtEntry: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  KeyboardPreference: { decision: 'erase', reason: 'Rule 1: settings only the member sees.' },
  KeywordAlertHit: { decision: 'erase', reason: "Rule 1: the member's own keyword-alert hits." },
  Kudos: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  LadderAiTask: {
    decision: 'erase',
    reason: 'Nullable resume relation: tasks that carry only a job id are not reached by the resume cascade.',
  },
  LadderAlert: {
    decision: 'erase',
    reason:
      'Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes.',
  },
  LadderAlertEvent: {
    decision: 'erase',
    reason:
      'Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes.',
  },
  LadderAnswerBank: {
    decision: 'erase',
    reason:
      'Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes.',
  },
  LadderApplication: {
    decision: 'erase',
    reason:
      'Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes.',
  },
  LadderApplicationEvent: {
    decision: 'cascade',
    reason: 'Timeline rows of an application, deleted by the database with the application.',
    parent: 'LadderApplication',
  },
  LadderInterviewReport: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  LadderJobAction: {
    decision: 'erase',
    reason:
      'Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes.',
  },
  LadderJobMatch: {
    decision: 'erase',
    reason:
      'Explicit delete by userId (not `cascade`: the coverage test needs a direct cascade relation to an erase parent). The database cascade also fires when the resume goes.',
  },
  LadderKeyword: {
    decision: 'erase',
    reason:
      'Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes.',
  },
  LadderOffer: {
    decision: 'erase',
    reason:
      'Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes.',
  },
  LadderProductEvent: {
    decision: 'erase',
    reason:
      'Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes.',
  },
  LadderReferralOffer: {
    decision: 'erase',
    reason:
      "The member's offers (company, roles, note). Requests other members sent to them go by the database cascade, the one place rows another member wrote are removed: a request to a deleted offer can never be answered and would keep the member's company beside it.",
  },
  LadderReferralRequest: {
    decision: 'erase',
    reason: "The member's requests to others' offers (by applicant).",
  },
  LadderResume: {
    decision: 'erase',
    reason:
      'Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes.',
  },
  LadderResumeReview: {
    decision: 'erase',
    reason: 'Explicit delete by userId (not `cascade`: its direct parent is itself a cascade entry).',
  },
  LadderResumeVersion: {
    decision: 'cascade',
    reason: 'Version history of a resume, deleted by the database with the resume.',
    parent: 'LadderResume',
  },
  LadderSavedSearch: {
    decision: 'erase',
    reason:
      'Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes.',
  },
  LadderUserPrefs: {
    decision: 'erase',
    reason:
      'Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes.',
  },
  LadderWatchlistEntry: {
    decision: 'erase',
    reason:
      'Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes.',
  },
  LaundryPlayer: {
    decision: 'erase',
    reason:
      'Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy).',
  },
  LayoutPreference: { decision: 'erase', reason: 'Rule 1: settings only the member sees.' },
  LibraryCollection: {
    decision: 'erase',
    reason:
      "The member's own collections (items cascade). An official collection they own is the site's: `ownerUserId` is nulled instead.",
    scope: 'Own collections where `official` is false',
  },
  LibraryDocument: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  LibraryQuotaRequest: {
    decision: 'erase',
    reason:
      "The member's quota requests; where the member decided others' requests as an admin, `decidedByUserId` is nulled.",
  },
  LibraryReaderMark: {
    decision: 'erase',
    reason: 'Synced reading places, bookmarks and notes (sprint 04 reading-sync).',
  },
  Listing: {
    decision: 'erase',
    reason:
      'Live market listings (the escrowed card goes with the inventory); finished sales stay as anonymous price history.',
    scope: 'active listings only',
  },
  ListingPurchase: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  LoadoutPreset: {
    decision: 'erase',
    reason: 'Saved cosmetic loadouts; the items stay with the inventory decision.',
  },
  MarathonList: {
    decision: 'erase',
    reason: 'A personal reading list; its shareId page 404s afterwards (the share page reads only this row).',
  },
  Media: {
    decision: 'deidentify',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove. The exception is the member\'s own card sounds (voice recordings, s10-02), heard by nobody else: those rows go back to PENDING in the erasure transaction and are deleted with their stored objects after it.',
  },
  MedSchoolList: {
    decision: 'erase',
    reason: "The member's saved school lists; list items go by the database cascade.",
  },
  MedTrackerCycle: {
    decision: 'erase',
    reason:
      'The private tracker; cascades to applications and milestones. The shared anonymous events are removed by `eraseSharedMedEvents` before this runs (plan Task 6), because only a milestone id plus the server secret finds them.',
  },
  MedUserPrefs: { decision: 'erase', reason: "The member's med schools display defaults; no child rows." },
  MemberMemory: {
    decision: 'erase',
    reason: 'Private memories; the table has no child rows.',
  },
  MemoriesOptIn: { decision: 'erase', reason: "Rule 1: the member's own opt-in to memories." },
  MessageRequest: { decision: 'erase', reason: 'Requests the member sent or received; decided ones are removed too.' },
  ModerationSweep: {
    decision: 'keep',
    reason:
      'Rule 4: the audit trail of an admin moderation action (who removed what from whom, and why); the sweep and its items stay when either member is deleted. Its items hold only ids and a timestamp.',
  },
  ModeratorNote: {
    decision: 'erase',
    reason: 'Notes about the member go with them; notes they wrote or deleted as a moderator lose the reference.',
  },
  MusicLearnCard: { decision: 'erase', reason: 'Every RMH Music learning table (owner decision Q4).' },
  MusicLearnLessonProgress: { decision: 'erase', reason: 'Every RMH Music learning table (owner decision Q4).' },
  MusicLearnProfile: { decision: 'erase', reason: 'Every RMH Music learning table (owner decision Q4).' },
  MusicPracticeEntry: { decision: 'erase', reason: 'Every RMH Music learning table (owner decision Q4).' },
  MusicShare: { decision: 'erase', reason: 'Every RMH Music learning table (owner decision Q4).' },
  MusicSocial: { decision: 'erase', reason: 'Every RMH Music learning table (owner decision Q4).' },
  MusicSongBest: { decision: 'erase', reason: 'Every RMH Music learning table (owner decision Q4).' },
  MusicSprintBest: { decision: 'erase', reason: 'Every RMH Music learning table (owner decision Q4).' },
  MusicSprintDaily: { decision: 'erase', reason: 'Every RMH Music learning table (owner decision Q4).' },
  NdwLivery: {
    decision: 'erase',
    reason: 'A cosmetic save; no board.',
  },
  NeonDriftwayPlayer: {
    decision: 'erase',
    reason:
      'Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy).',
  },
  NewsStory: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  NightrailPlayer: {
    decision: 'erase',
    reason:
      'Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy).',
  },
  NightrailTrick: { decision: 'keep', reason: 'Rule 3: published content others use stays under "Deleted user".' },
  NightrailTrickVote: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  Notification: {
    decision: 'erase',
    reason:
      'Rule 1: notifications addressed to the member (userId); notifications about them sent to others (actorId, onDelete SetNull) stay and render "Deleted user".',
    scope: 'rows addressed to the member (userId)',
  },
  NotificationPreference: { decision: 'erase', reason: 'Rule 1: settings only the member sees.' },
  OfficeHoursConfig: {
    decision: 'erase',
    reason: 'Availability settings (windows go by cascade); bookings others made have their own entry.',
  },
  Passkey: {
    decision: 'erase',
    reason: 'Every way to authenticate as the account is destroyed first, so a tombstone can never sign in.',
  },
  PhotoNomination: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  PhotoVote: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  PileOnGuard: { decision: 'keep', reason: 'Rule 4: abuse-prevention guard record, not shown to anyone.' },
  Player: {
    decision: 'erase',
    reason:
      'Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy).',
  },
  Playlist: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  PlaylistCollaborator: {
    decision: 'keep',
    reason:
      "Rule 2: a collaborator slot on another member's playlist; the playlist and its other contributors are unaffected.",
  },
  Pool: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  PoolContribution: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  PostAutoDelete: {
    decision: 'erase',
    reason: "The member's own auto-delete rule.",
  },
  PostSeries: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  PostSeriesFollow: {
    decision: 'erase',
    reason:
      'Subscriptions to things (a feed, a series, a community, build or market watch), not the social graph the `Follow` owner decision covers; `PostSeries.followCount` is decremented (floored) in the same transaction.',
  },
  PostUnlock: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  Prediction: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  PredictionComment: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  PredictionPosition: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  ProfileLayout: {
    decision: 'erase',
    reason: "The member's profile layout.",
  },
  ProfileLink: {
    decision: 'erase',
    reason: "The member's profile links; the profile itself is scrubbed, so the links go with it.",
  },
  ProfilePlus: {
    decision: 'erase',
    reason:
      "Pronunciation clip, pronouns, time zone and visit counts of the member's profile (`ProfileVisitDay` goes by cascade); the clip's stored object is deleted by the deletion request.",
  },
  ProfileStamp: {
    decision: 'erase',
    reason:
      "The member's placement of a `Stamp`; the stamp stays and `Stamp.addCount` is not decremented (an anonymous tally on a kept model).",
  },
  PromoClaim: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  PushSubscription: {
    decision: 'erase',
    reason: 'Every way to authenticate as the account is destroyed first, so a tombstone can never sign in.',
  },
  QotdAnswer: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  QotdPrompt: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  RMHark: {
    decision: 'deidentify',
    reason: 'Posts are published content and stay under "Deleted user"; only the member\'s pin (pinnedAt) is cleared.',
  },
  RMHarkComment: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  RMHarkCommentLike: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  RMHarkCommentReaction: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  RMHarkCommentRepost: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  RMHarkCommentView: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  RMHarkLike: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  RMHarkPollVote: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  RMHarkReaction: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  RMHarkRepost: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  RMHarkTakeVote: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  RMHboxProfile: {
    decision: 'deidentify',
    reason:
      'Has children (`RMHboxMatchPlayer.profile` cascades), so the profile is reset to defaults, never deleted; the RMHBox boards (socket and `/api/rmhbox/leaderboard`) list only `totalGamesPlayed > 0`. The `RMHboxMatchPlayer.userName` copies and the name inside `RMHboxMatch.results` become "Deleted user"; `RMHboxMatch.gameLog` (free-form) is a follow-up.',
  },
  RankedChallenge: {
    decision: 'keep',
    reason:
      'Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone.',
  },
  RankedSeasonRating: {
    decision: 'erase',
    reason: "Rule 1: the member's seasonal ranked ratings; opponents' ratings are not recomputed.",
  },
  ReadingGoal: { decision: 'erase', reason: "Rule 1: the member's own yearly reading goal." },
  ReadingHighlight: {
    decision: 'erase',
    reason:
      "Rule 1: private highlights (with their notes) are the member's own; public highlights follow the published-content rule and stay.",
    scope: 'isPublic: false rows only',
  },
  ReadingPrefs: { decision: 'erase', reason: "Rule 1: the member's own reading preferences." },
  ReadingTimeDay: {
    decision: 'erase',
    reason: "Rule 1: the member's own reading-time rows, erased by readingTimeErasureOps (sprint 07 reading-time).",
  },
  ReadingShelfEntry: {
    decision: 'erase',
    reason:
      "The member's shelves; only ever shown on their own profile (no cross-member aggregate), which the deletion scrubs.",
  },
  ReadingSubscription: {
    decision: 'erase',
    reason: "The member's reading subscriptions; no child rows.",
  },
  RebarReservation: {
    decision: 'todo',
    reason:
      'Rule 5: a table booking holds name, e-mail and an allergy note (userId is nullable for guests); needs a product call on how long bookings are kept.',
  },
  RecoveryCode: {
    decision: 'erase',
    reason: 'Account-recovery secrets (single-use codes, in-flight request token hash) must not outlive the account.',
  },
  RecoveryRequest: {
    decision: 'erase',
    reason: 'Account-recovery secrets (single-use codes, in-flight request token hash) must not outlive the account.',
  },
  RedemptionRequest: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  Referral: {
    decision: 'keep',
    reason: "Rule 4: referral record that explains reward coins; the other member's record too.",
  },
  Reminder: { decision: 'erase', reason: "Rule 1: the member's own reminders." },
  RemixEdge: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  RepostMute: {
    decision: 'erase',
    reason:
      "The member's own mute and block lists (and reposts muted); rows where others blocked or muted them are the others' safety choices and stay.",
    scope: 'rows where the member is either side',
  },
  Ride: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  RideMessage: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  RideSavedPlace: {
    decision: 'erase',
    reason: "The member's saved places.",
  },
  RideshareDriver: {
    decision: 'erase',
    reason:
      "The driver application (vehicle, plate, licence, last location). Rides reference the user, not this row; where the member reviewed others' applications `reviewedById` is nulled.",
  },
  RmhCharacter: {
    decision: 'erase',
    reason: "The member's characters; private (only the owner-scoped character API reads them).",
  },
  RmhCodeToken: {
    decision: 'erase',
    reason: 'Hashed bearer tokens for the rmhcode CLI would stay valid for a tombstone.',
  },
  RmhStudyProfile: {
    decision: 'erase',
    reason:
      'Focus totals and sessions (RmhStudySession by the cascade); the RMHStudy boards read this table, so the member leaves them.',
  },
  RmhTubeCommentaryTrack: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  RmhTubeQueueItem: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  RmhTubeRoom: {
    decision: 'deidentify',
    reason:
      'A party the member hosts and has not held is closed so it cannot open as the erased account; the room row stays.',
  },
  RmhTubeRoomMember: {
    decision: 'keep',
    reason:
      'Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone.',
  },
  RmhTubeRoomRsvp: { decision: 'erase', reason: 'Going marks on watch parties (sprint 03).' },
  RmhTubeSubscription: {
    decision: 'owner',
    reason:
      "Subscriptions to a member's channel are the social graph: the open owner decision on a deleted member's follows (as `Follow`); rows untouched.",
  },
  RmhTubeTimedComment: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  RmhTubeUserStats: {
    decision: 'erase',
    reason: "Rule 1: the member's own watch statistics; deleted in anonymizeAccount (sprint 08 01).",
  },
  RmhTubeWatchDay: {
    decision: 'erase',
    reason: "Rule 1: the member's per-day minutes; deleted in anonymizeAccount (sprint 08 01).",
  },
  RmhTubeWatchLater: { decision: 'erase', reason: "Rule 1: the member's own watch-later list." },
  RmhTypeDailyEntry: {
    decision: 'erase',
    reason: 'The RMHType daily board orders `wpm` at read; the row going takes the member off it.',
  },
  RmhTypeGhost: {
    decision: 'erase',
    reason: "Rule 1: the member's own best-run progress curves; deleted in anonymizeAccount (sprint 08 11).",
  },
  RmhTypeKeyStat: {
    decision: 'erase',
    reason: 'Private per-key counters; no board.',
  },
  RmhTypeLessonProgress: {
    decision: 'erase',
    reason: 'Private lesson progress; no board.',
  },
  RmhTypeProfile: {
    decision: 'deidentify',
    reason:
      'Has children (`RmhTypeMatchPlayer.profile` cascades), so totals and bests are reset to defaults, never deleted; `fetchLeaderboard` already requires `bestWpm > 0`. The `RmhTypeMatchPlayer.userName` copies become "Deleted user".',
  },
  RmhTypeText: {
    decision: 'erase',
    reason:
      "Rule 1: the member's own saved practice texts; deleted in anonymizeAccount (sprint 10 05). Never on a board.",
  },
  RmhTypeTextRun: {
    decision: 'erase',
    reason: "Rule 1: the member's runs on their saved texts; deleted in anonymizeAccount (sprint 10 05).",
  },
  RmhboxPack: { decision: 'keep', reason: 'Rule 3: published content others use stays under "Deleted user".' },
  RmhboxPackReport: { decision: 'keep', reason: "Rule 4: a report about someone else's pack is a moderation record." },
  RmhboxSettingsPreset: { decision: 'erase', reason: 'Saved RMHBox game settings.' },
  Rsvp: {
    decision: 'erase',
    reason:
      'Every RSVP row, after `releaseSeatsOf` has freed seats and promoted the waitlist; attendee lists no longer show a deleted member and past turnout drops by one.',
  },
  SaveFolder: {
    decision: 'erase',
    reason: "Rule 1: the member's own save folders; erased after SavedItem, which refers to them.",
  },
  SavedItem: { decision: 'erase', reason: 'Rule 1: saved items with a private note; erased before SaveFolder.' },
  SavedReply: { decision: 'erase', reason: 'Private saved replies.' },
  SavingsGoal: {
    decision: 'erase',
    reason: 'Private savings goals; no child rows.',
  },
  ScheduledChatMessage: {
    decision: 'erase',
    reason: 'Messages held for later would still deliver as the erased account.',
  },
  ScheduledGift: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  ScheduledPost: {
    decision: 'erase',
    reason: 'Rule 1: drafts and sealed capsules; a post already published from one stays, as posts do.',
  },
  SecurityEvent: { decision: 'keep', reason: 'Rule 4: security audit trail.' },
  Session: {
    decision: 'erase',
    reason: 'Every way to authenticate as the account is destroyed first, so a tombstone can never sign in.',
  },
  SharedMoment: {
    decision: 'erase',
    reason:
      "A share card of the member's stats snapshotting their name in payload; deleting the row 404s the landing page and OG image.",
  },
  SignalForgePlayer: {
    decision: 'erase',
    reason:
      'Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy).',
  },
  SiteIdempotencyKey: {
    decision: 'erase',
    reason: 'Short-lived; stored responses may hold member data.',
  },
  SkillEndorsement: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  SliceDailyEntry: {
    decision: 'erase',
    reason: 'The Slice It daily board reads at request time; the row going takes the member off it.',
  },
  SliceRun: {
    decision: 'erase',
    reason: 'Per-chart boards read at request time; the library shelves cache lists songs, never players.',
  },
  SliceSetlist: {
    decision: 'erase',
    reason: 'Private setlists go; the daily and chart boards do not read them.',
    scope:
      '`isPublic = false`; public setlists are published lists other members open (an open owner decision), they stay under "Deleted user"',
  },
  Song: { decision: 'keep', reason: 'Rule 3: published content others use stays under "Deleted user".' },
  SongComment: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  SongLeaderboard: {
    decision: 'erase',
    reason:
      'Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy).',
  },
  SongLike: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  SongPlay: {
    decision: 'erase',
    reason: 'Per-member play counts; no board. `Song.plays` is an anonymous tally and stays (counter rule).',
  },
  SpeedrunEntry: {
    decision: 'keep',
    reason:
      'Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone.',
  },
  Stamp: { decision: 'keep', reason: 'Rule 3: published content others use stays under "Deleted user".' },
  Streak: {
    decision: 'todo',
    reason:
      "Rule 1: the member's own progress and owned items (inventory may hold coin purchases); erase candidate after a product call on purchased cosmetics.",
  },
  StudioChallengeEntry: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  StudioChallengeVote: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  StudioProject: { decision: 'erase', reason: 'Cloud copies of Studio projects.' },
  StudyBuddyMatch: {
    decision: 'keep',
    reason:
      'Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone.',
  },
  StudyBuddyRequest: {
    decision: 'erase',
    reason:
      'Waiting and past requests; a matched StudyBuddyMatch is keep (shared with the other member) and is untouched.',
  },
  StudyPlan: { decision: 'erase', reason: "Rule 1: the member's own study plans." },
  SynapseStormPlayer: {
    decision: 'erase',
    reason:
      'Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy).',
  },
  SyncTombstone: {
    decision: 'erase',
    reason:
      'Rule 1: ids, kinds and times of what the member deleted, kept 90 days for their own sync clients (keys are revoked anyway); no content. Not exported.',
  },
  TargetedNoticeDismissal: { decision: 'erase', reason: 'Rule 1: which site notices the member dismissed.' },
  TempleOfJoySave: {
    decision: 'erase',
    reason: 'A game save; no board.',
  },
  Tf2Hud: { decision: 'keep', reason: 'Rule 3: published content others use stays under "Deleted user".' },
  Tf2HudLike: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  Tf2HudUserBlob: {
    decision: 'erase',
    reason:
      "The member's link to a content-addressed blob other members may share; the blob stays (an orphan sweep is not this feature's).",
  },
  Tf2Loadout: { decision: 'keep', reason: 'Rule 3: published content others use stays under "Deleted user".' },
  Tf2LoadoutLike: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  Tournament: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  TournamentEntrant: {
    decision: 'keep',
    reason:
      'Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone.',
  },
  TranslationSuggestion: {
    decision: 'keep',
    reason:
      'Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member\'s record on it is not ours to remove.',
  },
  TranslationVote: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  TrustedContact: {
    decision: 'erase',
    reason: "The vouch graph is deleted in both directions (as owner and as someone else's contact).",
  },
  UserAchievement: {
    decision: 'erase',
    reason:
      "Rule 1: the member's achievement progress; a site-wide percentage computed from rows drops by one (accepted).",
  },
  UserBirthday: {
    decision: 'erase',
    reason: "Rule 1: the member's own birthday, shown to no one once the account is gone.",
  },
  UserBlock: {
    decision: 'erase',
    reason:
      "The member's own mute and block lists (and reposts muted); rows where others blocked or muted them are the others' safety choices and stay.",
    scope: 'rows where the member is either side',
  },
  UserBuild: { decision: 'keep', reason: 'Rule 3: published content others use stays under "Deleted user".' },
  UserCard: {
    decision: 'erase',
    reason:
      "The member's trading cards, drop ledger, badges, pinned achievements, library collections and showcase; the cascade never fires.",
  },
  UserGems: { decision: 'erase', reason: 'Gem balance and entries.' },
  UserInventory: {
    decision: 'todo',
    reason:
      "Rule 1: the member's own progress and owned items (inventory may hold coin purchases); erase candidate after a product call on purchased cosmetics.",
  },
  UserMute: {
    decision: 'erase',
    reason:
      "The member's own mute and block lists (and reposts muted); rows where others blocked or muted them are the others' safety choices and stay.",
    scope: 'rows where the member is either side',
  },
  UserPlayLimits: {
    decision: 'erase',
    reason: "The member's own staking caps, cool-off and exclusion dates (sprint 04 spending-budget).",
  },
  UserProfile: {
    decision: 'deidentify',
    reason: 'Profile PII (display name, bio, location, website, image, profile song) is nulled; the row stays.',
  },
  UserQuest: {
    decision: 'erase',
    reason: 'Progress only; rewards already paid stay in the coin ledger.',
  },
  UserSeasonProgress: {
    decision: 'todo',
    reason:
      "Rule 1: the member's own progress and owned items (inventory may hold coin purchases); erase candidate after a product call on purchased cosmetics.",
  },
  UserStrike: { decision: 'keep', reason: 'Rule 4: strikes are the moderation trail.' },
  UserTheme: { decision: 'keep', reason: 'Rule 3: published content others use stays under "Deleted user".' },
  VegaPlayer: {
    decision: 'erase',
    reason:
      'Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy).',
  },
  VelumContract: {
    decision: 'keep',
    reason:
      'Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone.',
  },
  VersecraftProgress: {
    decision: 'erase',
    reason: 'A game save; no board.',
  },
  VersecraftSave: {
    decision: 'erase',
    reason: 'A game save; no board.',
  },
  VersecraftSeedListing: {
    decision: 'keep',
    reason: 'Rule 3: published content others use stays under "Deleted user".',
  },
  VersecraftSeedRating: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  VibePage: {
    decision: 'deidentify',
    reason:
      'Vibe pages are remixed and embedded by others, so they move to the shared "Deleted user" owner rather than being erased.',
  },
  VoidBreakerPlayer: {
    decision: 'erase',
    reason:
      'Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy).',
  },
  WagerMatch: {
    decision: 'keep',
    reason: "Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record.",
  },
  Watch: {
    decision: 'erase',
    reason:
      'Subscriptions to things (a feed, a series, a community, build or market watch), not the social graph the `Follow` owner decision covers; notification levels on things, never on people; no counter.',
  },
  WebhookEndpoint: {
    decision: 'erase',
    reason: "Would keep POSTing the account's events to third-party URLs; cascades its queued deliveries.",
  },
  Webring: { decision: 'keep', reason: 'Rule 3: published content others use stays under "Deleted user".' },
  WebringMember: {
    decision: 'keep',
    reason:
      "Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity.",
  },
  WishlistEntry: {
    decision: 'erase',
    reason: 'The private wishlist, price-alert state included; no child rows.',
  },
};
