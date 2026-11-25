/**
 * Who may do what to a flashcard deck (s11-10), the pure half: the roles, the limits on editors, and the registry of
 * every server file that filters decks by their owner.
 *
 * A deck has one owner (`FlashcardDeck.userId`) and up to ten editors (`DeckEditor`, accepted rows only). The one rule
 * is `deckRole(userId, deckId)` in `deck-access.server.ts`. A file that must let an editor in goes through it (or
 * through `studiedDeckWhere`, its filter form); a file that is the owner's alone says so here, with the reason.
 * `lib/study/__tests__/deck-access-registry.test.ts` scans the source tree: a file that filters decks by `userId` and is
 * in neither list fails it, so a new reader or writer cannot forget editors, and cannot hand one an owner's power.
 */

export type DeckRole = 'owner' | 'editor';

/** Editors one deck may have (accepted and pending invitations together). */
export const MAX_DECK_EDITORS = 10;
/** Invitations one owner may have waiting, across all their decks. */
export const MAX_PENDING_DECK_INVITES = 50;
/** Days an invitation stays open. */
export const DECK_INVITE_DAYS = 14;
/** How long an invitation stays open, in milliseconds. */
export const DECK_INVITE_MS = DECK_INVITE_DAYS * 86_400_000;

/** The `DeckEditor.status` values. */
export type DeckEditorStatus = 'pending' | 'accepted';

/** Whether a pending invitation made at `createdAt` is still open at `now`. */
export const inviteOpen = (createdAt: Date, now: Date = new Date()): boolean =>
  now.getTime() - createdAt.getTime() < DECK_INVITE_MS;

/** The instant before which a pending invitation has lapsed (a `createdAt` older than this is expired). */
export const inviteCutoff = (now: Date = new Date()): Date => new Date(now.getTime() - DECK_INVITE_MS);

/** One server file that filters decks by their owner, and how it treats an editor. */
export interface DeckAccessEntry {
  /**
   * `role`: the file lets an accepted editor in where an editor may act, through `deckRole`, `requireDeckRole`,
   * `studiedDeckWhere` or `readableDeckWhere`, and says in `reason` what stays the owner's.
   * `owner-only`: the file serves the owner alone; an editor is refused (not found) because the deck's `userId` is the
   * condition, and `reason` says why.
   */
  access: 'role' | 'owner-only';
  reason: string;
}

/**
 * Every server file that filters `flashcardDeck` or a card's `deck:` by `userId`. Keys are repository paths.
 * Adding a file here is a decision a reviewer reads; the scan fails the file that is missing.
 */
export const DECK_ACCESS_PATHS: Record<string, DeckAccessEntry> = {
  'lib/study.server.ts': {
    access: 'role',
    reason:
      'listDecks adds "Shared with you"; getDeck and getTestCards serve an editor the cards and study. Folder, pace, notify, suggestions and every sound field stay the owner\'s alone (`isOwner`).',
  },
  'lib/study/deck-access.server.ts': {
    access: 'role',
    reason: 'The one rule itself: deckRole and the filters built on it.',
  },
  'lib/study/deck-editors.server.ts': {
    access: 'role',
    reason:
      'Inviting, removing and listing are the owner\'s (deckRole is "owner"); accepting and leaving are the invitee\'s own row.',
  },
  'lib/study/deck-editor.server.ts': {
    access: 'role',
    reason:
      "Card writes (add, edit, delete, reorder, import) accept an editor; createDeck, deleteDeck, updateDeck (title, description, visibility, suggestions) and the developer API upsert stay the owner's. An editor's sound fields are dropped before any write.",
  },
  'lib/study/queue.server.ts': {
    access: 'role',
    reason:
      "An editor studies the deck on their own FlashcardReview rows (queue, due counts, suspension). The deck's pace is the owner's: an editor's queue ignores it. Sounds go to the owner only.",
  },
  'lib/study/stats.server.ts': {
    access: 'role',
    reason: "An editor's statistics list the decks they edit, from their own reviews.",
  },
  'lib/study/card-images.server.ts': {
    access: 'role',
    reason:
      "A picture an editor adds is claimed under the editor's own upload; a picture already on a card of a deck they edit may be reused. The per-member picture cap counts cards in decks they may edit. The export is the owner's.",
  },
  'lib/study/tests.server.ts': {
    access: 'role',
    reason: 'An editor may take and record a practice test on the deck they edit; the history is their own.',
  },
  'lib/study/reminders.server.ts': {
    access: 'role',
    reason: 'A reminder counts due cards in every deck the member studies, shared decks included.',
  },
  'lib/study/suggestions.server.ts': {
    access: 'role',
    reason:
      "An editor edits directly, so a suggestion from one is refused like the author's; suggestions go to the owner only, and the decision is the owner's.",
  },
  'lib/study/api/study.decks.$id.review.server.ts': {
    access: 'role',
    reason: "An editor reviews the deck on their own schedule; sounds are the owner's only.",
  },
  'lib/history/resume.server.ts': {
    access: 'role',
    reason:
      "A resume card for a deck is shown only while the member still may read it: a removed editor's old reviews do not name the deck.",
  },
  'lib/api/v1/study.server.ts': {
    access: 'owner-only',
    reason:
      "The developer API lists and edits the key owner's own decks. Reads and card lookups filter by the deck's `userId`, creating cards checks `deckRole` is \"owner\" first, and keyed upserts are owner-only inside `deckEditor.server`, so an editor's key reads and writes nothing of a deck it only edits. The exception is reviewing (s12-12: `reviewQueueFor`, `gradeFor`): the queue and `reviewCard` study a deck on the key owner's own FlashcardReview rows through `canReadDeck`, as the site does.",
  },
  'lib/account/api/account.export.server.ts': {
    access: 'owner-only',
    reason:
      "The data export of the member's own decks and their authored cards (never a sound). The decks they edit, and the invitations they sent, are in the `deckEditors` section of the sprint 11 export.",
  },
  'lib/rmhstudy/quiz-cards.server.ts': {
    access: 'role',
    reason:
      "A room quiz from a private deck goes through deckRole: the owner may show it after confirming, an accepted editor is refused (the deck is the owner's to show to a room), and anyone else gets not found. A public deck is open to any host.",
  },
  'lib/study/highlight-cards.server.ts': {
    access: 'owner-only',
    reason:
      "Cards made from highlights link to the member's private highlights, which only the owner's payload shows; editors add cards by hand or import.",
  },
  'lib/study/pace.server.ts': {
    access: 'owner-only',
    reason:
      "Study pace and the test date are the owner's settings, never an editor's (and never in an editor's payload).",
  },
  'lib/study/folders.server.ts': {
    access: 'owner-only',
    reason: "A folder is the owner's private organisation of their own decks.",
  },
  'lib/study/deck-sync.server.ts': {
    access: 'owner-only',
    reason:
      "Sync serves the holder of a copy; a copy (`clonedFromId` set) takes no editors. An editor's edits reach copies through the deck's `cardsChangedAt`.",
  },
  'lib/study/occlusion.server.ts': {
    access: 'owner-only',
    reason: "The data export of the member's own occlusion cards.",
  },
  'lib/study/card-sound.server.ts': {
    access: 'owner-only',
    reason:
      "A sound is heard by its recorder only. Recording, claiming, the cap, playback and the export all read the recorder's own decks; an editor has none of it.",
  },

  // Sprint 12 (docs/autonomous/sprint-12/plan.md §Anchors)
  // s12-08 deck-ratings
  'lib/study/deck-ratings.server.ts': {
    access: 'owner-only',
    reason:
      "A rating is the rater's own: the owner of a deck and an accepted editor are refused (they made it), and the rater is the holder of a copy (`userId` and `clonedFromId` name the copy). The deck's counters and the export read only the member's own ratings.",
  },

  // s12-09 card-history
  'lib/study/card-history.server.ts': {
    access: 'role',
    reason:
      "A card's history and start-over: a member who may read the deck (canReadDeck), on their own FlashcardReview and log rows only; an editor's or cloner's history is their own and the owner never sees it.",
  },

  // s12-12 api-reviews
  'lib/study/review.server.ts': {
    access: 'role',
    reason:
      'reviewCard, the one grading path of the site route and the developer API: an editor grades a card of a deck they edit on their own FlashcardReview row, and a card of a deck the member may not read is not found.',
  },

  // s12-16 member-reports
  'lib/moderation/my-reports.server.ts': {
    access: 'owner-only',
    reason:
      "A reporter's view of a public deck they reported (its title and link, never its cards): looked up by id, public and not removed, with the deck's author filtered only by the reporter's blocks. No editor is ever the condition.",
  },
  'lib/study/deck-moderation.server.ts': {
    access: 'owner-only',
    reason:
      "A moderator's takedown of a public deck by its id (an admin action, never a member's), and the report route's lookup of who owns a public deck: the deck's `userId` is the condition, so an editor is never the reported author. The takedown makes the deck private for its owner and editors alike.",
  },

  // s12-07 profile-made
  'lib/profile/made.server.ts': {
    access: 'owner-only',
    reason:
      "A profile's \"Made here\" list shows the public, unremoved decks the profile's member authored (`userId` is the author), with title and card count only. A deck they only edit is someone else's work and is not listed.",
  },
};
