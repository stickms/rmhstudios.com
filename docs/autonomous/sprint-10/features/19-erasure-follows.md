# 19 — Erasure: subscriptions, activity, RSVPs, handles and listings

Surface: `anonymizeAccount` (`lib/account/deletion.server.ts`), the erasure registry, `docs/account-deletion.md`, one
daily job. Wave 7. No namespace (no UI strings).

## User story

As a member who deletes their account, I want the records of what I subscribed to, what I did, which events I said I
would attend, which handles I used and the listings I posted to go with it, so that "deleted" means my traces are gone
and not only my name.

## Requirements elicitation

- **What exists (verified):**
  - `lib/account/erasure-registry.ts` holds 17 `todo` entries (`TODO_CEILING = 17`, sprint 09). This feature takes the
    13 that can leave `todo` without a new owner call: 12 it erases — `Activity`, `CustomFeedSubscription`,
    `HandleChange`, `HomeListing`, `HomeRoommateProfile`, `LibraryCollection`, `LibraryQuotaRequest`,
    `PostSeriesFollow`, `RideshareDriver`, `Rsvp`, `UserQuest`, `Watch` — and one, `RmhTubeSubscription`, it classifies
    `owner` (below). It leaves `RebarReservation` (how long bookings are kept is an open product call), `UserInventory`,
    `UserSeasonProgress` and `Streak` (owned items, season passes and streak freeze tokens, which may be bought: the
    purchased-cosmetics owner decision) as `todo`, so `TODO_CEILING` goes 17 → 4.
  - Anonymisation is in place (`onDelete: Cascade` from `User` never fires); every erasure is an explicit operation.
    `releaseSeatsOf(userId)` already runs before the transaction (seats freed, waitlists promoted) but leaves the `Rsvp`
    rows. `Follow` itself is an `owner` entry (a deleted member's follows) and is not touched.
  - Counters on kept rows: `CustomFeed.subscriberCount`, `PostSeries.followCount` (`prisma/schema/social.prisma`);
    RMHTube subscriber numbers are counted from rows; `Watch` (kinds `community | build | market`,
    `lib/discovery/schema.ts`: notification levels on things, never on people) has no counter.
  - Handles: `HandleChange (userId, oldHandle, newHandle, createdAt)` backs the 30-day reclaim block
    (`lib/handles/history.server.ts`, `releasesOf`) and the public "previously known as" line.
  - `HomeListing.authorId` is nullable; inquiries and favourites cascade from the listing; `Ride.driverId` references
    `User`, not `RideshareDriver`, so the driver application can go without touching rides.
- **Decisions (one per table; the reasons go into the registry):**
  - `Activity` — **erase**: derived "X did Y" rows followers see; the content they point at follows its own rule.
  - `CustomFeedSubscription`, `PostSeriesFollow`, `Watch` — **erase**, decrementing `subscriberCount` and `followCount`
    for the kept feeds and series in the same transaction (grouped `updateMany … decrement` per target, computed before
    the deletes). These are subscriptions to things (a feed, a series, a community, build or market watch), not the
    social graph the `Follow` owner decision covers; the registry reason says so, and `Follow` stays `owner`.
  - `RmhTubeSubscription` — **owner (validation pass 2).** An earlier draft erased it in both directions, but its
    `channelId` is a `User` (`prisma/schema/rmhtube.prisma`: `channel User @relation("TubeChannel")`): subscribing to a
    member's channel is following a person, which is exactly the open "a deleted member's follows" decision (the
    registry's current reason already says it needs "a link to the follows decision"). It becomes `owner` with the
    reason "Subscriptions to a member's channel are the social graph: the open owner decision on a deleted member's
    follows (as `Follow`); rows untouched." This still takes it out of `todo` without deciding anything.
  - `Rsvp` — **erase** every row after `releaseSeatsOf` (attendee lists then no longer show "Deleted user"; past turnout
    drops by one, accepted and stated).
  - `HandleChange` — **erase** rows older than the reclaim window at deletion; rows inside it stay until a daily job
    erases them for deleted accounts once they pass it, so the released handle stays protected for its 30 days and
    "previously known as" is never shown for a deleted profile (its header is the tombstone).
  - `HomeListing` — **erase** the member's listings (inquiries and favourites cascade); `HomeRoommateProfile` —
    **erase**; `RideshareDriver` — **erase** (vehicle, plate, licence, last location).
  - `LibraryCollection` — **erase** the member's own collections (items cascade); **deidentify** an `official`
    collection they own (`ownerUserId` null; it is the site's). `LibraryQuotaRequest` — **erase** the member's requests;
    where the member decided others' requests as an admin, null `decidedByUserId`.
  - `UserQuest` — **erase**: progress only; rewards already paid stay in the coin ledger (`keep`).
- **Verified per table** (the sprint 09 lesson): every reader in both directions, foreign-key order (what a database
  cascade would also remove, and which deletes come first), and every JSON snapshot that carries a name (`Activity.meta`
  is erased with its row; listing and collection text goes with its row).

## Functional requirements

1. FR-1 `followsErasureOps(userId, counts)` in a new `lib/account/erasure-follows.server.ts` (Prisma operations for the
   transaction array; reads that compute the counter decrements run before the transaction, guarded for the test
   proxies), wired under the `s10-19` anchor.
2. FR-2 The 13 registry entries changed from `todo` (12 to `erase`, `RmhTubeSubscription` to `owner`) with reasons;
   `TODO_CEILING = 4` (17 − 13; the four left are `RebarReservation`, `Streak`, `UserInventory`, `UserSeasonProgress`);
   `pnpm docs:deletion` regenerated.
3. FR-3 The daily handle-change job (jobs anchor): delete `HandleChange` rows of deleted accounts older than the window,
   in batches of 1,000.
4. FR-4 `getPreviouslyKnownAs` returns nothing for a deleted account (a guard, asserted).

## Non-functional requirements

- **Correctness:** counters never go below zero (`GREATEST` in raw SQL after the transaction, or a conditional
  `updateMany` in it); every operation is idempotent so a retried deletion changes nothing more.
- **Performance:** every delete is by an indexed member column (each table has one: `userId` indexes listed in the
  schema; verify and report any missing — do not add one).

## Data model and API

- No schema change. New `lib/account/erasure-follows.server.ts`, `lib/account/handle-change-jobs.server.ts`. Edits:
  `lib/account/deletion.server.ts` (anchor), `lib/account/erasure-registry.ts`, `server/jobs/index.ts` (anchor),
  `lib/handles/history.server.ts` (the guard), `docs/account-deletion.md` (generated).

## Testing requirements

- Main suite `lib/account/__tests__/follows-erasure.test.ts` (copy `study-erasure.test.ts`): each table's operation is
  present with the right `where`; no `rmhTubeSubscription` operation (it is `owner`); counter decrements computed per
  target and floored; official collections deidentified, others erased; quota decisions nulled; `Follow` untouched.
- Main suite `lib/account/__tests__/handle-change-jobs.test.ts`: only deleted accounts' rows past the window go.
- `lib/account/__tests__/erasure-coverage.test.ts` with `TODO_CEILING = 4`; the deletion docs check.

## Acceptance criteria

- [ ] After a deletion, the member's feed, series and watch subscriptions, activity rows, RSVPs, listings, roommate
      profile, driver application, own collections, quota requests and quest progress are gone; feed and series counts
      dropped by one.
- [ ] The member's released handle still cannot be taken for the rest of its 30 days, then the row goes.
- [ ] The registry has four `todo` entries, each with its owner-call reason.

## Out of scope

`RmhTubeSubscription` rows (owner decision, as `Follow`), `RebarReservation`, `UserInventory`, `UserSeasonProgress`,
`Streak`, `Follow` and every other `owner` entry.
