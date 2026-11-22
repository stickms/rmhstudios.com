# 11 — Updates to the people coming

Surface: the event card (`components/events/EventCard.tsx`), the host view, and
notifications. Wave 4 (after 10). Namespace `event-updates`.

## User story

As the host of an event, I want to post a short update — "we moved to room 4",
"bring a controller", "starting 15 minutes late" — that everyone who is coming
is told about and that stays on the event page, so that I do not have to
message thirty people or hope they reread the description.

## Requirements elicitation

- **What exists (verified):** the only event notifications are reminders
  (`runEventReminder`), the waitlist promotion (sprint 04 02), co-host
  invitations (sprint 05 05), cancellation (`cancelEvent`) and 10's date
  changes. Hosts can edit the description (`updateEvent`), which notifies
  nobody. There is no update model (`grep -i "eventUpdate\|notifyAttendees"`
  finds nothing).
- **Decisions:**
  - An update is plain text, 1–500 characters, posted by the host, a co-host or
    an admin. It may target one occurrence of a repeating event (default: the
    next one) or the whole series.
  - Recipients: everyone whose answer for that occurrence (or any future one,
    for a series update) is `going` or `maybe`, plus the waitlist, minus the
    author. Never people who answered `no`.
  - Notification label `event_update`; preview is the first 120 characters.
    Created with `createNotification` so preferences, quiet hours and push apply.
  - At most 3 updates per event per 24 hours (rolling), so updates cannot become
    a broadcast channel. Updates cannot be edited; the author (or an admin) may
    delete one within 10 minutes, after which it stays (people were notified).
  - Updates are shown on the event, newest first, to anyone who can view the
    event (`canViewEvent`). A blocked pair (either direction) does not stop the
    update from being visible on the page, but the blocked member is not
    notified (the existing rule: blocks are refused where members interact).
  - A cancelled event cannot get updates.

## Functional requirements

1. FR-1 Hosts and co-hosts see "Post an update" on the event card; it opens a
   dialog with a textarea, counter, occurrence `Select` (for repeating events)
   and "Post and notify N people" as the ink primary (N from a preview count).
2. FR-2 The event card shows the latest update under the description with the
   author and `t-meta` time, and "All updates (n)" opening the full list.
3. FR-3 Delete within 10 minutes (confirmed with `useConfirm`); after that the
   control is gone.
4. FR-4 The 3-per-24-hours limit is explained when reached, with the time the
   next update becomes possible.
5. FR-5 Updates appear in the event's ICS `DESCRIPTION` (latest first, at most
   3) so calendar apps show them.

## Non-functional requirements

- **Correctness:** the limit check and insert run in a transaction after
  `lockKey(tx, 'event-update:' + eventId)`. Notifications are fanned out after
  commit through a pg-boss work queue (`event-update-fanout`), so a 500-person
  event does not hold the request; the job claims the update with a
  compare-and-set on `notifiedAt` before sending.
- **Security:** `auth: 'required'`; `rateLimit: 'write'`; zod for text and
  occurrence; host, co-host or admin only (the same check as 10). Text renders
  as text with links made safe by the existing `SafeLink` component.
- **Performance:** recipients are selected with one distinct query on
  `rsvp(eventId, occurrenceAt, status)` (existing index), batched 200 at a time
  in the job.
- **Privacy:** erasure nulls `authorId` on updates the member wrote (the update
  is event content, like a description); export includes updates the member
  wrote.
- **i18n:** `event-updates`; notification label in `feed`.
- **Steel:** updates are rows on rules inside the card; dialog overlay; one ink
  primary.
- **Accessibility:** the list is a `<ul>`; the dialog's count is part of the
  button's text, not a tooltip.

## Data model and API

- `EventUpdate { id String @id @default(cuid()), eventId, occurrenceAt
  DateTime?, authorId String?, body VarChar(500), createdAt @default(now()),
  notifiedAt DateTime?, deletedAt DateTime? }`, relation to `Event` (cascade),
  `@@index([eventId, createdAt(sort: Desc)])`, `@@map("event_update")` in
  `prisma/schema/events.prisma`; `Event.updates` back-relation. No `User`
  relation (plain id column). Migration `20261126040100_s06_event_updates`.
- `lib/events/updates.ts` (pure: limits, window, delete window), `updates-schema.ts`,
  `updates.server.ts` (`postUpdate`, `listUpdates`, `deleteUpdate`,
  `recipientCount`, `runEventUpdateFanout`, `registerEventUpdateWorker`,
  `eventUpdateErasureOps`, `exportEventUpdates`), `updates.contract.ts`.
- Modules `lib/events/api/events.$id.updates.server.ts` (GET, POST),
  `events.$id.updates.$updateId.server.ts` (DELETE),
  `events.$id.updates.recipients.server.ts` (GET count).
- `server/jobs/index.ts`: one registration under the Wave 0 anchor.
- `components/events/EventUpdates.tsx`, `PostUpdateDialog.tsx`;
  `lib/calendar/feed-entries.ts` adds the ICS description lines.

## Testing requirements

- Main suite `lib/events/__tests__/event-updates.test.ts`: only hosts, co-hosts
  and admins post; the fourth update in 24 hours refused under the lock; delete
  after 10 minutes refused; cancelled event refused; recipients include going,
  maybe and waitlist for the targeted occurrence and exclude `no`, the author
  and blocked pairs; the fan-out job claims once.
- Main suite `lib/account/__tests__/event-updates-erasure.test.ts`.
- Product suite `lib/events/__tests__/updates.product.test.ts`: rolling window,
  ICS description truncation and escaping.
- `notification-labels.test.ts` pins `event_update`.

## Acceptance criteria

- [ ] A host posts "We moved to room 4"; everyone going is notified once and the
      update shows on the event.
- [ ] People who answered "no" are not notified.
- [ ] A fourth update in a day is refused with when the next is possible.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Replies to updates, updates by email, scheduling an update for later.
