# 10 — Change or skip one date of a repeating event

Surface: the event card and its host controls (`components/events/EventCard.tsx`,
`EventComposer.tsx`), the calendar grid and the personal ICS feed. Wave 2.
Namespace `event-occurrences`.

## User story

As the host of a weekly game night, I want to skip the week of a holiday or move
one week to Friday without touching the rest of the series, and have everyone
who said they would come told, so that one exception does not mean cancelling
the whole thing or leaving a date nobody shows up to.

## Requirements elicitation

- **What exists (verified):**
  - `Event.recurrence` (`VarChar(4)`), `recurUntil`, `recurTz`
    (`prisma/schema/events.prisma`); occurrences are computed by
    `lib/calendar/recurrence.ts` (`occurrencesBetween`, `nextOccurrence`,
    `occurrenceIndexOf`, `MAX_EXPANSION`) and `lib/calendar/recurring-events.server.ts`.
  - `Rsvp.occurrenceAt` stores an answer per occurrence; `everyTime` plus
    `occurrenceAt = WHOLE_EVENT` (`lib/calendar/event-model.ts`) is a standing
    answer. Reminders are pg-boss jobs per answer (`runEventReminder`,
    `lib/events.server.ts`), and the worker re-checks state before sending.
  - The only exception is `cancelEvent`, which cancels the whole series and
    notifies everyone who answered.
  - Rotating hosts (`rotatingHostIds`) are assigned per occurrence index.
  - Sprint 05 05 added co-hosts; `assertHostOrAdmin`
    (`lib/events/waitlist.server.ts`, module-private today) decides who may run
    the event.
- **Decisions:**
  - An **override** is keyed by the original occurrence start (`occurrenceAt`,
    UTC) and is either `skip` or `move` (new start, optional new end, optional
    note ≤ 200 characters). One override per occurrence; editing replaces it;
    "Restore" deletes it.
  - Only future occurrences (start > now) can be overridden; at most 52
    overrides per event.
  - A moved occurrence keeps its identity: RSVPs stay keyed by the **original**
    `occurrenceAt`, so answers and waitlist places (sprint 04 02) carry over; only
    the displayed and reminded time changes. A move may not land on or past
    another occurrence of the same series (refused), nor before now.
  - People with an answer for that occurrence (including `everyTime` standing
    answers) are notified (label `event_occurrence`): "Game night on 24 Dec is
    skipped" / "…on 24 Dec moves to Fri 27 Dec, 19:00" in the reader's locale
    and the event's time zone. Waitlisted people are told too.
  - Reminder jobs (`lib/events/reminders.server.ts`): today
    `scheduleEventReminders` uses one date both as the fire base and as the
    job's `occurrenceAt`, and its `singletonKey` (policy `stately`) is keyed by
    that date, so re-enqueuing for a moved occurrence under the original key
    would be dropped while the old job is queued, and the worker never compares
    times. So: `scheduleEventReminders` gains an optional effective start
    (fire base) separate from `occurrenceAt` (the original key), and the
    `singletonKey` includes the effective start; `EventReminderJob` gains an
    optional `startsAt` (the effective start it was scheduled for). On a skip or
    move, the old jobs for that occurrence are removed with the existing
    `cancelEventReminders(eventId, userId, occurrenceAt)` for every answer, and
    a move schedules fresh ones at the new time. As a backstop the worker
    (`runEventReminder`) computes the effective start at send time and returns
    when the occurrence is skipped or when the job's `startsAt` (or, for a job
    without one, its `occurrenceAt`) differs from it. The "every time" chain
    (`occurrenceAfter` in `runEventReminder`) applies overrides: it skips
    skipped occurrences and schedules a moved one at its new time.
  - Rotating host assignment stays by occurrence index (a skip does not shift
    the rotation).
  - The ICS feed emits `EXDATE` for skips and a `RECURRENCE-ID` override VEVENT
    for moves.

## Functional requirements

1. FR-1 On a repeating event, the host (or a co-host) sees each upcoming date in
   the event card's "Upcoming dates" list with a menu: "Skip this date",
   "Change this date…", and for overridden dates "Restore".
2. FR-2 "Change this date…" is a dialog with date, start time, end time (the
   event's time zone, `lib/calendar/tz.ts` `wallToUtcMs`) and a note; Save is
   the ink primary.
3. FR-3 Everyone sees skipped dates struck through with "Skipped" and moved
   dates with the new time and "Moved from Tue 24 Dec" in `t-meta`; the note
   shows beneath.
4. FR-4 RSVP to a skipped date is refused with a message; RSVP to a moved date
   works as for any date.
5. FR-5 The calendar grid (`/calendar`), "my events" (`lib/calendar/my-events.server.ts`)
   and the ICS feed (`lib/calendar/feed.server.ts`, `feed-entries.ts`) apply
   overrides through one function, `applyOverrides(occurrences, overrides)`.
6. FR-6 Every path that lists occurrences is named in
   `OCCURRENCE_READ_PATHS` (`lib/events/occurrences.ts`) and a gate test checks
   each imports `applyOverrides`.

## Non-functional requirements

- **Correctness:** create, replace and restore run in a transaction that first
  calls `lockEventRsvps(tx, eventId)` (`lib/events/waitlist.server.ts`; the
  `'event-rsvp:' + eventId` advisory lock, so a racing RSVP cannot answer a date
  being skipped); the occurrence must be a real occurrence
  of the series (`occurrenceIndexOf` ≥ 0). Notifications are sent after commit,
  once per person (distinct `userId`).
- **Security:** `auth: 'required'`; `rateLimit: 'write'`; zod for times and
  note; host, co-host or admin only (the check `assertHostOrAdmin` in
  `lib/events/waitlist.server.ts` performs; export it from there rather than
  writing a second one).
- **Performance:** overrides are loaded with the event (`@@index([eventId])`,
  at most 52 rows); `applyOverrides` is linear.
- **Privacy:** overrides are event data; erasure nulls `createdById` where the
  member made the override (events of a deleted host are handled as today).
- **i18n:** `event-occurrences`; notification label in `feed`; dates through the
  site's locale formatting (sprint 05 11), never `toLocaleString()` without a
  locale.
- **Steel:** rows on rules; dialog overlay; struck-through text plus the word
  "Skipped" (never colour alone).
- **Accessibility:** the per-date menu is a Radix menu with the date in its
  accessible name.

## Data model and API

- `EventOccurrenceOverride { id String @id @default(cuid()), eventId,
  occurrenceAt DateTime, kind VarChar(4) ('skip' | 'move'), startsAt DateTime?,
  endsAt DateTime?, note VarChar(200)?, createdById String?, createdAt
  @default(now()), updatedAt @updatedAt }`, relation to `Event` (cascade),
  `@@unique([eventId, occurrenceAt])`, `@@map("event_occurrence_override")` in
  `prisma/schema/events.prisma`; `Event.overrides` back-relation. Migration
  `20261126020200_s06_event_occurrences`.
- `lib/events/occurrences.ts` (pure: `applyOverrides`, move validation,
  `OCCURRENCE_READ_PATHS`), `occurrences-schema.ts`, `occurrences.server.ts`
  (`setOverride`, `restoreOccurrence`, `overridesFor`,
  `eventOverrideErasureOps`), `occurrences.contract.ts`.
- Module `lib/events/api/events.$id.occurrences.server.ts` (PUT body
  `{ occurrenceAt, kind, startsAt?, endsAt?, note? }`, DELETE `?occurrenceAt=`).
- Changes: `lib/events.server.ts` (`rsvp` refuses skipped dates;
  `runEventReminder` uses the effective start and the override-aware chain),
  `lib/events/reminders.server.ts` (effective start and `startsAt` on the job),
  `lib/calendar/recurring-events.server.ts`,
  `my-events.server.ts`, `feed-entries.ts` (EXDATE / RECURRENCE-ID),
  `components/events/EventCard.tsx`, new `components/events/OccurrenceMenu.tsx`,
  `OccurrenceDialog.tsx`.

## Testing requirements

- Main suite `lib/events/__tests__/event-occurrences.test.ts`: non-host 403;
  co-host allowed; a time that is not an occurrence refused; a past occurrence
  refused; a move onto the next occurrence refused; RSVP to a skipped date
  refused; answers keyed by the original time survive a move; notifications go
  once to each person with an answer, including standing answers and the
  waitlist; reminder worker skips a skipped date and fires at the moved time;
  a move cancels the old occurrence's jobs and the new job is not dropped by
  the old `singletonKey`; the "every time" chain skips a skipped next date.
- Main suite `lib/events/__tests__/occurrence-read-paths.test.ts` (source scan
  of `OCCURRENCE_READ_PATHS`).
- Product suite `lib/events/__tests__/occurrences.product.test.ts`:
  `applyOverrides` ordering after a move, DST boundary in the event's zone, ICS
  EXDATE and RECURRENCE-ID text.
- `notification-labels.test.ts` pins `event_occurrence`.

## Acceptance criteria

- [ ] A host skips 24 December of a weekly event; people going that week are
      told; the date shows "Skipped" and cannot be answered; other weeks are
      unchanged.
- [ ] Moving 31 December to 30 December keeps everyone's answers and their
      reminder arrives before the new time.
- [ ] The ICS feed in a desktop calendar shows the gap and the moved date.
- [ ] Restore brings the date back.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Changing "this and all following" dates, moving a date's venue or capacity
(11's updates carry such news as text), overrides for non-repeating events.
