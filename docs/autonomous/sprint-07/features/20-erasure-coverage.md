# 20 — An erasure registry for every member table, and the clearly private ones erased

Surface: account deletion (`lib/account/deletion.server.ts`,
`anonymizeAccount`), a new registry of every per-member table, and its test.
No UI. Wave 7 (sweeping: it must see every table the sprint added). Namespace
none.

## User story

As a member who deletes their account, I expect my private notes, drafts,
reminders, birthday, history and settings to be gone, not merely detached from my
name, so that "delete my account" means what it says.

As the site owner, I want a test that fails the day someone adds a table of
personal data without saying what deletion does with it, so that this does not
drift back.

## Requirements elicitation

- **What exists (verified):**
  - Deletion is a 30-day schedule followed by `anonymizeAccount`
    (`lib/account/deletion.server.ts`), which anonymises the `User` row in
    place — so `onDelete: Cascade` never fires — and runs one
    `$transaction([...])` of explicit `deleteMany`/`updateMany` operations plus
    per-domain `…ErasureOps(userId)` helpers. Each sprint added its tables under
    its anchors with an erasure test (`lib/account/__tests__/*-erasure.test.ts`,
    recording-Proxy stubs).
  - **Nothing checks coverage.** A scan of `prisma/schema/**` (sprint 06 tip)
    finds 373 models with an `@relation` to `User`; 127 of them are named in
    `deletion.server.ts` or the `…ErasureOps` helpers it imports, and about
    245 never are. Many of those are rightly kept (ledgers, audit trails,
    another member's record, published content), but spot checks confirm
    real private data among them, none of which is erased today:
    `ReadingHighlight` (private ones carry a `note`), `ReadingGoal`,
    `ReadingPrefs`, `UserBirthday`, `Reminder`, `ScheduledPost` (drafts and
    sealed capsules), `SavedItem` (a private note, X9) and `SaveFolder`,
    `HistoryEntry`, `CalcNotebook`, `StudyPlan`, the four `…Preference`
    tables in `profile.prisma`, `Notification` and `HeldNotification`
    addressed to the member, `KeywordAlertHit`, `TargetedNoticeDismissal`,
    `RmhTubeWatchLater`, `MemoriesOptIn`. (`grep -rn "<model>.deleteMany"
    lib/account` finds none of them.) Others are private too but need more
    than one `deleteMany` (private `FlashcardDeck`s have cards, reviews,
    clones and this sprint's folders; `ReadingShelfEntry` can be public;
    `MemberMemory`, the RMHType and RMHStudy tables, `SavingsGoal`,
    `WishlistEntry`, `Watch`, `CustomFeedSubscription`,
    `StudyBuddyRequest`, `FlashcardTestResult`, `ReadingSubscription`).
  - `@prisma/internals` is not a dependency (`package.json`), so the test
    parses the schema itself.
  - Earlier sprints left questions to the owner and they stay open: a
    deleted member's follows, game reviews and guides, jam entries (sprint 05
    README) and public decks; moderator notes in the export; the grace period.
- **Decisions:**
  - **Scope is the registry, the test, and the clearly private leaf tables.**
    Erasing all ~245 in one change is not reviewable by one implementer and
    would decide owner questions by accident. This feature (a) classifies
    every member-referencing model, (b) erases the 21 models listed under
    FR-2 — each is read only by its owner, has no counter or aggregate shown
    to anyone else, and is removed by one `deleteMany` on an indexed member
    column — and (c) records every other unhandled model as a `todo` with the
    reason it was deferred, so the gap is visible and can only shrink.
  - **A registry of every model that refers to a member**,
    `lib/account/erasure-registry.ts`: for each model with an `@relation` to
    `User`, one entry with a `decision` and a one-line `reason`:
    - `erase` — deleted in `anonymizeAccount` (today or by this feature);
      `scope` names a partial erase (`ReadingHighlight`: `isPublic: false`
      rows only; public rows follow the published-content rule);
    - `deidentify` — kept, member reference replaced or nulled there;
    - `cascade` — deleted by the database when a parent that
      `anonymizeAccount` deletes goes (`parent` names it);
    - `keep` — kept on purpose (financial ledger, security audit trail,
      another member's record, published content kept under "Deleted user"
      like posts);
    - `owner` — an open owner decision, the decision named (follows, game
      reviews, guides, jam entries, public decks, …);
    - `todo` — not handled yet; `reason` says why it was deferred (has
      children, needs a counter correction, unindexed column, needs a
      product call) and which rule below it would fall under.
  - **Existing behaviour is recorded, not changed.** Every model
    `anonymizeAccount` already touches is classified as what it already does
    (`erase` or `deidentify`); no existing operation is added, removed or
    reordered. Follows, game reviews, guides, jam entries and public decks
    are `owner` and their handling is untouched.
  - **The rules for classifying**, so the registry is reviewable:
    1. Only the member ever sees it (settings, preferences, drafts, private
       notes and highlights, reminders, history, private decks, notebooks,
       plans, progress, watch-later, alert hits, dismissals) → `erase` if it
       is in FR-2 or already erased, else `todo` ("rule 1: …").
    2. It records the member's interaction with someone else's thing and is
       shown to others as an aggregate only → `keep` when the aggregate is
       denormalised and the row is needed for its integrity; `owner` if a
       prior sprint left it open (follows, reviews, jam entries); else `todo`.
    3. Published content shown to others (posts, comments, public decks,
       builds, guides, playlists others follow) → `keep` ("published content
       kept under Deleted user", the posts rule), unless a prior sprint
       already erases it or an owner question is open (`owner`).
    4. Money and audit (coin ledger, payouts, purchases, security events,
       strikes, admin audit, reports about others) → `keep` with the reason.
    5. Anything that needs a product call → `owner` (an existing open
       decision) or `todo` (a new one, stated); never guessed.
  - **The `todo` count is a ratchet.** The test pins `TODO_CEILING` (the
    count this feature commits); a later change may lower it and must not
    raise it, the way `lib/__tests__/ts-escape-hatch-ratchet.test.ts` works.
    A new model therefore cannot land as `todo`; it lands classified.
  - `ScheduledPost` rows are erased at finalisation (the published post, if
    any, stays as posts do). Whether a scheduled post may still publish
    during the 30-day grace period is part of the grace-period owner decision
    and is not changed here (`lib/scheduled/publish.server.ts` is not edited).
  - `Notification` rows **addressed to** the member (`userId`) are erased;
    notifications **about** the member sent to others (`actorId`) are `keep`
    (they render "Deleted user"; the relation is `onDelete: SetNull`).
  - The registry lists every table added in sprints 06 and 07 (features 04,
    05, 06, 07, 08, 09, 14, 15, 17, 18, 19 each add or erase tables and are
    classified as what their own erasure does), so the test passes on the
    merged sprint branch.

## Functional requirements

1. FR-1 `lib/account/erasure-registry.ts` (data only, client-safe, no
   imports): `ERASURE_REGISTRY: Record<string, ErasureEntry>` keyed by model
   name, covering every model with an `@relation` to `User`, each with its
   `decision` and `reason` (and `scope` / `parent` where they apply), and
   `TODO_CEILING`.
2. FR-2 `lib/account/erasure-coverage.server.ts` exports
   `coverageErasureOps(userId)` returning exactly these Prisma operations,
   spread under the `s07-20 erasure-coverage` anchor in `anonymizeAccount`:
   `deleteMany({ where: { userId } })` on `UserBirthday`, `Reminder`,
   `ScheduledPost`, `ReadingGoal`, `ReadingPrefs`, `HistoryEntry`,
   `SavedItem`, `SaveFolder` (after `SavedItem`), `CalcNotebook`,
   `StudyPlan`, `AppearancePreference`, `KeyboardPreference`,
   `LayoutPreference`, `NotificationPreference`, `Notification`,
   `HeldNotification`, `KeywordAlertHit`, `TargetedNoticeDismissal`,
   `RmhTubeWatchLater`, `MemoriesOptIn`; and
   `deleteMany({ where: { userId, isPublic: false } })` on
   `ReadingHighlight`. No pre-step reads, no `$executeRaw`. The implementer
   confirms each column name in the schema before writing it; a model whose
   member column turns out to be named otherwise uses that name; one that
   turns out to have a side effect on other members (a counter, a public
   listing) moves to `todo` with the reason, and the report says so.
3. FR-3 A new reference page `docs/account-deletion.md` (no page describes
   deletion today: `grep -rl anonymizeAccount docs` finds only plans), added
   to the toctree in `docs/index.md` and to `docs/README.md` the way other
   reference pages are: what deletion does, the grace period as it is, and a
   table of the registry grouped as **erased** (`erase`, `deidentify`,
   `cascade`), **kept on purpose** (`keep`), **owner decision** (`owner`) and
   **TODO** (`todo`), one row per model with its reason. It says the
   registry is the source and the page is checked against it (below).
4. FR-4 The sprint summary's owner follow-ups list every `owner` entry, and
   its follow-ups list the `todo` count.

## Non-functional requirements

- **Correctness:** the coverage test fails, naming the model, for a model
  with a `User` relation missing from the registry; a registry entry for a
  model that no longer exists; an `erase` model with no `deleteMany` /
  `delete` on it in `anonymizeAccount`'s recorded transaction; a
  `deidentify` model with no `updateMany` / `update` on it; a `cascade`
  entry whose `parent` is not `erase` or whose relation is not
  `onDelete: Cascade`; a `keep`, `owner` or `todo` entry with an empty
  reason; a `todo` count above `TODO_CEILING`.
- **Safety:** every operation `coverageErasureOps('user-1')` returns has a
  `where` whose `userId` is `'user-1'` (a test asserts it).
- **No change for kept tables:** `coverageErasureOps` touches only FR-2
  models (asserted), and no `keep` or `owner` model appears in it. The
  recorded run's `{ model, method }` pairs on every `owner` model are pinned
  in the test as they are at the wave's base (the implementer records them
  first, before editing `deletion.server.ts`), so a later change to how
  follows, reviews, guides, jam entries or public decks are handled fails
  until the owner decides.
- **Performance:** 21 `deleteMany` calls on indexed member columns;
  finalisation runs nightly, one member at a time. Each FR-2 model's member
  column is verified to lead an index (all are, at the sprint 06 tip:
  `@id`, `@@unique` or `@@index` starting with `userId`); a model where it
  does not moves to `todo` ("unindexed member column").
- **No behaviour change for living members.**
- **Docs freshness:** a test checks that every model in the registry appears
  in `docs/account-deletion.md` under its group's heading, so the page
  cannot drift.

## Data model and API

- No schema change, no endpoint, no UI.
- `lib/account/erasure-registry.ts`, `lib/account/erasure-coverage.server.ts`,
  the anchor block in `deletion.server.ts`.

## Testing requirements

- Main suite `lib/account/__tests__/erasure-coverage.test.ts`: a small
  parser in the test reads `prisma/schema/**/*.prisma` (model blocks and
  their fields typed `User`/`User?`/`User[]` with `@relation`, and each
  relation's `onDelete`), builds the member-referencing model list, records
  `anonymizeAccount('user-1')` with the recording Proxy of
  `study-erasure.test.ts`, and holds every condition under Correctness. The
  parser has its own cases (a two-relation model such as `Notification`, a
  composite `@@id`, a commented-out field).
- Main suite `lib/account/__tests__/private-data-erasure.test.ts`: each FR-2
  operation, its method and its exact `where`; the `ReadingHighlight` scope;
  `SavedItem` before `SaveFolder`; the "no change for kept tables" pins.
- A docs check (in `erasure-coverage.test.ts`): every registry model is
  listed in `docs/account-deletion.md`.
- Every existing `*-erasure.test.ts` stays green.

## Acceptance criteria

- [ ] After deletion is finalised for a member with a private highlight, a
      public highlight, a draft, a reminder, a saved item with a note and a
      birthday, none of those rows exist except the public highlight.
- [ ] Adding a new model with a `User` relation and no registry entry fails
      the test with the model's name; classifying it `todo` fails it too
      (the ceiling).
- [ ] Every `keep`, `owner` and `todo` decision has a reason a reviewer can
      check, and `docs/account-deletion.md` shows them in four groups.
- [ ] Follows, game reviews, guides, jam entries and public decks are
      unchanged and listed as `owner`; no operation outside FR-2 was added.

## Out of scope

Deciding the open owner questions (follows, reviews, guides, jam entries, public
decks, moderator notes in the export, the grace period), changing the grace
period, erasing data in backups, erasing any `todo` model (each is a later,
reviewable change that lowers `TODO_CEILING`), deleting uploaded files in
object storage, adding indexes.
