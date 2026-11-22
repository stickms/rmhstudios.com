# 19 — Erasure: profile extras, private tools and app data

Surface: `anonymizeAccount` (`lib/account/deletion.server.ts`), the erasure
registry, `docs/account-deletion.md`. Wave 6. No namespace.

## User story

As a member who deletes their account, I want the things only I ever saw or
used — the links and layout of my profile, my saved homes and places, my
résumé matches and referral requests, my automation recipes, my inbox
folders, my characters and fortune cookies — to go with it, so that "delete
my account" is true of the parts of the site I used most quietly.

## Requirements elicitation

- **What exists (verified):**
  - Sprint 07 20's registry (`lib/account/erasure-registry.ts`) classifies
    every model with a `User` relation; `TODO_CEILING = 96` (01 lowers it by
    one before this wave), and the coverage test
    (`lib/account/__tests__/erasure-coverage.test.ts`) parses the schema and
    fails on any mismatch between the registry and what `anonymizeAccount`
    records. `docs/account-deletion.md` is generated (`pnpm docs:deletion`).
  - The `todo` reasons name these as erase candidates (quoted in each row
    below). `anonymizeAccount` scrubs `UserProfile`'s fields in place but
    never reaches the profile's satellite tables; the `onDelete: Cascade` on
    each relation never fires, because the `User` row is anonymised, not
    deleted.
- **Decisions — per table** (the implementer confirms each against its
  readers before erasing, and records the final decision and reason in the
  registry; a table whose check fails stays `todo` with the new reason, and
  the report says so):

  | Model | Decision | Why |
  | ----- | -------- | --- |
  | `ProfileLink` | erase | Profile content the scrub does not reach; the profile is scrubbed. |
  | `ProfilePlus` (+ `ProfileVisitDay` by cascade) | erase | Same; visit counts are the member's own. |
  | `ProfileLayout` | erase | Same. |
  | `ProfileStamp` | erase | The member's placement of a `Stamp` (the stamp, published content, stays). `Stamp.addCount` is **not** decremented: it is an anonymous "added N times" tally, and `Stamp` is a `keep` model that the coverage test forbids `anonymizeAccount` to touch. |
  | `LoadoutPreset` | erase | Saved cosmetic loadouts; the items stay with the inventory decision. |
  | `LadderJobMatch`, `LadderResumeReview` | erase | Explicit `deleteMany({ where: { userId } })`. **Not `cascade`:** the coverage test requires a cascade entry's `parent` to be an `erase` entry the model has a direct `onDelete: Cascade` relation to; their direct parent `LadderResumeVersion` is itself `cascade`, and they have no relation to `LadderResume`. (The database cascade still fires when the resume goes; the explicit delete makes the registry true.) |
  | `LadderAiTask` | erase | Nullable resume relation: tasks with only a job id are not reached by the cascade. |
  | `LadderReferralRequest` | erase | The member's requests to others' offers. |
  | `LadderReferralOffer` | erase | The member's offers (company, roles, note: where they work). Requests other members sent to them go by the database cascade: the one place this feature removes rows another member wrote, because a request addressed to an offer that no longer exists can never be answered, and keeping the pitch would keep the deleted member's company beside it. Recorded in the reason. |
  | `DevRecipe` | erase | Automation recipes (webhook and DM actions). |
  | `RideSavedPlace` | erase | Saved places. |
  | `HomeFavorite`, `HomeWatch` | erase | Saved homes and searches. |
  | `BlogAnnouncementSeen` | erase | Seen markers. |
  | `ReadingShelfEntry` | erase | The member's shelves. The old reason asked for a public/private split "like highlights"; highlights needed one because a public highlight is quoted content others read on a document, while a shelf entry is only ever shown on its owner's profile (`lib/reading/shelves.server.ts` reads by `userId`, no cross-member aggregate), which the deletion scrubs. |
  | `DiscordWatchAlert` | erase | Alert subscriptions. |
  | `ExperimentExposure` | erase | Analytics exposure tied to the member. Experiment results are computed from these rows at read (`lib/ops/experiments.server.ts`, `groupBy`), so an admin's experiment counts drop by one; accepted (an exposure is the member's behaviour, not the admin's record). |
  | `SiteIdempotencyKey` | erase | Short-lived; stored responses may hold member data. |
  | `ChatFolder` (+ items by cascade), `DirectMessageHide` | erase | Inbox arrangement. |
  | `OfficeHoursConfig` (+ windows by cascade) | erase | Availability settings; bookings others made are handled by their own entry. |
  | `AvailabilityPollInvitee` | erase | The member's invitation rows on someone's availability poll (the invite list loses a tombstone). Their **answers** are `AvailabilityPollResponse`, which sprint 07 classified `keep` for the poll's integrity, and stay. |
  | `CallMute` | erase, both directions | `userId` rows are the member's; `mutedUserId` rows name a tombstone. `mutedUserId` has no index (only `@@unique([userId, mutedUserId])` and `[userId, until]`), so the second `deleteMany` scans a small table once per deletion; accepted and reported, no index added. |
  | `ArcadeRival` | erase, both directions | Same shape as `CallMute`. |
  | `FortuneCookie` | erase | Not private: an approved fortune is shown to everyone, though without an author (`lib/delight/fortune.server.ts`). Erased because the text is the member's own words and nothing names its author. If today's fortune is theirs, the next approved one replaces it after the 60 s cache (accepted). |
  | `RmhCharacter` | erase | Characters; private (the only readers are the owner-scoped `features/rmhcharacters/api/*` modules). |

  Anything not in this table stays as it is. `RmhTubeUserStats` is 01's.
- **The pronunciation clip is a stored object.** `ProfilePlus.pronunciationKey`
  names an audio recording of the member's voice in object storage
  (`lib/profile/plus.server.ts`); deleting the row leaves the file. Storage I/O
  stays out of `anonymizeAccount` (its doc comment: one unreachable bucket
  would stall every pending deletion), so, exactly as résumé files are
  handled, `lib/account/api/account.delete.server.ts` deletes the clip's
  object (and nulls `pronunciationKey`, `pronunciationMs`) beside the
  `ladderResumeVersion` objects before it schedules the deletion.
- **Shape:** one helper `privateDataErasureOps(userId)` in
  `lib/account/erasure-private.server.ts`, spread under the `s08-19` anchor;
  Prisma operations only inside the transaction (no `$executeRaw`); a read
  needed before the transaction is guarded for the test's recording Proxy.
- **Ceiling:** `TODO_CEILING` falls by the number classified here, in the same
  change; `docs/account-deletion.md` regenerated.

## Functional requirements

1. FR-1 The erasures above, each in the helper.
2. FR-2 Registry entries updated (decision, reason, `parent` for cascades).
3. FR-3 `TODO_CEILING` lowered; the deletion doc regenerated.
4. FR-4 The pronunciation clip's object deleted by the deletion request.

## Non-functional requirements

- **Correctness:** every operation is scoped by the member's id (both columns
  for the two-direction tables); nothing is erased that another member
  authored, except the referral requests that cascade with the member's
  offers (above). No `keep` or `todo` model is touched (the coverage test
  fails it), so stored aggregates on kept models (`Stamp.addCount`) stay.
  **Counter rule (shared with 20):** an anonymous tally on a kept model ("N
  added", "N plays", a rating sum and count) is left as it is — it records
  that something happened, names nobody, and correcting it would both touch a
  `keep` model and make other members' visible numbers jump.
- **Performance:** one `deleteMany` per table inside the existing
  transaction; no table scan without an index on the filtered column (every
  filtered column is indexed or a key — confirm, report any that is not).
- **Privacy:** the point of the feature.

## Data model and API

- No schema change. New `lib/account/erasure-private.server.ts`; edits to
  `lib/account/deletion.server.ts` (anchor),
  `lib/account/api/account.delete.server.ts` (the clip, beside the résumé
  objects), `lib/account/erasure-registry.ts`,
  `docs/account-deletion.md` (generated).

## Testing requirements

- Main suite `lib/account/__tests__/private-tools-erasure.test.ts`: every
  table above gets its operation with the right `where` (both directions
  where stated); nothing else is touched (no `Stamp` update).
- Main suite: the delete route deletes the pronunciation object (extend the
  route's existing test beside the résumé-object case).
- `erasure-coverage.test.ts` passes with the lower ceiling;
  `pnpm docs:deletion:check` passes.
- Existing erasure tests stay green.

## Acceptance criteria

- [ ] Deleting an account with profile links, a layout, saved homes, a
      résumé review and a recipe leaves none of those rows.
- [ ] Another member's call mute of the deleted member is gone; the other
      member's own data is untouched.
- [ ] A member with a pronunciation clip requests deletion: the object is
      gone from storage at once, the row at anonymisation.
- [ ] `TODO_CEILING` equals the number of `todo` entries left: 95 before
      this wave (01 erased `RmhTubeUserStats`), 68 after it if all 27 are
      classified.

## Out of scope

Per-game progress (20), feed-facing rows (activity, ratings, subscriptions,
follows — owner or product calls), `RebarReservation` (needs a product call
on how long bookings are kept; unchanged), purchased inventory.
