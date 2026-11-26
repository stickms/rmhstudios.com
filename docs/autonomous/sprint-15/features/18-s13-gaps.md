# 18 — Close the gaps sprint 13 left open

Surface: an RMHTube room after a member's erasure, `/calendar`, Rideshare's trip panel, message edits, the developer
API's party members, the reading catalogue. Wave 7. No namespace of its own (each fix writes into its file's namespace).
Site tier where it touches pages; the RMHTube hub.

## User story

As the owner, I want the sprint 13 follow-ups that need no product call closed, so that a deleted member's name leaves
a live room, an all-day entry lands on its day in every zone, a cancelled trip can be reported, two quick edits keep
both earlier versions, and the developer API stops speaking English where the site translates.

## Requirements elicitation

- **What exists (verified, each against sprint 13's summary):**
  - **S13-06:** an erased member's name stays in a running RMHTube room's chat ring buffer until the hub restarts. The
    hub keeps the last messages per room (`room.chat`, read in `server/rmhtube/room-manager.ts`), and the web tier
    already tells the hub about removed chat through Redis (`CHAT_REMOVED_CHANNEL`, `lib/rmhtube/events.ts`, sprint 13
    06) and closed rooms (`ROOM_CLOSED_CHANNEL`, sprint 14 10). Erasure tells it nothing.
  - **S13-09:** all-day RMHLadder entries are bucketed at noon UTC (`lib/rmhladder/calendar-entries.ts`, "noon UTC on
    its day (a bucket key, never shown as a time)") and placed on the `/calendar` grid by that instant
    (`lib/schedule/grid.server.ts`, `lib/schedule/slots.ts`, `app/routes/_site/calendar.tsx`), so a viewer at UTC+13/14
    or UTC−12 sees them a day off.
  - **S13-15:** `components/rideshare/ActiveRidePanel.tsx` shows "Report" only while `withinRideReportWindow(ride.completedAt)`
    (`lib/rideshare/report-window.ts`); a cancelled trip has no `completedAt`, and the panel's sync does not carry
    `cancelledAt` (the `Ride` model has it), so a cancelled trip can never be reported from the panel even though the
    report route accepts it.
  - **S13-17 (concurrent edits):** `editDirectMessage` (`lib/messages/mutations.server.ts`) re-reads the text inside
    its transaction, but under `READ COMMITTED` two concurrent edits can both read the same prior text and both
    snapshot it, losing one earlier version.
  - **S13-19:** the developer API's characters party endpoint names a hidden member `'A player'` in English
    (`lib/api/v1/characters.server.ts`), while the site translates it.
  - **S13-12 (the unused key):** the `part-of-story` reading key is unused since the story follows moved
    (`locales/en/f-reading.json`); the catalogue tests tolerate it, but it is translated for nothing.
- **Decisions:**
  - **S13-06:** `anonymizeAccount` publishes a `rmhtube:member:erased` message (new constant beside the other two
    channels) with the member's id after its transaction commits; the hub replaces that member's name and avatar in
    every room's buffer and presence list with "Deleted user", and drops their unsent typing state. No Redis: the
    restart behaviour stays (and is logged), as for the other channels.
  - **S13-09:** an all-day entry carries its day key (`allDay: 'YYYY-MM-DD'`, already computed in
    `calendar-entries.ts`) to the grid, and the grid places it by that key in the viewer's calendar, never by the
    noon-UTC instant. Timed entries are unchanged.
  - **S13-15:** the ride sync carries `cancelledAt`; the panel's window uses `completedAt ?? cancelledAt`, and only for a
    trip that had a matched driver (as the report route requires).
  - **S13-17:** the edit transaction locks the message row first (`SELECT … FOR UPDATE` through `tx.$queryRaw` on
    `chat_message`, or `lockKey(tx, 'chat-message-edit:<id>')`), so concurrent edits serialise and each snapshot is the
    text it replaced. The second edit still succeeds.
  - **S13-19:** each hidden party member gains `nameHidden: true` (additive); `name` keeps `'A player'` for existing
    clients. The SDK and docs are regenerated.
  - **S13-12:** the unused key is removed from `locales/en/f-reading.json` (and from the catalogue branch by the next
    `i18n:pull`), after a source search proves no `t('part-of-story'` call remains.
  - **Not taken** (the reason in each case): S13-12's two follows (an owner decision), S13-14's payout rounding (a
    product call), S13-16's trust gate (feature 17), S13-17's erasure of versions under an open report (the spec's
    tradeoff), S13-18's Stripe items (need webhooks).

## Functional requirements

1. FR-1 S13-06: `lib/rmhtube/events.ts` constant; the publish in `lib/account/deletion.server.ts` (a post-commit step,
   not inside the transaction array, under the `s15-18` anchor); the hub's subscriber in `server/rmhtube/index.ts` or
   `room-manager.ts`; unsubscribed at shutdown (`server/rmhtube/shutdown.ts`).
2. FR-2 S13-09: `lib/schedule/slots.ts` (the all-day day key), `lib/schedule/grid.server.ts`, `app/routes/_site/calendar.tsx`.
3. FR-3 S13-15: the ride sync's select (find it beside `ActiveRidePanel.tsx`'s data source in `lib/rideshare/`) and the panel.
4. FR-4 S13-17: `lib/messages/mutations.server.ts` `editDirectMessage`.
5. FR-5 S13-19: `lib/api/v1/characters.server.ts`, `lib/api/registry.ts` example (the existing entry), SDK and docs,
   changelog line under the anchor.
6. FR-6 S13-12: the key removed.

## Non-functional requirements

- **Each item is its own commit**, with its test, so a revert is one item.
- **Raw SQL**, if used for the row lock, names `chat_message` and `"id"` exactly and is asserted in a test.
- **Additive API:** `nameHidden` is a new optional boolean; no field changes type.
- **The hub never imports the web tier** (`server/rmhtube` imports `lib/` relatively).

## Testing requirements

- Main suite `server/rmhtube/__tests__/member-erased.test.ts`: a buffer line and presence row of the member become
  "Deleted user"; other members untouched.
- Main suite `lib/account/__tests__/rmhtube-erased-publish.test.ts`: the publish happens after the transaction, and a
  failed publish does not fail the erasure.
- Product suite `lib/schedule/__tests__/all-day-zones.product.test.ts`: an all-day entry on 3 March lands on 3 March
  for viewers in `Pacific/Kiritimati`, `Etc/GMT+12` and `UTC`.
- Main suite `lib/rideshare/__tests__/cancelled-report-window.test.ts`.
- Main suite `lib/messages/__tests__/concurrent-edit.test.ts`: two edits, two versions (the lock asserted).
- Main suite `lib/api/__tests__/v1-characters-hidden.test.ts`; the SDK check; `lib/__tests__/i18n-catalogs.test.ts`.

## Acceptance criteria

- [ ] After a member is erased, a running RMHTube room shows "Deleted user" on their earlier lines.
- [ ] An all-day interview on 3 March shows on 3 March in Kiritimati and in Baker Island time.
- [ ] A rider can report a trip that was cancelled after a driver accepted it.
- [ ] Two edits sent at once leave two earlier versions.
- [ ] A hidden party member in the developer API carries `nameHidden: true`.

## Out of scope

Everything listed as not taken above.
