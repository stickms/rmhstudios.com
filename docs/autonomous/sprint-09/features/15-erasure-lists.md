# 15 — Erasure: private tools, lists and study data

Surface: `anonymizeAccount` (`lib/account/deletion.server.ts`), the erasure registry, `docs/account-deletion.md`.
Wave 4. No namespace.

## User story

As a member who deletes their account, I want my private chats with personas, my feed tuning and lists, my wishlist and
savings goals, my study profile and test results, my onboarding answers and pending join requests to go with it, so that
"delete my account" is true of the tools I used alone.

## Requirements elicitation

- **What exists (verified):**
  - The registry (`lib/account/erasure-registry.ts`) has 43 `todo` entries and `TODO_CEILING = 43`; the coverage test
    (`lib/account/__tests__/erasure-coverage.test.ts`) parses the schema and fails on any mismatch between the registry
    and what `anonymizeAccount` records; `docs/account-deletion.md` is generated (`pnpm docs:deletion`). Accounts are
    anonymised in place, so `onDelete: Cascade` on a `User` relation never fires.
  - Sprint 08 19 and 20 set the shape: one helper of Prisma operations spread under an anchor, a pre-step read before
    the transaction guarded for the test's recording Proxy, no `$executeRaw` inside the array; the counter rule ("an
    anonymous tally on a kept model is left as it is").
  - The `todo` reasons of the tables below call them the member's own ("Rule 1 … erase candidates"), several with a
    caveat that this feature resolves.
- **Decisions — per table.** Before erasing, the implementer checks **every reader of each table, in both directions**
  (rows where the member is the subject and rows where they are the object), the **foreign-key order** (children before
  parents where the database would refuse, and which other members' rows a database cascade would remove), and any
  **JSON snapshot that carries the member's name** (a stored payload, a share card). The final decision and its reason
  go in the registry; a table whose check fails stays `todo` with the new reason, and the report says so.

  | Model                                              | Decision                                                                     | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
  | -------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `AiPersonaMessage`                                 | erase (rows with the member as `userId`)                                     | The member's side of persona chats, on any persona.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
  | `AiPersona`                                        | erase where `isPublic = false`; public personas kept                         | A private persona is the member's tool. A public persona (`isPublic` defaults to `true`) is published content others chat with (`chatCount`): kept under the tombstone like a post, and other members' chats with it survive. Deleting a private persona cascades only its messages, which only its owner could write. The avatar object of an erased persona is a generated picture at an unguessable key holding no personal data; it is left in storage and the reason says so (12, wave 4 beside this feature, classifies `persona-avatar` as `not-recorded`).                                     |
  | `EmojiPackSubscription`                            | erase                                                                        | The member's subscription; `EmojiPack.subscriberCount` is an anonymous tally and is left (counter rule).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
  | `FeedSignal`                                       | erase (the member's own rows, `userId`)                                      | Feed tuning (mute tag, less author, follow tag). Rows where the member is the **target** (`kind = less_author`, `targetId` = their id) are other members' tuning; they are **kept**: they name an id that now resolves to "Deleted user", change nothing anyone sees, and deleting them would scan the table (the key is `userId, kind, targetId`; `targetId` is its third column and has no index of its own). The reason records it.                                                                                                                                                                 |
  | `PostAutoDelete`                                   | erase                                                                        | The member's rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
  | `MarathonList`                                     | erase                                                                        | A personal reading list; its `shareId` page 404s afterwards. Check the share page reads nothing else.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | `MemberMemory`                                     | erase                                                                        | Private memories; confirm whether it has child rows (the old reason said so; the schema shows none) and delete children first if any.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | `ReadingSubscription`                              | erase                                                                        | The member's subscriptions; same child check.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
  | `SavingsGoal`, `WishlistEntry`                     | erase                                                                        | Private goals and wishlist (price-alert state included); same child check.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
  | `CustomFeed`                                       | erase where `isPublic = false AND visibility <> 'PUBLIC'`; public feeds kept | Private and by-link (`UNLISTED`) feeds, lists, saved searches and alerts are the member's tools (`CustomFeedMember` and `CustomFeedSubscription` rows inside them go by the database cascade — a list that no longer exists lists nobody). A feed is public when **either** the legacy `isPublic` flag or `visibility = 'PUBLIC'` says so (the site's `readableByOthers` reads both); it has subscribers and is published content, kept under the tombstone like public decks (an owner-kept category). `CustomFeedMember` rows naming the member inside other people's lists stay `keep` (unchanged). |
  | `CommunityOnboardingAnswer`                        | erase                                                                        | The member's answers, seen only by the community's moderators.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
  | `CommunityJoinRequest`                             | erase where `status = PENDING`; decided rows kept with `message` set to null | A pending request from a deleted account can never be honoured, so it is withdrawn; decided rows are the moderators' record (sprint 04 17's habit), but the free-text `message` the member wrote is theirs and is cleared (an `updateMany` beside the `deleteMany`).                                                                                                                                                                                                                                                                                                                                   |
  | `RmhStudyProfile` (+ `RmhStudySession` by cascade) | erase                                                                        | Focus totals and sessions; the RMHStudy boards read this table, so erasing removes the member from them (consistent with sprint 05's leaderboard erasure).                                                                                                                                                                                                                                                                                                                                                                                                                                             |
  | `FlashcardTestResult`                              | erase                                                                        | The member's practice-test results.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
  | `StudyBuddyRequest`                                | erase                                                                        | Waiting or past requests; a matched `StudyBuddyMatch` is `keep` (shared with the other member) and is untouched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
  | `CloseFriend`                                      | erase, both directions                                                       | The member's close-friends list (`ownerId`) and their presence in others' lists (`memberId`): a tombstone in someone's circle widens nothing and narrows nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
  | `SharedMoment`                                     | erase                                                                        | A share card of the member's own stats, snapshotting their name in `payload`; deleting the row 404s its landing page and OG image (`lib/moments.server.ts`); posts that linked it keep a dead link.                                                                                                                                                                                                                                                                                                                                                                                                    |

  That is 18 registry entries. Anything not in this table stays as it is; `BracketPick` and the boards are 16's.

- **Shape:** one helper `listsErasureOps(userId)` in `lib/account/erasure-lists.server.ts`, spread under the `s09-15`
  anchor.
- **Ceiling:** `TODO_CEILING` falls by the number classified, in the same change; `docs/account-deletion.md`
  regenerated.

## Functional requirements

1. FR-1 The erasures above, each in the helper.
2. FR-2 Registry entries updated (decision, reason; the partial ones say which rows stay and why).
3. FR-3 `TODO_CEILING` lowered; the deletion doc regenerated.

## Non-functional requirements

- **Correctness:** every operation is scoped by the member's id (both columns for the two-direction tables); no `keep`,
  `owner` or `todo` model is touched (the coverage test fails it), so stored aggregates on kept models stay (counter
  rule).
- **Performance:** one `deleteMany` per table inside the existing transaction (plus the one `updateMany` on decided join
  requests); every filtered column leads an index or a key — `ownerId` on `AiPersona` and `CustomFeed`, `userId`
  elsewhere, `memberId` on `CloseFriend` (`@@index([memberId])`), `CommunityJoinRequest.userId` (`@@index([userId])`).
  No target-direction delete on `FeedSignal` (see its row).
- **Privacy:** the point of the feature.

## Data model and API

- No schema change. New `lib/account/erasure-lists.server.ts`; edits to `lib/account/deletion.server.ts` (anchor),
  `lib/account/erasure-registry.ts`, `docs/account-deletion.md` (generated).

## Testing requirements

- Main suite `lib/account/__tests__/lists-erasure.test.ts`: every table gets its operation with the right `where` (both
  directions for `CloseFriend`; the partial filters for `AiPersona`, `CustomFeed` — a legacy `isPublic` row with
  `visibility = 'PRIVATE'` is kept — and `CommunityJoinRequest`, whose decided rows get `message: null`); `FeedSignal`
  rows naming the member as target are untouched; nothing else is touched.
- `erasure-coverage.test.ts` passes with the lower ceiling; `pnpm docs:deletion:check` passes; existing erasure tests
  stay green.

## Acceptance criteria

- [ ] Deleting an account with a private persona, a list, a wishlist entry, a study profile and an onboarding answer
      leaves none of those rows.
- [ ] Another member's chats with the deleted member's public persona remain.
- [ ] Another member's close-friends list no longer contains the tombstone.
- [ ] A moderator's decided join request from the member remains, without its message.
- [ ] `TODO_CEILING` equals the number of `todo` entries left: 43 before this wave, 25 after it if all 18 are
      classified.

## Out of scope

Ratings, puzzle boards and pick'em (16); follow-like rows (`Watch`, `PostSeriesFollow`, `CustomFeedSubscription`,
`RmhTubeSubscription` — tied to the follows owner decision); purchased items and progress (`UserInventory`, `UserQuest`,
`UserSeasonProgress`, `Streak` — owner call on purchases); `Activity`, `Rsvp`, `HandleChange`, the Tier 3 listings,
`RebarReservation`.
