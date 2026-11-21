# 02 — Event waitlists

Surface: the RSVP control on event cards and event pages
(`components/events/RsvpButton.tsx`, `EventCard.tsx`), the host's attendee
view, and notifications. Wave 1. Namespace `event-waitlist`.

## User story

As a member who finds a capped event already full, I want to join a waitlist
and be moved in automatically, in order, when someone drops out — and as a
host, I want the seats that free up to fill themselves — so that a full event
stays full without anyone refreshing the page.

## Requirements elicitation

- **What exists (verified):** `Event.capacity` (`prisma/schema/events.prisma`)
  caps `going` RSVPs. For one-off events `rsvp()` in `lib/events.server.ts`
  counts `going` rows and throws `CAPACITY_FULL`; the comment there reads
  "Best-effort under concurrency — v1 has no waitlist": the count and the
  upsert are not serialised, so two members can take the last seat. Repeating
  events already serialise with `pg_advisory_xact_lock` in
  `rsvpRecurring` (`lib/calendar/recurring-events.server.ts`). When a full
  event loses a guest nothing happens: the seat stays empty until someone
  happens to try again. `Rsvp.status` is a string (`'going' | 'maybe' |
  'no'`), so a new status needs no enum migration. Rsvp rows are not erased in
  `anonymizeAccount`, so a deleted member keeps a seat forever.
- **Decisions:** waitlists apply to **one-off events** (the `WHOLE_EVENT`
  occurrence). Repeating events, whose attendance merges standing and
  per-date answers, keep today's behaviour and are out of scope. A waitlist
  is FIFO by `waitlistedAt`, at most 200 long. Promotion is synchronous, inside
  the transaction that frees the seat, so there is no cron. Promotion stops at
  `startsAt`: after the start the waitlist is frozen and shown as such. A host
  raising the capacity promotes that many at once; lowering it never removes
  anyone who is going.

## Functional requirements

1. FR-1 On a full one-off event the RSVP control offers "Join waitlist"
   instead of "Going"; joining shows "You are number 3 on the waitlist" and a
   "Leave waitlist" action.
2. FR-2 When a `going` guest leaves (un-RSVP, switching to `maybe`, account
   erasure) or the host raises the capacity, the first waitlisted member(s)
   become `going`, get the usual event reminders
   (`scheduleEventReminders`), and are notified: "A place opened up: you are
   going to {{event}}" (`SYSTEM`, `entityType: 'event_waitlist'`, link to the
   event).
3. FR-3 Event cards show "Full · 4 waiting" when there is a waitlist; the
   viewer's own state ("Waitlisted, number 3") replaces it for them.
4. FR-4 The host sees the waitlist in order (name, joined time) beside the
   guest list, and can remove someone from it.
5. FR-5 After `startsAt` no one is promoted; the control reads "Waitlist
   closed".
6. FR-6 Cancelling an event clears its waitlist with the guests (existing
   cancellation notice covers both).

## Non-functional requirements

- **Correctness:** every write that can change the `going` count of a
  one-off event (`rsvp`, `unrsvp`, capacity change in `updateEvent`, the
  erasure step) runs in a transaction that first takes
  `pg_advisory_xact_lock(hashtext('event-rsvp:' || eventId))` — the same key
  `rsvpRecurring` uses — then counts, writes and promotes. This also fixes
  the existing last-seat race.
- **Security:** joining a waitlist uses the existing RSVP endpoint
  (`lib/api/routes/events.$id.rsvp.server.ts`) and its visibility check
  (`canViewEvent`); a member who cannot view the event cannot join. Only the
  host (or a site admin) reads or edits the waitlist. Blocked pairs: a member
  the host has blocked, or who has blocked the host, is refused as today.
- **Performance:** `@@index([eventId, occurrenceAt, status, waitlistedAt])`
  for the FIFO read; promotion reads at most the needed rows.
- **Privacy:** the pre-transaction erasure step (anchor `s04-02`) releases
  the member's seats and waitlist places on events that have not started,
  promoting as FR-2, then deletes their remaining Rsvp rows.
- **Accessibility:** the position is text, not only a badge; state changes
  are announced in a polite live region next to the control.
- **i18n:** strings in `event-waitlist`; ordinal position via `Intl.PluralRules`
  with `ordinal` and a `count` interpolation ("number {{count}}" — no English
  suffixes in code).
- **Steel:** the control keeps its existing button roles; the waitlist on the
  host view is rows on rules with `t-meta` times.

## Data model and API

- `Rsvp` gains `waitlistedAt DateTime?` and the index above; `status` gains
  the value `'waitlist'` (documented in the schema comment). Migration
  `20261124010200_s04_event_waitlist`.
- `lib/events/waitlist.ts` (pure: who to promote given capacity, going count
  and the ordered waitlist; position of a member),
  `lib/events/waitlist.server.ts` (`lockEventRsvps(tx, eventId)`,
  `promoteFromWaitlist(tx, event)`, `releaseSeatsOf(userId)` for erasure,
  `listWaitlist(eventId, hostId)`, `removeFromWaitlist`).
- `lib/events.server.ts`: `rsvp()` returns `'waitlist'` when full (only when
  the client asked to join it, `status: 'waitlist'`; a plain `going` on a full
  event still answers `CAPACITY_FULL` so old clients keep their message),
  `unrsvp()` and `updateEvent()` promote, `summarize()` adds `waitlistCount`
  and the viewer's position.
- Contract `lib/events/waitlist.contract.ts` and module
  `lib/events/api/events.$id.waitlist.server.ts`: `GET` (host list),
  `DELETE ?userId=` (host removes). The RSVP schema accepts `'waitlist'`.

## Testing requirements

- Main suite `lib/events/__tests__/event-waitlist.test.ts` (mock Prisma or a
  fake tx): a full event puts the caller on the waitlist; un-RSVP promotes the
  earliest; raising capacity by 2 promotes two; nothing is promoted after
  `startsAt`; a non-host cannot read or edit the waitlist; the lock is taken
  before the count.
- Main suite `lib/account/__tests__/event-waitlist-erasure.test.ts`: the
  erasure step frees the seat and promotes.
- Product suite `lib/events/__tests__/waitlist.product.test.ts`: the pure
  promotion and position functions.

## Acceptance criteria

- [ ] With capacity 2 and two guests, a third member joins the waitlist and is
      promoted (and notified) when a guest leaves.
- [ ] Two members racing for the last seat never both get it.
- [ ] The host sees and can trim the waitlist.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Waitlists on repeating events, offering the seat with a time limit to accept,
paid events.
