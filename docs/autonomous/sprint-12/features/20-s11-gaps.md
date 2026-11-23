# 20 — Close the gaps sprints 10 and 11 left open

Surface: flashcard queue and statistics, the admin API keys page, the public community mod log, the Studio's recorder
and shared projects, a community's Events tab, `/admin/users`, two forms. Wave 7. No namespace of its own (refusal
codes in `errors`; any other string in the file's existing namespace). Both tiers. Hardening.

## User story

As a member and as an admin, I want the small faults sprints 10 and 11 found and wrote down to be fixed, so that what
those features promise is true in every corner: a banned editor really loses a shared deck, a refusal says why, a page
of the mod log is a full page, a recording is what was played, a shared project names no file, a list shows what the
server decided, and a deleted account cannot be granted a membership.

## Requirements elicitation

Each item was recorded by an implementer or integration (sprint 10 summary "Found at integration, not fixed"; the
sprint 11 follow-up list) and is re-checked open at wave start; an item found already fixed is reported and skipped.

- **(a) A banned co-editor keeps a shared deck in their queue and statistics (S11-10).** `deckRole`
  (`lib/study/deck-access.server.ts`) refuses a banned member (`bannedUntil` in the future), but the readers that select
  editable decks by `DeckEditor` rows in the query (`reviewQueue` and the due counts in `lib/study/queue.server.ts`, the
  statistics in `lib/study/stats.server.ts`) use the query fragments `studiedDeckWhere` and `readableDeckWhere`
  (same file as `deckRole`), whose editor branch (`editors: { some: { userId, status: 'accepted' } }`) has no ban
  condition. **Fix:** the editor branch of both fragments also requires the editor not to be banned now (the member's
  `bannedUntil` null or past), so every reader built on them agrees with `deckRole`; `DECK_ACCESS_PATHS`'s registry test
  (`lib/study/__tests__/deck-access-registry.test.ts`) gains a check that no reader filters `editors` by hand.
- **(b) The reserved suspension reason gives a generic toast (S11-19).** `lib/admin/api-keys-schema.ts` refines away
  the reason `DELETION_REQUESTED` (`lib/account/deletion-hold.ts`) with a zod message, so the admin sees "Invalid
  input". **Fix:** the refinement answers `API_KEY_REASON_RESERVED` ("That reason is reserved; write another one")
  through `refusalBody()`, and `components/admin/api-keys/ApiKeysTable.tsx` renders it with `useRefusalText`.
- **(c) Public mod log pages can be short (S11-19).** `listPublicModLog` (`lib/communities/modlog.server.ts`) takes a
  page and then drops rows about private events, so a page can hold fewer rows than its size while more exist.
  **Fix:** the exclusion moves into the query (the action and the event's visibility), so a page is full whenever more
  rows exist; the cursor is unchanged.
- **(d) The Studio's recorder (S11-08):** recording with loop on wraps the transport clock into the take; a start
  failure after `transport.start()` leaves the transport running; `Space` during the count-in marks the take as "was
  playing". **Fix:** refuse to arm a take while looping, with one line ("Turn off loop to record"); stop the transport
  on a start failure; ignore `Space` during the count-in (`lib/studio/hooks/useRecording.ts`, `lib/studio/record.ts`,
  `components/studio/RecordingPopover.tsx`).
- **(e) Shared Studio projects keep audio track names (S11-07).** `sanitizeForShare` (`lib/studio/share.ts`) empties
  each audio clip's `bufferId` and `name`, but an audio **track's** name (often the sample's file name) stays. **Fix:**
  an audio track's name becomes empty in the snapshot, and the opener's copy labels it "Audio track N" (the existing
  untitled-track label if one exists); MIDI track names stay (they are not file names).
- **(f) A refused RSVP leaves a stale Events list (sprint 10 integration).** After a refusal, the community Events tab
  (`components/communities/CommunityEventsPanel.tsx`) keeps showing the optimistic count. **Fix:** invalidate the
  events query on error as on success.
- **(g) The grant button on a deleted account (sprint 10 integration).** `/admin/users`
  (`app/routes/_site/admin/users.tsx`) offers "Grant membership" on the "Deleted user" tombstone row. **Fix:** the row
  hides it (`isDeletedAccount` from `lib/account-lifecycle.ts`), and the grant endpoint refuses a tombstone with `GONE`.
- **(h) Two forms label fields twice or label a `div` (S11-20).** `app/routes/_site/rideshare/drive.tsx`'s `field()`
  helper renders a visible label and an `aria-label` that repeats it; `components/tf2-hud/ui.tsx`'s `Field` puts its
  label on a wrapping `div`. **Fix:** one name per field (the visible label linked with `htmlFor`); the field-names gate
  from sprint 11 20 keeps them.

## Functional requirements

1. FR-1 Each fix above, in its own commit naming the item.
2. FR-2 Refusal code `API_KEY_REASON_RESERVED` under the Wave 0 anchor.
3. FR-3 Every changed reader stays classified in its registry (`DECK_ACCESS_PATHS`, `BAN_ENFORCEMENT_PATHS` if (c)
   touches it, the field-names gate).

## Non-functional requirements

- Each fix is the smallest change that closes the item; no behaviour beyond it changes.

## Data model and API

No schema change.

## Testing requirements

- (a) `lib/study/__tests__/banned-editor.test.ts`: a banned editor's queue, due counts and statistics exclude the shared
  deck; the owner's do not change.
- (b) `lib/admin/__tests__/api-key-reason.test.ts`: the code and its English.
- (c) `lib/communities/__tests__/modlog-pages.test.ts`: a page is full while more rows exist with private events mixed
  in.
- (d) `lib/studio/__tests__/record-guards.product.test.ts`: arm refused while looping; transport stopped on a failed
  start; `Space` in the count-in ignored.
- (e) `lib/studio/__tests__/share-track-names.test.ts`.
- (f) and (g): the smallest render or handler tests the files allow (`renderToStaticMarkup`); (g) the endpoint test.
- (h) the field-names gate.

## Acceptance criteria

- [ ] Each of (a) to (h) is fixed and tested, or reported as already fixed with the evidence.
- [ ] The `serverError(` ratchet does not rise.

## Out of scope

The other follow-ups (owner decisions, and the open designs the plan's risks list).
