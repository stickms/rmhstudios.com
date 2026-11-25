/**
 * The content-report vocabulary as plain data: what can be reported and why. Split from
 * `report-schema.ts` so code the shell reaches (a route's `validateSearch`) can read the lists
 * without pulling zod into the entry bundle; the schema file re-exports everything here.
 */

/**
 * What can be reported. `dm` is here and deliberately has no owner lookup in
 * the route — a DM's author is not resolvable from the id alone.
 *
 * `song` is Slice It's uploads (`L9`). Uploads are user-supplied audio, which
 * the catalog already declares with `descriptors: ['user-content']`, and the
 * game had no path to this queue at all — so the one category of content on the
 * site most likely to attract a copyright claim was the one with no report
 * button.
 */
export const REPORT_ENTITY_TYPES = [
  'rmhark',
  'comment',
  'user',
  'build',
  'dm',
  'song',
  // P05: profile stamps (P5) and member-run webrings (P6) — user-made names and
  // images that appear on other people's pages, so they need a report path.
  'stamp',
  'webring',
  // P22: RMHLadder community interview reports (F8).
  'ladder-interview',
  // RMH Music Phase 6: a Daily board score (the `MusicSprintDaily` id) and a
  // shared result link (`lib/rmhmusic/learn/moderation.server.ts`).
  'music-score',
  'music-share',
  // s06-07: written feedback on a game jam entry (the `GameJamFeedback` id); reported by the entry's team.
  'jam-feedback',
  // s06-14: a comment on a User Build (the `BuildComment` id).
  'build-comment',
  // s10-09: a bug report on a User Build (the `BuildIssue` id).
  'build-issue',
  // Sprint 11 (docs/autonomous/sprint-11/plan.md §Anchors)
  // s11-05 lights-out-maker
  // A member-made Lights Out board (the `LightsOutBoard` id); the title is member text.
  'lights-out-board',
  // s11-07 studio-share
  // s11-07: a shared Studio project; the entity id is its share token (the name is member text).
  'studio-share',
  // s12-16 member-reports
  // A member's Connections grid (`ConnectionsGrid` id), public flashcard deck (`FlashcardDeck` id), public AI persona
  // (`AiPersona` id) and community home listing (`HomeListing` id); each title or name is member text.
  'connections-grid',
  'study-deck',
  'persona',
  'home-listing',

  // Sprint 13 (docs/autonomous/sprint-13/plan.md §Anchors)
  // s13-06 tube-chat-reports
  // A message in an RMHTube room (the `RmhTubeChatMessage` id); only a member of the room may report it.
  'tube-chat',

  // s13-15 rideshare-safety
  // A trip (the `Ride` id); only its rider or driver may report it, about the other party. Not removable.
  'ride',

  // s13-16 pack-reports
  // A member's RMHBox prompt pack (the `RmhboxPack` id); a removal hides it for good (`moderatedAt`).
  'rmhbox-pack',

  // s13-17 dm-reports
  // `dm` (above) is a message in a direct or group conversation; it is now filed from the message menu.

  // Sprint 14 (docs/autonomous/sprint-14/plan.md §Anchors)
  // s14-07 slice-reports
  // A comment on a Slice It song (the `SongComment` id); `song` (above) is the song itself, filed from its details.
  'song-comment',

  // s14-08 game-reports
  // A member's game review (`GameReview` id), guide (a published `GameGuide`), discussion (`GameThread`), reply
  // (`GameThreadPost`) and achievement tip (`AchievementTip`): lib/games/moderation.ts.
  'game-review',
  'game-guide',
  'game-thread',
  'game-thread-post',
  'achievement-tip',

  // s14-09 profile-reports
  // An account that is pretending to be another (the accused account's id). Filed only from the profile's impersonation
  // form (`POST /api/handles/impersonation`), never through the generic report route. Not removable.
  'impersonation',

  // s14-10 tube-room-reports
  // A room or watch party (the room code). Filed from the room's header and the party page; the report is about the host.
  'tube-room',
] as const;
export type ReportEntityType = (typeof REPORT_ENTITY_TYPES)[number];

/**
 * s12-16: the member-made, public items a report is about (not a post or a profile). A report of one is refused when
 * the item is missing, private, already taken down or has no member author (a scraped listing), and when it is the
 * reporter's own.
 */
export const MEMBER_ITEM_REPORT_TYPES: ReadonlySet<string> = new Set([
  'connections-grid',
  'study-deck',
  'persona',
  'home-listing',

  // Sprint 14 (docs/autonomous/sprint-14/plan.md §Anchors)
  // s14-07 slice-reports
  // A Slice It song (`song`, above) and a comment on one: public, not taken down, and never the reporter's own.
  'song',
  'song-comment',

  // s14-08 game-reports
  // Public, by someone else and not already removed: the report flow refuses anything else (`gameContentOwner`).
  'game-review',
  'game-guide',
  'game-thread',
  'game-thread-post',
  'achievement-tip',

  // s14-09 profile-reports

  // s14-10 tube-room-reports
  // A public room, or one the reporter is in, that is not already removed and not the reporter's own (`roomReportable`).
  'tube-room',
]);

/**
 * The types the admin page offers "Resolve & remove content" for. Each one has a
 * branch in `takedownReportedContent` (`lib/moderation/triage.server.ts`);
 * `lib/moderation/__tests__/music-reports.test.ts` holds that, so the button can
 * never resolve a report while leaving the content up.
 */
export const REMOVABLE_REPORT_ENTITY_TYPES: readonly ReportEntityType[] = [
  'rmhark',
  'comment',
  'stamp',
  'webring',
  'ladder-interview',
  'music-score',
  'music-share',
  'jam-feedback',
  'build-comment',
  'build-issue',
  // Sprint 11 (docs/autonomous/sprint-11/plan.md §Anchors)
  // s11-05 lights-out-maker
  'lights-out-board',
  // s11-07 studio-share
  'studio-share',
  // s12-16 member-reports
  'connections-grid',
  'study-deck',
  'persona',
  'home-listing',

  // Sprint 13 (docs/autonomous/sprint-13/plan.md §Anchors)
  // s13-06 tube-chat-reports
  'tube-chat',

  // s13-15 rideshare-safety

  // s13-16 pack-reports
  'rmhbox-pack',

  // s13-17 dm-reports
  'dm',

  // Sprint 14 (docs/autonomous/sprint-14/plan.md §Anchors)
  // s14-07 slice-reports
  // A taken-down song (`takeDownSong`: final, the audio is deleted, the scores stay) and a deleted comment.
  'song',
  'song-comment',

  // s14-08 game-reports
  // A review, guide and tip are stamped `moderatedAt` (final, the author cannot undo it); a thread and a reply are deleted.
  'game-review',
  'game-guide',
  'game-thread',
  'game-thread-post',
  'achievement-tip',

  // s14-09 profile-reports

  // s14-10 tube-room-reports
  // A removal stamps `moderatedAt` and `closedAt` and ends the running room (`takeDownRoom`).
  'tube-room',
];

/**
 * The reason taxonomy. Ordered as the dialog presents it: the categories that
 * are reported most often first, `OTHER` last.
 */
export const REPORT_REASONS = [
  'SPAM',
  'HARASSMENT',
  'HATE',
  'VIOLENCE',
  'SEXUAL',
  'SELF_HARM',
  'MISINFORMATION',
  'ILLEGAL',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
