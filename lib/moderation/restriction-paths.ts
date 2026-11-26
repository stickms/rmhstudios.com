/**
 * s14-17: where a moderator's timeout is enforced.
 *
 * A timeout (`FeatureRestriction`: `post`, `comment`, `message`, ...) holds only where the write path asks. This
 * file is the list of those paths, held by two source scans in `lib/moderation/__tests__/restriction-paths.test.ts`:
 *
 *  1. every path listed here really calls a check naming its feature (`restrictionResponse(`, `restrictionMessage(`,
 *     `isRestricted(`, `isRestrictedIn(` or `isMemberRestricted(`), or calls the named guard whose definition does;
 *  2. every file that creates a row of member-written text (`MEMBER_TEXT_MODELS`) is listed in
 *     `RESTRICTION_WRITERS` and says what enforces the timeout for it, so a new writer that skips the check fails.
 *
 * Which feature gates what: a reply-like or public text write checks `comment` ("Replying"); a chat line checks
 * `message` ("Messages and chats"); a post checks `post`. Votes, reactions, reports and what only the writer reads
 * (notes, drafts) are not gated.
 */

export type EnforcedFeature = 'post' | 'comment' | 'message' | 'community' | 'space' | 'vibe' | 'persona';

export interface RestrictionPath {
  /** Repo-relative source file. */
  path: string;
  feature: EnforcedFeature;
  /**
   * A guard function this file calls instead of a direct check. The file defining it (`definedIn`) must itself be
   * listed with the same feature.
   */
  via?: { guard: string; definedIn: string };
}

export const RESTRICTION_ENFORCEMENT_PATHS: readonly RestrictionPath[] = [
  // ── Posts ────────────────────────────────────────────────────────────────
  { path: 'lib/feed/api/rmharks.server.ts', feature: 'post' },
  { path: 'lib/feed/api/rmharks.thread.server.ts', feature: 'post' },
  { path: 'lib/scheduled/api/scheduled.$id.publish.server.ts', feature: 'post' },
  // The one place every other publisher shares: the due-post pass, the developer API's publish, recurring posts,
  // read-alongs and time capsules all call `publishScheduledPost`.
  { path: 'lib/scheduled/publish.server.ts', feature: 'post' },
  { path: 'lib/api/v1/scheduled.server.ts', feature: 'post' },
  { path: 'app/routes/api/v1/posts.ts', feature: 'post' },

  // ── Replies and public text ──────────────────────────────────────────────
  { path: 'lib/feed/api/rmharks.$id.comment.server.ts', feature: 'comment' },
  { path: 'app/routes/api/v1/posts/$id/comments.ts', feature: 'comment' },
  { path: 'lib/blog/blog-comments.server.ts', feature: 'comment' },
  {
    path: 'lib/blog/api/blog.$slug.comments.server.ts',
    feature: 'comment',
    via: { guard: 'commentBlockedResponse', definedIn: 'lib/blog/blog-comments.server.ts' },
  },
  { path: 'lib/api/routes/user-builds.$id.comments.server.ts', feature: 'comment' },
  { path: 'lib/builds/api/builds.$id.issues.server.ts', feature: 'comment' },
  { path: 'features/slice-it/api/slice-it.songs.$id.comments.server.ts', feature: 'comment' },
  { path: 'features/slice-it/api/slice-it.charts.$id.reviews.server.ts', feature: 'comment' },
  { path: 'lib/games/api/games.$id.review.server.ts', feature: 'comment' },
  { path: 'lib/games/api/guides.server.ts', feature: 'comment' },
  { path: 'lib/games/api/guides.$id.server.ts', feature: 'comment' },
  { path: 'lib/cards/api/games.hub.thread.server.ts', feature: 'comment' },
  { path: 'lib/games/api/games.hub.post.server.ts', feature: 'comment' },
  { path: 'lib/arcade/api/arcade.tips.server.ts', feature: 'comment' },
  { path: 'lib/guestbook/api/profile.$id.guestbook.server.ts', feature: 'comment' },
  // Jam feedback is written with a rating; the check runs when the rating carries written feedback.
  { path: 'lib/competitive/api/jams.$slug.rate.server.ts', feature: 'comment' },
  { path: 'lib/predictions/api/predictions.$id.comments.server.ts', feature: 'comment' },
  { path: 'lib/rmhtube/api/rmhtube.timed-comments.server.ts', feature: 'comment' },
  { path: 'lib/rmhtube/api/rmhtube.commentary.server.ts', feature: 'comment' },
  { path: 'lib/study/api/study.decks.$id.suggestions.server.ts', feature: 'comment' },
  { path: 'lib/context-notes/api/context-notes.server.ts', feature: 'comment' },
  { path: 'lib/requests/api/requests.server.ts', feature: 'comment' },

  // ── Messages and chats ───────────────────────────────────────────────────
  { path: 'lib/messages/send.server.ts', feature: 'message' },
  { path: 'lib/messages/api/messages.server.ts', feature: 'message' },
  { path: 'lib/messages/api/messages.$conversationId.voice.server.ts', feature: 'message' },
  { path: 'lib/messages/scheduled.server.ts', feature: 'message' },
  {
    path: 'lib/group-chat/api/group-chats.$id.messages.server.ts',
    feature: 'message',
    via: { guard: 'guardGroupAccount', definedIn: 'lib/messages/send.server.ts' },
  },
  { path: 'lib/rideshare/api/rideshare.rides.$id.messages.server.ts', feature: 'message' },
  // An edit replaces what the other side reads.
  { path: 'lib/messages/api/messages.$conversationId.edit.server.ts', feature: 'message' },
  // The chat extras that post a line into a DM or group: thread replies, checklists, commands, forwards.
  { path: 'lib/chat-plus/route-helpers.server.ts', feature: 'message' },
  {
    path: 'lib/chat-plus/api/chats.$kind.$id.thread.$messageId.server.ts',
    feature: 'message',
    via: { guard: 'requireChatText', definedIn: 'lib/chat-plus/route-helpers.server.ts' },
  },
  {
    path: 'lib/chat-plus/api/chats.$kind.$id.checklist.server.ts',
    feature: 'message',
    via: { guard: 'requireChatText', definedIn: 'lib/chat-plus/route-helpers.server.ts' },
  },
  {
    path: 'lib/chat-plus/api/chats.$kind.$id.command.server.ts',
    feature: 'message',
    via: { guard: 'requireChatText', definedIn: 'lib/chat-plus/route-helpers.server.ts' },
  },
  { path: 'lib/chat-plus/api/chats.forward.server.ts', feature: 'message' },
  // A Space's chat (`postSpaceMessage`; checked where it writes, so any route that calls it inherits the check).
  { path: 'lib/spaces.server.ts', feature: 'message' },
  // The socket hubs read the timeout through `isRestrictedIn` (`lib/moderation/restrictions-core.ts`).
  { path: 'server/rmhtube/chat-handler.ts', feature: 'message' },
  { path: 'server/rmhbox/chat.ts', feature: 'message' },
  { path: 'server/socket-server/handlers/rmhstudy.ts', feature: 'message' },
  { path: 'server/rmhbox/restrictions.ts', feature: 'message' },
  {
    path: 'server/rmhbox/minigames/identity-crisis/handler.ts',
    feature: 'message',
    via: { guard: 'loadMessageRestriction', definedIn: 'server/rmhbox/restrictions.ts' },
  },

  // ── Other features (not text others read, listed so every check has a home) ──
  { path: 'lib/communities/api/communities.server.ts', feature: 'community' },
  { path: 'lib/spaces/api/spaces.server.ts', feature: 'space' },
  { path: 'app/routes/api/vibe/stream.ts', feature: 'vibe' },
  { path: 'lib/personas/api/personas.server.ts', feature: 'persona' },

  // Sprint 15 (docs/autonomous/sprint-15/plan.md §Anchors)
  // s15-13 jam-suggestions
  { path: 'lib/competitive/api/jams.$slug.suggestions.server.ts', feature: 'comment' },

  // s15-17 more-packs
  { path: 'lib/rmhbox/api/rmhbox.packs.server.ts', feature: 'comment' },
];

/** The Prisma client accessors of rows that hold text one member wrote for others to read. */
export const MEMBER_TEXT_MODELS: readonly string[] = [
  'achievementTip',
  'blogComment',
  'buildComment',
  'buildIssue',
  'chartReview',
  'chatMessage',
  'contextNote',
  'deckSuggestion',
  'featureRequest',
  'gameGuide',
  'gameJamFeedback',
  'gameReview',
  'gameThread',
  'gameThreadPost',
  'groupCallMessage',
  'guestbookEntry',
  'predictionComment',
  'rMHarkComment',
  'rideMessage',
  'scheduledChatMessage',
  'rmhTubeChatMessage',
  'rmhTubeCommentaryTrack',
  'rmhTubeTimedComment',
  'songComment',

  // Sprint 15 (docs/autonomous/sprint-15/plan.md §Anchors)
  // s15-13 jam-suggestions
  'gameJamThemeSuggestion',

  // s15-17 more-packs
];

export interface RestrictionWriter {
  /** Repo-relative source file that creates rows of `models`. */
  path: string;
  models: readonly string[];
  /** The listed paths whose checks cover this writer (itself, or the routes that call it), or why none applies. */
  enforcedBy: { paths: readonly string[] } | { exempt: string };
}

export const RESTRICTION_WRITERS: readonly RestrictionWriter[] = [
  {
    path: 'lib/builds/comments.server.ts',
    models: ['buildComment'],
    enforcedBy: { paths: ['lib/api/routes/user-builds.$id.comments.server.ts'] },
  },
  {
    path: 'lib/builds/issues.server.ts',
    models: ['buildIssue'],
    enforcedBy: { paths: ['lib/builds/api/builds.$id.issues.server.ts'] },
  },
  {
    path: 'lib/guestbook/guestbook.server.ts',
    models: ['guestbookEntry'],
    enforcedBy: { paths: ['lib/guestbook/api/profile.$id.guestbook.server.ts'] },
  },
  {
    path: 'lib/rmhtube/watch.server.ts',
    models: ['rmhTubeTimedComment', 'rmhTubeCommentaryTrack'],
    enforcedBy: {
      paths: ['lib/rmhtube/api/rmhtube.timed-comments.server.ts', 'lib/rmhtube/api/rmhtube.commentary.server.ts'],
    },
  },
  {
    // `createComment` is called by the site's reply route and the developer API (both listed), and by AutoMod when a
    // moderator approves a comment it held: that one was checked when its author sent it.
    path: 'lib/social/engagement.server.ts',
    models: ['rMHarkComment'],
    enforcedBy: { paths: ['lib/feed/api/rmharks.$id.comment.server.ts', 'app/routes/api/v1/posts/$id/comments.ts'] },
  },
  {
    path: 'lib/forecasting/forecasting.server.ts',
    models: ['predictionComment'],
    enforcedBy: { paths: ['lib/predictions/api/predictions.$id.comments.server.ts'] },
  },
  {
    path: 'lib/blog/api/blog.$slug.comments.server.ts',
    models: ['blogComment'],
    enforcedBy: { paths: ['lib/blog/api/blog.$slug.comments.server.ts'] },
  },
  {
    path: 'lib/competitive/jam-feedback.server.ts',
    models: ['gameJamFeedback'],
    enforcedBy: { paths: ['lib/competitive/api/jams.$slug.rate.server.ts'] },
  },
  {
    path: 'lib/rideshare/api/rideshare.rides.$id.messages.server.ts',
    models: ['rideMessage'],
    enforcedBy: { paths: ['lib/rideshare/api/rideshare.rides.$id.messages.server.ts'] },
  },
  {
    path: 'lib/arcade/api/arcade.tips.server.ts',
    models: ['achievementTip'],
    enforcedBy: { paths: ['lib/arcade/api/arcade.tips.server.ts'] },
  },
  {
    path: 'lib/games/meta.server.ts',
    models: ['gameReview', 'gameGuide'],
    // Reviews are written by `games.$id.review`, guides by `guides` (and edited by `guides.$id`).
    enforcedBy: {
      paths: [
        'lib/games/api/games.$id.review.server.ts',
        'lib/games/api/guides.server.ts',
        'lib/games/api/guides.$id.server.ts',
      ],
    },
  },
  {
    path: 'lib/games/hub.server.ts',
    models: ['gameThread', 'gameThreadPost'],
    enforcedBy: { paths: ['lib/cards/api/games.hub.thread.server.ts', 'lib/games/api/games.hub.post.server.ts'] },
  },
  {
    path: 'lib/study/suggestions.server.ts',
    models: ['deckSuggestion'],
    enforcedBy: { paths: ['lib/study/api/study.decks.$id.suggestions.server.ts'] },
  },
  {
    path: 'features/slice-it/api/slice-it.songs.$id.comments.server.ts',
    models: ['songComment'],
    enforcedBy: { paths: ['features/slice-it/api/slice-it.songs.$id.comments.server.ts'] },
  },
  {
    path: 'features/slice-it/api/slice-it.charts.$id.reviews.server.ts',
    models: ['chartReview'],
    enforcedBy: { paths: ['features/slice-it/api/slice-it.charts.$id.reviews.server.ts'] },
  },
  {
    path: 'server/rmhtube/chat-handler.ts',
    models: ['rmhTubeChatMessage'],
    enforcedBy: { paths: ['server/rmhtube/chat-handler.ts'] },
  },
  {
    path: 'lib/rmhark-ai/bot-queue.server.ts',
    models: ['rMHarkComment'],
    enforcedBy: { exempt: 'The RMHark bot accounts reply, not a member; there is no member to time out.' },
  },
  {
    path: 'lib/messages/send.server.ts',
    models: ['chatMessage'],
    enforcedBy: { paths: ['lib/messages/send.server.ts'] },
  },
  {
    path: 'lib/messages/api/messages.server.ts',
    models: ['chatMessage'],
    enforcedBy: { paths: ['lib/messages/api/messages.server.ts'] },
  },
  {
    path: 'lib/messages/voice.server.ts',
    models: ['chatMessage'],
    enforcedBy: { paths: ['lib/messages/api/messages.$conversationId.voice.server.ts'] },
  },
  {
    path: 'lib/messages/scheduled.server.ts',
    models: ['scheduledChatMessage'],
    enforcedBy: { paths: ['lib/messages/scheduled.server.ts'] },
  },
  {
    // `postChatMessage` is called by the chat extras (all listed) and by lines the site writes for a member who is not
    // typing them: an away reply, a call's auto-reply, a calendar poll's notice.
    path: 'lib/chat-plus/post.server.ts',
    models: ['chatMessage'],
    enforcedBy: {
      paths: [
        'lib/chat-plus/api/chats.$kind.$id.thread.$messageId.server.ts',
        'lib/chat-plus/api/chats.$kind.$id.checklist.server.ts',
        'lib/chat-plus/api/chats.$kind.$id.command.server.ts',
        'lib/chat-plus/api/chats.forward.server.ts',
      ],
    },
  },
  {
    path: 'lib/spaces.server.ts',
    models: ['groupCallMessage'],
    enforcedBy: { paths: ['lib/spaces.server.ts'] },
  },
  {
    path: 'lib/context-notes/notes.server.ts',
    models: ['contextNote'],
    enforcedBy: { paths: ['lib/context-notes/api/context-notes.server.ts'] },
  },
  {
    path: 'lib/requests/board.server.ts',
    models: ['featureRequest'],
    enforcedBy: { paths: ['lib/requests/api/requests.server.ts'] },
  },
  {
    path: 'lib/rmhark-ai/bot-worker.server.ts',
    models: ['rMHarkComment', 'chatMessage'],
    enforcedBy: { exempt: 'The RMHark bot accounts reply, not a member; there is no member to time out.' },
  },

  // Sprint 15 (docs/autonomous/sprint-15/plan.md §Anchors)
  // s15-13 jam-suggestions
  {
    path: 'lib/competitive/jam-suggestions.server.ts',
    models: ['gameJamThemeSuggestion'],
    enforcedBy: { paths: ['lib/competitive/api/jams.$slug.suggestions.server.ts'] },
  },

  // s15-17 more-packs
];
