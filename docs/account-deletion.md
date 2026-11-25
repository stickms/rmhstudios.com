<!--
  GENERATED FILE — do not edit by hand.
  Source: lib/account/erasure-registry.ts (scripts/generate-account-deletion-doc.ts).
  Regenerate with `pnpm docs:deletion`.
-->
# Account deletion

What happens to a member's data when they delete their account, and where each table stands.

## What deletion does

Deleting an account is two phases (`lib/account/deletion.server.ts`):

1. **Schedule.** `scheduleDeletion` sets `deletionScheduledAt` 30 days out (`DELETION_GRACE_DAYS`), signs the member out and hides the account. Signing back in cancels it. The grace period is as it is; changing it is an open owner decision.
2. **Finalise.** A nightly sweep (`finalizeDueDeletions`) runs `anonymizeAccount`: one transaction of explicit deletes and updates, plus per-domain `…ErasureOps` helpers.

The `User` row is anonymised in place, never removed, so `onDelete: Cascade` from `User` never fires. A table is therefore erased only when `anonymizeAccount` says so. Posts and other published content stay under "Deleted user".

## The registry

`lib/account/erasure-registry.ts` classifies every model that has a relation to `User`: `erase`, `deidentify`, `cascade`, `keep`, `owner` or `todo`, each with a one-line reason. The registry is the source and this page is generated from it (`pnpm docs:deletion`; `pnpm docs:deletion --check` fails when the page is stale): `lib/account/__tests__/erasure-coverage.test.ts` fails for a model with a `User` relation that has no entry, for an `erase` entry with no delete in `anonymizeAccount`, for a `deidentify` entry with no update, for a missing reason, for a row missing from this page, and for a `todo` count above `TODO_CEILING`. A new model lands classified, not as `todo`.

The clearly private leaf tables (birthday, reminders, drafts, saves, history, settings, notifications, and private reading highlights) are erased by `coverageErasureOps` in `lib/account/erasure-coverage.server.ts`.

414 models are classified.

## Erased

Deleted, de-identified or cascaded by `anonymizeAccount`. A `deidentify` row stays with its member reference replaced or nulled; a `cascade` row goes with its parent in the database. 258 models.

| Model | Decision | Reason |
| --- | --- | --- |
| `Account` | erase | Every way to authenticate as the account is destroyed first, so a tombstone can never sign in. |
| `AchievementTrack` | erase | The member's trading cards, drop ledger, badges, pinned achievements, library collections and showcase; the cascade never fires. |
| `Activity` | erase | Derived "X did Y" rows that followers see; the content they point at follows its own rule. `meta` goes with the row. |
| `AiPersona` | erase | Only private personas (isPublic = false) that no other member has chatted with are the member's tool and are erased; their messages go by the cascade. Public personas stay under the tombstone as published content others chat with (chatCount). A persona made private after being public, with other members' chats, is kept so their chats survive (it is unreachable: its owner is a tombstone), with its systemPrompt set to '' and its tagline and greeting to null in the same erasure step; the name, emoji and avatar stay because they are how those chats show it. The generated avatar object stays in storage (no personal data; classified not-recorded). |
| `AiPersonaMessage` | erase | The member's side of persona chats, on any persona (rows with the member as userId). |
| `AltairCoopProfile` | erase | The co-op board orders this table (`totalCoopWins`, `totalRevivesGiven` indexes) at read time; the row going takes the member off it. |
| `AltairMatchPlayer` | deidentify | A row in a shared co-op match (up to four players): `userId` is required so the row stays and the copied `userName` becomes "Deleted user"; no board lists it by name. |
| `AltairMetaProgress` | erase | Solo meta progress (in-game coins only; the site ledger is separate); no board. |
| `AltairPlayer` | erase | Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy). |
| `AltairSoloRun` | erase | Solo runs (in-game coins only); no board reads them by member. |
| `AppearancePreference` | erase | Rule 1: settings only the member sees. |
| `ArcadeRival` | erase | Both directions: the member's own rivals, and rows naming them as a rival (`rivalUserId` is indexed). |
| `ArcadeSeedRun` | erase | Daily, seed and basket boards read these rows in `board()` (`lib/arcade/runs.server.ts`), cached 30 s per seed key; the TTL is the drop. |
| `AvailabilityPollInvitee` | erase | The member's invitation rows on a poll; their answers are `AvailabilityPollResponse`, kept for the poll's integrity. |
| `AwayMessage` | erase | The away message and its reply markers are the member's own. |
| `BlogAnnouncementSeen` | erase | The member's seen markers. |
| `BracketPick` | erase | Rule 1: the member's own pick'em picks; standings are computed from picks when read, so nobody else's points change. |
| `BuildComment` | deidentify | Published build comments stay under "Deleted user" (as post comments do); only where the member hid comments is the reference (hiddenById) nulled. |
| `BuildIssueVote` | erase | The member's "I see this too" marks are their own: deleted, and each issue's voteCount is decremented in the same transaction. |
| `BuildView` | deidentify | A first view is a count on the creator's insights; the row stays without its viewer. |
| `BulkOperation` | erase | Bulk clean-up operations (sprint 07 bulk-durable); a run in progress stops at its next chunk. |
| `CalcNotebook` | erase | Rule 1: the member's own calculator notebooks. |
| `CalendarFeed` | erase | The private calendar URL token is a credential that calendar apps send. |
| `CallMute` | erase | Both directions: the member's own mutes, and rows naming them as the muted user. `mutedUserId` is unindexed; the small table is scanned once per deletion. |
| `CanvasCooldown` | erase | A placement timer; no board. |
| `CardBuyOrder` | erase | Open buy orders only; nothing was held for them, so nothing is refunded. Scope: status: OPEN rows only. |
| `CardDrop` | erase | The member's trading cards, drop ledger, badges, pinned achievements, library collections and showcase; the cascade never fires. |
| `CardTrade` | erase | Pending trade offers in either direction; finished trades stay as anonymous history. Scope: status: PENDING rows only. |
| `Chat` | erase | A message request of theirs still waiting has its chat deleted so its one message cannot surface as "Deleted user". Scope: chats of pending or draft message requests only. |
| `ChatFolder` | erase | Inbox arrangement (folder items go by cascade). |
| `ChatInvite` | erase | Group invite links the member created. |
| `ChatMention` | erase | Group mentions that name the member (sprint 07 group-mentions). |
| `CloseFriend` | erase | Both directions: the member's own list (ownerId) and their presence in others' lists (memberId); a tombstone in someone's circle widens and narrows nothing. |
| `CoinAdjustment` | deidentify | Adjustments are financial records; the admin's free-text note about the member goes. |
| `CommunityBan` | erase | Sanctions about the member are deleted; where they were the moderator the reference is nulled. |
| `CommunityContributorScore` | erase | Rule 1: the member's row on contributor lists; each row is independent, so other members' scores are unaffected. |
| `CommunityHandover` | erase | Open ownership offers to or from the member; a decided offer only names the tombstone. Scope: status: pending rows only. |
| `CommunityInvite` | erase | Invite links the member created grant entry without approval and must stop working. |
| `CommunityJoinRequest` | erase | Pending requests are withdrawn (they can never be honoured). Decided and removed rows stay as the moderators' record and cooldown marker, with the free-text message set to null. |
| `CommunityMember` | deidentify | Membership survives an anonymised account, so post alerts are reset to off. |
| `CommunityOnboardingAnswer` | erase | The member's answers, seen only by the community's moderators. |
| `CommunityRecurringThread` | deidentify | Thread templates the member authored are handed to the community owner and paused (nothing posts under their name until a moderator saves one); when the member owned the community, or it has no owner, they are deleted. |
| `ConnectionsGrid` | erase | Drafts were never published, so nobody else uses them and they go with the account. A published grid stays under "Deleted user" (rule 3: published content others use). Scope: draft rows only (draft = true); published grids stay under "Deleted user" (rule 3). |
| `ConnectionsPlay` | erase | The member's own plays; no board. No children: it is the child of `ConnectionsGrid`, whose anonymous play and rating tallies stay (counter rule). |
| `ContentReport` | deidentify | The report stays as the moderators' record; the reporter's free-text details are nulled. |
| `ConversationPref` | erase | Per-conversation notification choices (muted posts and chats). |
| `CustomFeed` | erase | Only feeds where isPublic is false and visibility is not PUBLIC (private and by-link): the member's tools, with members and subscribers going by the cascade. Public feeds (either flag) have subscribers and stay under the tombstone as published content. |
| `CustomFeedSubscription` | erase | Subscriptions to things (a feed, a series, a community, build or market watch), not the social graph the `Follow` owner decision covers; `CustomFeed.subscriberCount` is decremented (floored) in the same transaction. |
| `DailyPuzzleReport` | erase | A member's report that a daily puzzle is wrong, with an optional note: deleted with the account (the report is not shared with another member; moderators read only the counts and the notes of live reports). |
| `DailyPuzzleScore` | erase | The daily leaderboard and results endpoints read at request time; the member's cached stats (`dailyStatsKey`) are dropped after the transaction. |
| `DeckEditor` | erase | Who may edit a deck is the owner's choice, but a member's own membership of someone else's deck is their own record: erased, so a deleted member leaves every deck they edited. Rows on the member's own decks stay because the decks do (FlashcardDeck is the open public-decks decision); nobody can invite to such a deck any more. Scope: rows where the member is the editor or the invitee (userId); rows on decks the member owns stay with those decks (invitedById points at the anonymised member). |
| `DeckFolder` | erase | Private deck folders (sprint 07 deck-folders); decks stay, folderless. |
| `DeckRating` | erase | The member's own ratings go with the account and each rated deck's sum and count are corrected in the same transaction; the decks stay (FlashcardDeck), so no copyCount changes. |
| `DeckSuggestion` | erase | The member's proposed corrections to other members' cards are their own writing, private to them and the deck's author: erased, so open ones leave the author's list. Scope: rows where the member is the suggester (suggesterId); suggestions to the member's own decks stay with the decks. |
| `DeletionHold` | erase | The ids of the keys and webhooks a deletion request paused (sprint 09 deletion-pause); the hold has no use once the account is anonymised. |
| `DeveloperApiKey` | erase | Hashed developer API keys; deleting a key also cascades its usage, refusal and idempotency rows. |
| `DevRecipe` | erase | The member's automation recipes (webhook and DM actions). |
| `DirectMessageHide` | erase | Inbox arrangement: the member's hidden messages. |
| `DiscordWatchAlert` | erase | The member's alert subscriptions. |
| `DoctrinePuzzleReplay` | erase | Rule 1: the member's private replays of their own puzzle runs. |
| `DoctrinePuzzleSubmission` | erase | Rule 1: the member's per-puzzle results; the puzzle keeps no solve counter, so nothing is left to correct. |
| `DoctrineRecruitmentCode` | erase | Recruitment codes the member issued (recruiterId). |
| `DoctrineReputation` | erase | Rule 1: the member's Doctrine reputation (totalXp is what the board reads); the ledger rows go with it by the database cascade. |
| `DreamRiftCoopRun` | deidentify | A co-op run loses its host (hostUserId nulled); the run stays for its other players. |
| `DreamRiftPlayer` | erase | Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy). |
| `EloRating` | erase | Rule 1: the member's ratings on ranked boards; opponents' ratings are not recomputed (their gains and losses happened). |
| `EmailCampaignRecipient` | deidentify | The row stays as the campaign's delivery record; queued mail (pending or claimed) is set to skipped so no later send picks it up. |
| `EmojiPackSubscription` | erase | The member's subscription; EmojiPack.subscriberCount is an anonymous tally and is left. |
| `EventCohost` | erase | The member's co-host rows and every row on events they host. |
| `ExperimentExposure` | erase | Analytics exposure tied to the member; experiment counts computed at read drop by one, accepted. |
| `Feedback` | erase | The member's feedback is deleted; rows they handled as an admin are unlinked. |
| `FeedSignal` | erase | The member's own rows (userId). Rows naming the member as a less_author target are other members' tuning: they name an id that now reads Deleted user, change nothing anyone sees, and have no targetId index, so they are kept. |
| `FlashcardReminder` | erase | The member's own study reminder. |
| `FlashcardReview` | erase | Private study history and SM-2 state. |
| `FlashcardReviewLog` | erase | Private study history and SM-2 state. |
| `FlashcardTestResult` | erase | The member's practice-test results. |
| `FortuneCookie` | erase | The text is the member's own words and nothing names its author; if today's fortune is theirs the next approved one replaces it after the 60 s cache. |
| `GabrielsHornPlayer` | erase | Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy). |
| `GabrielsHornTableRead` | erase | The member's own tells statistics; no board. |
| `GameAssistPreference` | erase | The cross-game assist preference (sprint 07 game-assists). |
| `GameBadge` | erase | The member's trading cards, drop ledger, badges, pinned achievements, library collections and showcase; the cascade never fires. |
| `GameCollectionItem` | erase | The member's trading cards, drop ledger, badges, pinned achievements, library collections and showcase; the cascade never fires. |
| `GameFollow` | erase | Games the member follows would keep notifying the erased account. |
| `GameJamFeedback` | erase | Feedback the member wrote on jam entries. |
| `GameJamTeamMember` | erase | The member's team rows and pending invitations on their entries. |
| `GameJamThemeVote` | erase | The member's theme votes (sprint 07 jam-themes). |
| `GamePersonalBest` | erase | The member's own record history. |
| `GamePlayStatus` | erase | The member's own play statuses; counts by status are computed at read, no board. |
| `GamePlaytime` | erase | Per-title playtime would keep a tombstone in "Most played by" with its hours. |
| `GamePlaytimeDay` | erase | Per-title playtime would keep a tombstone in "Most played by" with its hours. |
| `GameProfileShowcase` | erase | The member's trading cards, drop ledger, badges, pinned achievements, library collections and showcase; the cascade never fires. |
| `GameReplay` | erase | Saved replays, except the proofs behind speedrun entries, which stay as board history. Scope: rows not backing a speedrun entry. |
| `GameSave` | erase | Cloud saves and their version history: private progress. |
| `GameSaveSnapshot` | erase | Cloud saves and their version history: private progress. |
| `GameStat` | erase | Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy). |
| `GameThread` | erase | Community Hub discussions: replies, then threads (with everyone's replies). |
| `GameThreadPost` | erase | Community Hub discussions: replies, then threads (with everyone's replies). |
| `GemEntry` | erase | Gem balance and entries. |
| `GlobeSetPlayer` | erase | Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy). |
| `HandleChange` | erase | Rows past the 30-day reclaim window go with the account; newer ones stay so the released handle is still protected, and a daily job erases them once they pass it. "Previously known as" is never shown for a deleted profile. Scope: Rows older than the reclaim window at deletion; the rest by the daily job. |
| `HeldNotification` | erase | Rule 1: notifications held for the member by quiet hours. |
| `HistoryEntry` | erase | Rule 1: the member's own browsing history. |
| `HomeFavorite` | erase | The member's saved homes, with their private notes. |
| `HomeListing` | erase | The member's listings (inquiries and favourites cascade from the listing). |
| `HomeRoommateProfile` | erase | The member's roommate profile. |
| `HomeWatch` | erase | The member's saved home searches. |
| `HuntProgress` | erase | The hunt's finish board orders `durationMs` at read; the row going takes the member off it. |
| `KeyboardPreference` | erase | Rule 1: settings only the member sees. |
| `KeywordAlertHit` | erase | Rule 1: the member's own keyword-alert hits. |
| `LadderAiTask` | erase | Nullable resume relation: tasks that carry only a job id are not reached by the resume cascade. |
| `LadderAlert` | erase | Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes. |
| `LadderAlertEvent` | erase | Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes. |
| `LadderAnswerBank` | erase | Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes. |
| `LadderApplication` | erase | Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes. |
| `LadderApplicationEvent` | cascade | Timeline rows of an application, deleted by the database with the application. Parent: `LadderApplication`. |
| `LadderCompany` | erase | A company row the member created for a job they found elsewhere (s13-08); deleted by ownerId after their own jobs. The shared catalogue rows have no owner and are never touched. Scope: rows the member owns (ownerId). |
| `LadderJob` | erase | A job the member added themselves (s13-08); deleted by ownerId, which takes its applications, events and offer with it. The shared catalogue rows have no owner and are never touched. Scope: rows the member owns (ownerId). |
| `LadderJobAction` | erase | Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes. |
| `LadderJobMatch` | erase | Explicit delete by userId (not `cascade`: the coverage test needs a direct cascade relation to an erase parent). The database cascade also fires when the resume goes. |
| `LadderKeyword` | erase | Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes. |
| `LadderOffer` | erase | Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes. |
| `LadderProductEvent` | erase | Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes. |
| `LadderReferralOffer` | erase | The member's offers (company, roles, note). Requests other members sent to them go by the database cascade, the one place rows another member wrote are removed: a request to a deleted offer can never be answered and would keep the member's company beside it. |
| `LadderReferralRequest` | erase | The member's requests to others' offers (by applicant). |
| `LadderResume` | erase | Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes. |
| `LadderResumeReview` | erase | Explicit delete by userId (not `cascade`: its direct parent is itself a cascade entry). |
| `LadderResumeVersion` | cascade | Version history of a resume, deleted by the database with the resume. Parent: `LadderResume`. |
| `LadderSavedSearch` | erase | Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes. |
| `LadderUserPrefs` | erase | Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes. |
| `LadderWatchlistEntry` | erase | Private RMHLadder data (resumes, applications, salary and EEO answers, alerts, offers) erased in the sprint 02 and 03 passes. |
| `LaundryPlayer` | erase | Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy). |
| `LayoutPreference` | erase | Rule 1: settings only the member sees. |
| `LibraryCollection` | erase | The member's own collections (items cascade). An official collection they own is the site's: `ownerUserId` is nulled instead. Scope: Own collections where `official` is false. |
| `LibraryQuotaRequest` | erase | The member's quota requests; where the member decided others' requests as an admin, `decidedByUserId` is nulled. |
| `LibraryReaderMark` | erase | Synced reading places, bookmarks and notes (sprint 04 reading-sync). |
| `LightsOutBoardPlay` | erase | The member's own plays and best moves (their row on a board's fewest-moves list). No children: it is the child of `LightsOutBoard`, whose anonymous play and solve tallies stay (counter rule). |
| `Listing` | erase | Live market listings (the escrowed card goes with the inventory); finished sales stay as anonymous price history. Scope: active listings only. |
| `ListLeave` | erase | The member's own leave rows are deleted with the account (`listLeaveErasureOps`); the rows on a list the member owns go with the list by the cascade. |
| `LoadoutPreset` | erase | Saved cosmetic loadouts; the items stay with the inventory decision. |
| `MarathonList` | erase | A personal reading list; its shareId page 404s afterwards (the share page reads only this row). |
| `MedApplicantProfile` | erase | The member's private applicant stats (MCAT attempts, GPAs, hours, notes); attempts, hours and activities go by the database cascade. Never aggregated or public. |
| `Media` | deidentify | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. The exception is the member's own card sounds (voice recordings, s10-02), heard by nobody else: those rows go back to PENDING in the erasure transaction and are deleted with their stored objects after it. |
| `MedQaLimitRequest` | erase | The member's requests for a higher Q&A limit (their optional reason and an admin's reply; never a question). Where the member decided others' requests as an admin, `decidedBy` and `revokedBy` are nulled. |
| `MedSchoolList` | erase | The member's saved school lists; list items go by the database cascade. |
| `MedTrackerCycle` | erase | The private tracker; cascades to applications and milestones. The shared anonymous events are removed by `eraseSharedMedEvents` before this runs (plan Task 6), because only a milestone id plus the server secret finds them. |
| `MedUserPrefs` | erase | The member's med schools display defaults; no child rows. |
| `MemberMemory` | erase | Private memories; the table has no child rows. |
| `MemoriesOptIn` | erase | Rule 1: the member's own opt-in to memories. |
| `MessageRequest` | erase | Requests the member sent or received; decided ones are removed too. |
| `ModeratorNote` | erase | Notes about the member go with them; notes they wrote or deleted as a moderator lose the reference. |
| `MusicLearnCard` | erase | Every RMH Music learning table (owner decision Q4). |
| `MusicLearnLessonProgress` | erase | Every RMH Music learning table (owner decision Q4). |
| `MusicLearnProfile` | erase | Every RMH Music learning table (owner decision Q4). |
| `MusicPracticeEntry` | erase | Every RMH Music learning table (owner decision Q4). |
| `MusicShare` | erase | Every RMH Music learning table (owner decision Q4). |
| `MusicSocial` | erase | Every RMH Music learning table (owner decision Q4). |
| `MusicSongBest` | erase | Every RMH Music learning table (owner decision Q4). |
| `MusicSprintBest` | erase | Every RMH Music learning table (owner decision Q4). |
| `MusicSprintDaily` | erase | Every RMH Music learning table (owner decision Q4). |
| `NdwLivery` | erase | A cosmetic save; no board. |
| `NeonDriftwayPlayer` | erase | Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy). |
| `NewsStoryFollow` | erase | Rule 1: the member's own story follows, erased by storyFollowErasureOps (sprint 13 news-stories). |
| `NightrailPlayer` | erase | Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy). |
| `Notification` | erase | Rule 1: notifications addressed to the member (userId); notifications about them sent to others (actorId, onDelete SetNull) stay and render "Deleted user". Scope: rows addressed to the member (userId). |
| `NotificationPreference` | erase | Rule 1: settings only the member sees. |
| `OfficeHoursConfig` | erase | Availability settings (windows go by cascade); bookings others made have their own entry. |
| `Passkey` | erase | Every way to authenticate as the account is destroyed first, so a tombstone can never sign in. |
| `Player` | erase | Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy). |
| `PostAutoDelete` | erase | The member's own auto-delete rule. |
| `PostSeriesFollow` | erase | Subscriptions to things (a feed, a series, a community, build or market watch), not the social graph the `Follow` owner decision covers; `PostSeries.followCount` is decremented (floored) in the same transaction. |
| `ProfileLayout` | erase | The member's profile layout. |
| `ProfileLink` | erase | The member's profile links; the profile itself is scrubbed, so the links go with it. |
| `ProfilePlus` | erase | Pronunciation clip, pronouns, time zone and visit counts of the member's profile (`ProfileVisitDay` goes by cascade); the clip's stored object is deleted by the deletion request. |
| `ProfileStamp` | erase | The member's placement of a `Stamp`; the stamp stays and `Stamp.addCount` is not decremented (an anonymous tally on a kept model). |
| `PushSubscription` | erase | Every way to authenticate as the account is destroyed first, so a tombstone can never sign in. |
| `RankedSeasonRating` | erase | Rule 1: the member's seasonal ranked ratings; opponents' ratings are not recomputed. |
| `ReadAlong` | deidentify | A read-along the member started is handed to the community owner and paused (nothing posts under their name until a moderator resumes it); when the member owned the community, or it has no owner, it is cancelled and its unposted parts are deleted. The parts stay with it; the threads it posted are community posts. |
| `ReadAlongReader` | erase | The member's own rows as a reader: which read-alongs they joined, their notice setting and their last finished part. |
| `ReadingGoal` | erase | Rule 1: the member's own yearly reading goal. |
| `ReadingHighlight` | erase | Rule 1: private highlights (with their notes) are the member's own; public highlights follow the published-content rule and stay. Scope: isPublic: false rows only. |
| `ReadingPrefs` | erase | Rule 1: the member's own reading preferences. |
| `ReadingShelfEntry` | erase | The member's shelves; only ever shown on their own profile (no cross-member aggregate), which the deletion scrubs. |
| `ReadingSubscription` | erase | The member's reading subscriptions; no child rows. |
| `ReadingTimeDay` | erase | Rule 1: the member's own reading-time rows, erased by readingTimeErasureOps (sprint 07 reading-time). |
| `RecoveryCode` | erase | Account-recovery secrets (single-use codes, in-flight request token hash) must not outlive the account. |
| `RecoveryRequest` | erase | Account-recovery secrets (single-use codes, in-flight request token hash) must not outlive the account. |
| `Reminder` | erase | Rule 1: the member's own reminders. |
| `RepostMute` | erase | The member's own mute and block lists (and reposts muted); rows where others blocked or muted them are the others' safety choices and stay. Scope: rows where the member is either side. |
| `RideSavedPlace` | erase | The member's saved places. |
| `RideshareDriver` | erase | The driver application (vehicle, plate, licence, last location). Rides reference the user, not this row; where the member reviewed others' applications `reviewedById` is nulled. |
| `RMHark` | deidentify | Posts are published content and stay under "Deleted user"; only the member's pin (pinnedAt) is cleared. |
| `RMHboxProfile` | deidentify | Has children (`RMHboxMatchPlayer.profile` cascades), so the profile is reset to defaults, never deleted; the RMHBox boards (socket and `/api/rmhbox/leaderboard`) list only `totalGamesPlayed > 0`. The `RMHboxMatchPlayer.userName` copies and the name inside `RMHboxMatch.results` become "Deleted user"; `RMHboxMatch.gameLog` (free-form) is a follow-up. |
| `RmhboxSettingsPreset` | erase | Saved RMHBox game settings. |
| `RmhCharacter` | erase | The member's characters; private (only the owner-scoped character API reads them). |
| `RmhCharacterParty` | erase | Parties the member runs (name, invite code, turn order with the extras' names) are deleted with their membership rows; the players' own characters are untouched. |
| `RmhCharacterPartyMember` | erase | The member's seat in other members' parties (which character, whether they share the full sheet). A turn order may still hold the pseudonymous id of an erased member; readers drop it, and no name is stored there. |
| `RmhCharacterPartyRoll` | erase | The member's rolls for the table in any party, and every roll in a party they run (it goes with the party). A roll stores the user id and the character id, never a name; the view joins the current name. |
| `RmhCodeToken` | erase | Hashed bearer tokens for the rmhcode CLI would stay valid for a tombstone. |
| `RmhStudyProfile` | erase | Focus totals and sessions (RmhStudySession by the cascade); the RMHStudy boards read this table, so the member leaves them. |
| `RmhTubeRoom` | deidentify | A party the member hosts and has not held is closed so it cannot open as the erased account; the room row stays. |
| `RmhTubeRoomRsvp` | erase | Going marks on watch parties (sprint 03). |
| `RmhTubeSubtitle` | erase | Rule 1: subtitle tracks the member added to a queue item are deleted explicitly (sprint 11 16). |
| `RmhTubeUserStats` | erase | Rule 1: the member's own watch statistics; deleted in anonymizeAccount (sprint 08 01). |
| `RmhTubeWatchDay` | erase | Rule 1: the member's per-day minutes; deleted in anonymizeAccount (sprint 08 01). |
| `RmhTubeWatchLater` | erase | Rule 1: the member's own watch-later list. |
| `RmhTypeChallenge` | erase | A challenge is a two-person record with no public trace (s11-12): both sides' rows go when either member is deleted, so the other side's list loses it. The inbox notices that name the member (actorId) go with it. Scope: rows where the member is either side (challengerId or opponentId). |
| `RmhTypeChallengeOptOut` | erase | The member's own switch (a row means challenges are off); nothing about it is public (s11-12). |
| `RmhTypeDailyEntry` | erase | The RMHType daily board orders `wpm` at read; the row going takes the member off it. |
| `RmhTypeGhost` | erase | Rule 1: the member's own best-run progress curves; deleted in anonymizeAccount (sprint 08 11). |
| `RmhTypeKeyStat` | erase | Private per-key counters; no board. |
| `RmhTypeLessonProgress` | erase | Private lesson progress; no board. |
| `RmhTypeProfile` | deidentify | Has children (`RmhTypeMatchPlayer.profile` cascades), so totals and bests are reset to defaults, never deleted; `fetchLeaderboard` already requires `bestWpm > 0`. The `RmhTypeMatchPlayer.userName` copies become "Deleted user". |
| `RmhTypeText` | erase | Rule 1: the member's own saved practice texts; deleted in anonymizeAccount (sprint 10 05). Never on a board. |
| `RmhTypeTextRun` | erase | Rule 1: the member's runs on their saved texts; deleted in anonymizeAccount (sprint 10 05). |
| `Rsvp` | erase | Every RSVP row, after `releaseSeatsOf` has freed seats and promoted the waitlist; attendee lists no longer show a deleted member and past turnout drops by one. |
| `SavedItem` | erase | Rule 1: saved items with a private note; erased before SaveFolder. |
| `SavedReply` | erase | Private saved replies. |
| `SaveFolder` | erase | Rule 1: the member's own save folders; erased after SavedItem, which refers to them. |
| `SavingsGoal` | erase | Private savings goals; no child rows. |
| `ScheduledChatMessage` | erase | Messages held for later would still deliver as the erased account. |
| `ScheduledPost` | erase | Rule 1: drafts and sealed capsules; a post already published from one stays, as posts do. |
| `Session` | erase | Every way to authenticate as the account is destroyed first, so a tombstone can never sign in. |
| `SharedMoment` | erase | A share card of the member's stats snapshotting their name in payload; deleting the row 404s the landing page and OG image. |
| `SignalForgePlayer` | erase | Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy). |
| `SiteIdempotencyKey` | erase | Short-lived; stored responses may hold member data. |
| `SliceDailyEntry` | erase | The Slice It daily board reads at request time; the row going takes the member off it. |
| `SliceRun` | erase | Per-chart boards read at request time; the library shelves cache lists songs, never players. |
| `SliceSetlist` | erase | Private setlists go; the daily and chart boards do not read them. Scope: `isPublic = false`; public setlists are published lists other members open (an open owner decision), they stay under "Deleted user". |
| `SongLeaderboard` | erase | Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy). |
| `SongPlay` | erase | Per-member play counts; no board. `Song.plays` is an anonymous tally and stays (counter rule). |
| `StudioProject` | erase | Cloud copies of Studio projects. |
| `StudioProjectShare` | erase | Shared links to the member's Studio projects; copies already opened live on the openers' devices. |
| `StudyBuddyRequest` | erase | Waiting and past requests; a matched StudyBuddyMatch is keep (shared with the other member) and is untouched. |
| `StudyPlan` | erase | Rule 1: the member's own study plans. |
| `SynapseStormPlayer` | erase | Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy). |
| `SyncTombstone` | erase | Rule 1: ids, kinds and times of what the member deleted, kept 90 days for their own sync clients (keys are revoked anyway); no content. Not exported. |
| `TargetedNoticeDismissal` | erase | Rule 1: which site notices the member dismissed. |
| `TempleOfJoySave` | erase | A game save; no board. |
| `Tf2HudUserBlob` | erase | The member's link to a content-addressed blob other members may share; the blob stays (an orphan sweep is not this feature's). |
| `TrustedContact` | erase | The vouch graph is deleted in both directions (as owner and as someone else's contact). |
| `TwoFactor` | erase | The second factor (encrypted authenticator secret and backup codes) is a way to authenticate as the account, so it goes with the passkeys. |
| `UserAchievement` | erase | Rule 1: the member's achievement progress; a site-wide percentage computed from rows drops by one (accepted). |
| `UserBirthday` | erase | Rule 1: the member's own birthday, shown to no one once the account is gone. |
| `UserBlock` | erase | The member's own mute and block lists (and reposts muted); rows where others blocked or muted them are the others' safety choices and stay. Scope: rows where the member is either side. |
| `UserCard` | erase | The member's trading cards, drop ledger, badges, pinned achievements, library collections and showcase; the cascade never fires. |
| `UserGems` | erase | Gem balance and entries. |
| `UserMute` | erase | The member's own mute and block lists (and reposts muted); rows where others blocked or muted them are the others' safety choices and stay. Scope: rows where the member is either side. |
| `UserPlayLimits` | erase | The member's own staking caps, cool-off and exclusion dates (sprint 04 spending-budget). |
| `UserProfile` | deidentify | Profile PII (display name, bio, location, website, image, profile song) is nulled; the row stays. |
| `UserQuest` | erase | Progress only; rewards already paid stay in the coin ledger. |
| `VegaPlayer` | erase | Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy). |
| `VersecraftProgress` | erase | A game save; no board. |
| `VersecraftSave` | erase | A game save; no board. |
| `VibePage` | deidentify | Vibe pages are remixed and embedded by others, so they move to the shared "Deleted user" owner rather than being erased. |
| `VoidBreakerPlayer` | erase | Per-game player tables and the shared GameStat, erased so a chosen username does not stay on a board (sprint 05 leaderboard-privacy). |
| `Watch` | erase | Subscriptions to things (a feed, a series, a community, build or market watch), not the social graph the `Follow` owner decision covers; notification levels on things, never on people; no counter. |
| `WebhookEndpoint` | erase | Would keep POSTing the account's events to third-party URLs; cascades its queued deliveries. |
| `WishlistEntry` | erase | The private wishlist, price-alert state included; no child rows. |

## Kept on purpose

Kept for a stated reason: a ledger, an audit trail, another member's record, or published content that stays under "Deleted user" as posts do. 145 models.

| Model | Decision | Reason |
| --- | --- | --- |
| `AchievementTip` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `AchievementTipVote` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `AdminAuditLog` | keep | Rule 4: admin audit trail. |
| `AdventClaim` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `AiUsage` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. A row holds the user id, task, prompt id, token counts, cost and time, never text: the RMH Med Schools Q&A (`medschools-qa`) writes no question or answer anywhere else either (`features/medschools/CLAUDE.md`), so its rows are the only trace and carry nothing to erase. |
| `AvailabilityPoll` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `AvailabilityPollResponse` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `BlogComment` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `BotQueuedComment` | keep | Rows of a bot persona (botId), not a member's data; bots are never deleted through member deletion. |
| `BotQueuedPost` | keep | Rows of a bot persona (botId), not a member's data; bots are never deleted through member deletion. |
| `BotReaction` | keep | Rows of a bot persona (botId), not a member's data; bots are never deleted through member deletion. |
| `BuildGrant` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `BuildIssue` | keep | Rules 2 and 3: a published bug report on a build stays under "Deleted user" (as build comments do; the reporter row is anonymised in place, so it keeps no name); the creator's status and the other members' "me too" marks are theirs. |
| `BuildLike` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `BuildUnlock` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `Call` | keep | Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone. |
| `CanvasPlacement` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `Chart` | keep | Rule 3: published content others use stays under "Deleted user". |
| `ChartPack` | keep | Rule 3: published content others use stays under "Deleted user". |
| `ChartReview` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `ChatMember` | keep | Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone. |
| `ChatMessage` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `ChatMessageReaction` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `ChatPin` | keep | Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone. |
| `ChatPollVote` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `CoinStake` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `CoinTransaction` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `Community` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `CommunityAnnouncement` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `CommunityCensusParticipant` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `CommunityChallengeEntry` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `CommunityChallengeVote` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `CommunityGoalPledge` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `CommunityModItem` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `CommunityPageRevision` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `CommunityPinnedPost` | keep | Rule 2: a community's arrangement of its own content; it never shows who pinned. |
| `ComputeGrant` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `ContentAward` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `ContextNote` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `ContextNoteRating` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `CreatorMembership` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `CreatorTier` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `CustomFeedMember` | keep | Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone. |
| `DailyWheelSpin` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `DoctrineAccessLog` | keep | Rule 4: access and incident logs are a security and moderation record. |
| `DoctrineIncidentReport` | keep | Rule 4: access and incident logs are a security and moderation record. |
| `DoctrineReaction` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `ElectionLeague` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `ElectionLeagueMember` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `ElectionRoom` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `EmailCampaign` | keep | Rule 4: an admin's campaign record. |
| `EmailDelivery` | keep | Rule 4: delivery audit for mail already sent. |
| `EmojiPack` | keep | Rule 3: published content others use stays under "Deleted user". |
| `Event` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `FeatureRequest` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `FeatureRequestVote` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `FeatureRestriction` | keep | Rule 4: a moderation action about the member. |
| `FeedAnnouncement` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `FeedAnnouncementPollVote` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `FriendlyChallenge` | keep | Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone. |
| `GameJam` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `GameJamRating` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `GiftExchange` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `GiftExchangeMember` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `GiftMembership` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `GlossaryTerm` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `GroupCall` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `GroupCallMessage` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `GroupCallParticipant` | keep | Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone. |
| `GuestbookEntry` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `KaikaiDebtEntry` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `Kudos` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `LadderInterviewReport` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `LibraryDocument` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `LightsOutBoard` | keep | Rule 3: published content others play stays under "Deleted user". |
| `ListingPurchase` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `ModerationSweep` | keep | Rule 4: the audit trail of an admin moderation action (who removed what from whom, and why); the sweep and its items stay when either member is deleted. Its items hold only ids and a timestamp. |
| `NewsStory` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `NightrailTrick` | keep | Rule 3: published content others use stays under "Deleted user". |
| `NightrailTrickVote` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `PhotoNomination` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `PhotoVote` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `PileOnGuard` | keep | Rule 4: abuse-prevention guard record, not shown to anyone. |
| `Playlist` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `PlaylistCollaborator` | keep | Rule 2: a collaborator slot on another member's playlist; the playlist and its other contributors are unaffected. |
| `Pool` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `PoolContribution` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `PostSeries` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `PostUnlock` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `Prediction` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `PredictionComment` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `PredictionPosition` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `PromoClaim` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `QotdAnswer` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `QotdPrompt` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `RankedChallenge` | keep | Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone. |
| `RedemptionRequest` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `Referral` | keep | Rule 4: referral record that explains reward coins; the other member's record too. |
| `RemixEdge` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `Ride` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `RideMessage` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `RMHarkComment` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `RMHarkCommentLike` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `RMHarkCommentReaction` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `RMHarkCommentRepost` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `RMHarkCommentView` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `RMHarkLike` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `RMHarkPollVote` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `RMHarkReaction` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `RMHarkRepost` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `RMHarkTakeVote` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `RmhboxPack` | keep | Rule 3: published content others use stays under "Deleted user". |
| `RmhboxPackReport` | keep | Rule 4: a report about someone else's pack is a moderation record. |
| `RmhTubeCommentaryTrack` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `RmhTubeQueueItem` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `RmhTubeRoomMember` | keep | Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone. |
| `RmhTubeTimedComment` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `ScheduledGift` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `SecurityEvent` | keep | Rule 4: security audit trail. |
| `SkillEndorsement` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `Song` | keep | Rule 3: published content others use stays under "Deleted user". |
| `SongComment` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `SongLike` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `SpeedrunEntry` | keep | Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone. |
| `Stamp` | keep | Rule 3: published content others use stays under "Deleted user". |
| `StudioChallengeEntry` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `StudioChallengeVote` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `StudyBuddyMatch` | keep | Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone. |
| `Tf2Hud` | keep | Rule 3: published content others use stays under "Deleted user". |
| `Tf2HudLike` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `Tf2Loadout` | keep | Rule 3: published content others use stays under "Deleted user". |
| `Tf2LoadoutLike` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `Tournament` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `TournamentEntrant` | keep | Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone. |
| `TranslationSuggestion` | keep | Rules 2 and 3: published or shared content that other members see stays under "Deleted user" (as posts do); another member's record on it is not ours to remove. |
| `TranslationVote` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `UserBuild` | keep | Rule 3: published content others use stays under "Deleted user". |
| `UserStrike` | keep | Rule 4: strikes are the moderation trail. |
| `UserTheme` | keep | Rule 3: published content others use stays under "Deleted user". |
| `VelumContract` | keep | Rule 2: a record shared with another member (their match, call, membership or entry) that the other side still sees; entries on boards stay as history under the tombstone. |
| `VersecraftSeedListing` | keep | Rule 3: published content others use stays under "Deleted user". |
| `VersecraftSeedRating` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |
| `WagerMatch` | keep | Rule 4: the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. |
| `Webring` | keep | Rule 3: published content others use stays under "Deleted user". |
| `WebringMember` | keep | Rule 2: the member's interaction with someone else's thing, shown to others only as an aggregate (counts go through quiet counts); the row is needed for the aggregate's integrity. |

## Owner decision

An open owner decision from an earlier sprint. Their handling is unchanged and a test pins it until the owner decides. 7 models.

| Model | Decision | Reason |
| --- | --- | --- |
| `FlashcardDeck` | owner | Open owner decision: public decks of a deleted member. Today decks stay and only their folder is cleared; private decks (cards, reviews, clones) are a candidate for a later change. |
| `Follow` | owner | Open owner decision: a deleted member's follows (sprint 05 README). Rows stay today; followEvent history is handled separately. |
| `GameGuide` | owner | Open owner decision: a deleted member's guides (sprint 05 README); rows untouched. |
| `GameJamEntry` | owner | Open owner decision: a deleted member's jam entries (sprint 05 README); entries stay. |
| `GameReview` | owner | Open owner decision: a deleted member's game reviews (sprint 05 README); rows untouched. |
| `GameReviewVote` | owner | Votes on reviews follow the open game-reviews decision; rows untouched. |
| `RmhTubeSubscription` | owner | Subscriptions to a member's channel are the social graph: the open owner decision on a deleted member's follows (as `Follow`); rows untouched. |

## TODO

Not handled yet, each with the reason it was deferred. Each is a later, reviewable change that lowers `TODO_CEILING` (now 4). 4 models.

| Model | Decision | Reason |
| --- | --- | --- |
| `RebarReservation` | todo | Rule 5: a table booking holds name, e-mail and an allergy note (userId is nullable for guests); needs a product call on how long bookings are kept. |
| `Streak` | todo | Rule 1: the member's own progress and owned items (inventory may hold coin purchases); erase candidate after a product call on purchased cosmetics. |
| `UserInventory` | todo | Rule 1: the member's own progress and owned items (inventory may hold coin purchases); erase candidate after a product call on purchased cosmetics. |
| `UserSeasonProgress` | todo | Rule 1: the member's own progress and owned items (inventory may hold coin purchases); erase candidate after a product call on purchased cosmetics. |

## Plain member columns

A model with a column that holds a member's id and no relation to `User` is invisible to the registry above, and no foreign key cascades or nulls it. `PLAIN_MEMBER_COLUMNS` classifies each one with the same decisions plus `not-member` (the column holds something other than a site member's id, such as a Discord id or a worker id); `MEMBER_COLUMN_PATTERN` is the one list of column names that puts a model in this table. `lib/account/__tests__/erasure-plain-columns.test.ts` fails for a model with such a column that is not listed, for an `erase` or `deidentify` entry that `anonymizeAccount` does not carry out, and for a column the entry names that the model does not have. There is no `todo` here. 43 models.

| Model | Columns | Decision | Reason |
| --- | --- | --- | --- |
| `AccountErasureAttempt` | `userId` | keep | The log of the erasure itself: the account id, trigger, start and finish times and the error class name, never a message. It is the proof that the erasure ran and `finalizeDueDeletions` deletes it after 90 days. |
| `BlogPost` | `updatedById` | deidentify | The Log stays (it is the site's); the editor who last saved it is nulled (`updatedById` is optional), in the same step as `BlogPostRevision`. |
| `BlogPostRevision` | `authorId` | deidentify | Log history stays; the editor reference is nulled (`authorId` is optional). |
| `BotWorkerSettings` | `updatedById` | deidentify | The single settings row of the bot worker stays; the admin who last saved it is nulled (`updatedById` is optional; nothing reads it). |
| `CanvasEvent` | `createdById` | deidentify | Content made by a moderator or staff member that keeps serving its community or the site: the id is replaced by the shared deleted-user id (`DELETED_USER_ID`); nothing reads the column to show a person. |
| `ChatRemoval` | `userId` | erase | The member's own "removed from this chat" marks. They exist only to stop an invite link bringing the member back; an erased account cannot be brought back. |
| `CommunityCensus` | `createdById` | deidentify | Content made by a moderator or staff member that keeps serving its community or the site: the id is replaced by the shared deleted-user id (`DELETED_USER_ID`); nothing reads the column to show a person. |
| `CommunityChallenge` | `createdById` | deidentify | Content made by a moderator or staff member that keeps serving its community or the site: the id is replaced by the shared deleted-user id (`DELETED_USER_ID`); nothing reads the column to show a person. |
| `CommunityGoal` | `createdById` | deidentify | Content made by a moderator or staff member that keeps serving its community or the site: the id is replaced by the shared deleted-user id (`DELETED_USER_ID`); nothing reads the column to show a person. |
| `CommunityMemberEvent` | `userId` | deidentify | The membership history keeps its counts and loses the person: `userId` is optional and is nulled (sprint 03 15). |
| `CommunityMemberNote` | `subjectId`, `authorId`, `deletedById` | erase and deidentify | A moderator's note about a member is the moderators' record, so a note the erased member wrote stays without its author; a note about the erased member is theirs to have gone (sprint 06 02). This changes the default of `keep`: the code already did both. The open owner decision about moderator notes in the export is not touched. Scope: notes about the member (`subjectId`); where the member wrote or deleted a note about someone else, the reference is nulled and the note stays. |
| `CommunityModAction` | `actorId`, `targetUserId` | deidentify | The mod log keeps the action as "a deleted member" with the moderator's own reason text: both columns are optional and are nulled (sprint 03 14). |
| `DiscordAlexCaretaker` | `userId` | not-member | A Discord user id (the caretaking tally of the Discord bot), not a site account; the Discord bot's own data policy covers it. |
| `DiscordChatSession` | `discordUserId` | not-member | A Discord user id (the bot's chat session), not a site account; the Discord bot's own data policy covers it. |
| `DoctrineIncident` | `firstReporterId` | deidentify | The incident stays as the game's record; who reported it first is nulled (`firstReporterId` is optional and no reader shows it). |
| `DoctrineSafehouseContent` | `authorId` | keep | Rules 2 and 3: published content stays under "Deleted user" (as posts do); the column points at the anonymised account, which names nobody. |
| `EventOccurrenceOverride` | `createdById` | deidentify | The override is event data and stays; the member who made it is nulled (`createdById` is optional). The events of a deleted host are handled as they are. |
| `EventUpdate` | `authorId` | deidentify | An event update is event content and stays; where the erased member wrote it the author is nulled (`authorId` is optional). This changes the default of `keep`: the code already nulled it. |
| `FollowEvent` | `followerId`, `followingId` | erase and deidentify | The audience log: the member's own audience history goes, and a gain or loss another member caused loses the person who caused it (`deleteFollowEventsFor`, `lib/social/follow-events.server.ts`). Scope: events where the member was followed (`followingId`); events where they were the follower keep their count and take the deleted-user id. |
| `LadderReviewTask` | `resolvedById` | deidentify | The review task is the ladder pipeline's record; the admin who resolved it is nulled (`resolvedById` is optional). |
| `LadderWorkerLease` | `ownerId` | not-member | A worker process id (the lease holder), not a site account. |
| `LinkDomainRule` | `addedById` | deidentify | Content made by a moderator or staff member that keeps serving its community or the site: the id is replaced by the shared deleted-user id (`DELETED_USER_ID`); nothing reads the column to show a person. |
| `ModMacro` | `createdById` | deidentify | Content made by a moderator or staff member that keeps serving its community or the site: the id is replaced by the shared deleted-user id (`DELETED_USER_ID`); nothing reads the column to show a person. |
| `PostLifecycle` | `userId` | keep | The row stays with its post, which stays under "Deleted user" (`RMHark`: deidentify); its expiry still applies to the post. |
| `ReadingHighlightPassage` | `userId` | cascade | Goes with a private highlight when `ReadingHighlight` is erased (`onDelete: Cascade`); the rows of a public highlight stay with it, as published content. Parent: `ReadingHighlight`. |
| `ReleaseNote` | `authorId` | keep | Rules 2 and 3: published content stays under "Deleted user" (as posts do); the column points at the anonymised account, which names nobody. |
| `RMHboxMatch` | `winnerUserId` | deidentify | The match stays for its other players; the winner id is nulled (`winnerUserId` is optional; the player rows already say "Deleted user" and the snapshots are renamed by `scrubMatchSnapshots`). |
| `RMHboxMatchPlayer` | `userId` | deidentify | A row in a shared match: the copied name becomes "Deleted user" and the row stays (`userId` is required and part of a unique key with the match). |
| `RmhStudySession` | `userId` | cascade | Goes with the profile (`onDelete: Cascade`); the RMHStudy boards read the profile, so the member leaves them. Parent: `RmhStudyProfile`. |
| `RmhTubeChatMessage` | `userId` | deidentify | Messages in every room lose their name (the text stays as the room's history) (sprint 13 06). |
| `RmhTypeMatch` | `winnerUserId` | deidentify | The match stays for its other players; the winner id is nulled (`winnerUserId` is optional; the player rows already say "Deleted user"). |
| `RmhTypeMatchPlayer` | `userId` | deidentify | A row in a shared match: the copied name becomes "Deleted user" and the row stays (`userId` is required and part of a unique key with the match). |
| `SecurityReport` | `userId` | deidentify | The report stays for the security record with its text and status; the member's id, the name and e-mail they gave and the address hash are nulled (all four are optional). |
| `SSLobby` | `hostUserId` | deidentify | The lobby keeps its numbers; the host id becomes `deleted:<row id>` (a tombstone that cannot collide; sprint 14 03; raw SQL, so the row id can be part of the value). |
| `SSLobbyMember` | `userId` | deidentify | The seat keeps its numbers; the id becomes `deleted:<row id>` (unique with the lobby, so the tombstone carries the row id) and the name "Deleted user" (sprint 14 03). |
| `SSPlayerMatch` | `userId` | deidentify | The match keeps its numbers; the id becomes `deleted:<row id>` (unique with the match, so the tombstone carries the row id) and the name "Deleted user" (sprint 14 03). |
| `StudioChallenge` | `createdById` | deidentify | Content made by a moderator or staff member that keeps serving its community or the site: the id is replaced by the shared deleted-user id (`DELETED_USER_ID`); nothing reads the column to show a person. |
| `StudioProjectRevision` | `userId` | erase | Every earlier version of the member's Studio projects, deleted by `studioHistoryErasureOps` (sprint 07 14) without waiting for the project's cascade, which never fires. This changes the default of `cascade`: the code already erased it directly. |
| `StudioProjectShareOpen` | `userId` | erase | The opened marks the member left on other members' shares (sprint 11 07); the member's own shares go too. |
| `Subscription` | `referenceId` | keep | Rule 4: the Stripe plugin's billing record (plan, status, period, Stripe ids), kept for accounting like the coin ledger. `cancelRemainingBilling` reads it to stop billing before the transaction; `referenceId` points at the anonymised account, which names nobody. |
| `TargetedNotice` | `createdById` | deidentify | Content made by a moderator or staff member that keeps serving its community or the site: the column is optional and is set to null. |
| `TournamentMatch` | `proposedById`, `claimedById`, `disputedById` | deidentify | The match stays for the bracket; the member as proposer, claimant or disputer is nulled with the proposal and the dispute note (sprint 06 `matchScheduleErasureOps`, sprint 08 `matchResultErasureOps`). |
| `TournamentPayout` | `userId` | keep | Rule 4: a ledger row of coins paid for a placement; the coin ledger, payouts, purchases and stakes stay for accounting and the other party's record. (`userId` is a plain historical reference, unique with the tournament.) |
