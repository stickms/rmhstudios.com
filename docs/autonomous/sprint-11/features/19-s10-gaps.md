# 19 — Close the gaps sprints 09 and 10 left open

Surface: deck suggestions (`/study`), the community public mod log, Settings > Blocked and muted, admin key suspension,
account erasure of AI personas. Wave 6. Namespace none (no new interface strings; any refusal uses an existing
`ERROR_CODES` entry). Hardening.

## User story

As a member, I want the small privacy and safety gaps the last two sprints wrote down to be closed, so that a suggestion
does not reveal what someone else suggested, a private event does not leak into a public log, names read the right way
round, an admin's note cannot undo a deletion pause, and my erased persona keeps none of my words.

## Requirements elicitation

Each item was checked against the sprint 10 branch tip, and re-checked after sprint 10 integration finished (s10-20
merged): all six are still open in the code as described. **At wave start, re-read each named place and drop an item
that has been fixed since** (say so in the report).

- **(a) A duplicate suggestion reveals someone else's.** `createSuggestion` in `lib/study/suggestions.server.ts` refuses
  `409 duplicate` when any open suggestion on the card has the same front and back
  (`findFirst({ where: { deckId, cardId, status: 'open', front, back } })`), whoever made it, which tells a studier that
  another member suggested exactly that (s10-04 follow-up). **Fix:** scope the duplicate check to the suggester's own
  open suggestions; two members may each suggest the same fix (the author sees both, grouped by the existing display).
- **(b) "Decline and block" loses the block when it loses the race.** In `decideSuggestion`, a decline whose
  compare-and-set finds the suggestion already decided throws `already-decided` before the block runs, so a "Decline and
  block" that loses to a concurrent decision blocks nobody (s10-04 follow-up). **Fix:** when the decision is a decline
  with `block`, the block (the `updateMany` that declines the suggester's other open suggestions on the author's decks;
  there is no separate block table) runs whether or not this request won the decline; the response still says
  `already-decided` for the suggestion itself, with the number the block declined.
- **(c) A private community's event writes a public log row.** `createEvent` (`lib/events.server.ts`) logs
  `event_hosted` for every community event, and `event_hosted` is in `PUBLIC_MOD_ACTIONS` (`lib/communities/modlog.ts`),
  so an invite-only event's existence reaches the public log (s10-07 follow-up). **Fix:** the public log reader
  (`lib/communities/modlog.server.ts`, `listPublicModLog`) leaves out `event_hosted` and `event_cancelled` rows whose
  event is not `PUBLIC` (`Event.visibility`, `EventVisibility` in `prisma/schema/events.prisma`), and rows whose event
  no longer exists; the moderators' log keeps them. No row is deleted.
- **(d) Repost-mute rows show names without isolation.** `components/settings/RepostMutesSection.tsx` renders member
  names with no `<bdi>` or `dir="auto"`; `lib/i18n/user-text.ts` exempts it by exact path as "a known gap" (s10-08
  follow-up). **Fix:** wrap each name in `<bdi>`, list the file in `USER_TEXT_RENDERERS`, and remove the exemption.
- **(e) An admin can lift a deletion pause by accident.** `restoreAfterCancel` (`lib/account/deletion-hold.server.ts`)
  lifts suspended keys whose `suspendReason` equals `DELETION_REQUESTED`, so an admin suspending a key with that exact
  text has it lifted on restore (s09-14 follow-up). **Fix:** the admin suspension route
  (`lib/admin/api/admin.api-keys.$id.server.ts`) refuses that reason text, compared trimmed and case-insensitively,
  through a `refine` on `suspend.reason` in the body schema it already binds (`apiKeyPatchBody`,
  `lib/admin/api-keys-schema.ts`, importing `DELETION_REQUESTED` from the client-safe `lib/account/deletion-hold.ts`)
  whose message says the text is reserved; the handler's usual zod `400` answers it (no new code, no new namespace
  string), and the hold's own writes are unchanged.
- **(f) A kept private persona keeps its prompt.** A private `AiPersona` that others chatted with is kept at erasure so
  their chats survive, with the member's `systemPrompt` still on it (s09-15 follow-up;
  `lib/account/erasure-lists.server.ts`). **Fix:** in the same erasure step, set its `systemPrompt` to `''` and its
  `tagline` and `greeting` to `null` (the name, emoji and avatar stay: they are how the other members' chats show it),
  and update the registry reason.

## Functional requirements

1. FR-1 (a) in `lib/study/suggestions.server.ts`; (b) in the same file's decision function.
2. FR-2 (c) in the public mod log reader; the event's visibility read in the same query (a join or one `findMany` of the
   listed event ids).
3. FR-3 (d) in `RepostMutesSection.tsx` and `lib/i18n/user-text.ts`.
4. FR-4 (e) in `lib/admin/api-keys-schema.ts` (the schema the route binds); the route file changes only if the
   refinement cannot live in the schema.
5. FR-5 (f) in `lib/account/erasure-lists.server.ts` and the `AiPersona` registry reason; `pnpm docs:deletion`.

## Non-functional requirements

- **No behaviour change beyond each fix;** every existing test of these paths stays green or is updated with the reason.
- **No new strings** unless an item cannot use an existing code; then a new key in the owning namespace.

## Data model and API

- No schema change, no new endpoint, no `/api/v1` change.

## Testing requirements

- `lib/study/__tests__/deck-suggestions.test.ts` (extended): another member's identical open suggestion no longer
  refuses; the suggester's own still does; a "Decline and block" that loses the race still declines the rest and blocks.
- `lib/communities/__tests__/mod-log.test.ts` (extended): a private event's rows are absent from the public log and
  present in the moderators' log.
- `lib/__tests__/user-text-direction.test.ts` passes with the exemption removed.
- `lib/admin/__tests__/api-keys.test.ts` (extended): the reserved reason is refused.
- `lib/account/__tests__/lists-erasure.test.ts` (extended, the persona cases): the kept persona's prompt is empty and
  its tagline and greeting are null.

## Acceptance criteria

- [ ] Two members can each suggest the same correction; neither learns of the other.
- [ ] An invite-only community event leaves no row in the public mod log.
- [ ] An Arabic name in Settings > Blocked and muted reads correctly in an English sentence.
- [ ] Restoring a cancelled deletion never lifts a key an admin suspended.
- [ ] An erased member's kept persona has no prompt.

## Out of scope

Anything on the follow-up list that is an owner decision (moderator notes in exports, the deletion grace period, blocked
members at events, RMHBox history privacy, ownership transfer in the public log, emoji reactions under quiet counts).
