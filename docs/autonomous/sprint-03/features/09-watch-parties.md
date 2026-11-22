# 09 — Scheduled watch parties with reminders

Surface: the RMHTube landing (`/rmhtube`), a new party page
(`/rmhtube/party/$roomId`) and the RMHTube room. Wave 4. Namespace
`watch-parties`.

## User story

As a member who hosts RMHTube watch parties, I want to schedule a party for a
time, describe it, share a link where people can say they are coming and add
it to their calendar, and have the site remind them when it starts — so that
people actually turn up, instead of me posting a room code and hoping.

## Requirements elicitation

- **What exists (verified):** `RmhTubeRoom` has `scheduledFor DateTime?` and
  `description` (`prisma/schema/rmhtube.prisma`), `RoomBrowseItem` carries
  `scheduledFor` (`lib/rmhtube/types.ts`, "Phase 4: Room Scheduling") and the
  landing shows a "Scheduled" badge when it is in the future
  (`components/rmhtube/RmhTubeLanding.tsx`). But **nothing sets it**: the hub's
  browse answer hard-codes `scheduledFor: null`
  (`server/rmhtube/room-manager.ts`), room creation takes no time, and there is
  no RSVP, reminder or calendar export. Rooms persist in the database and the
  hub loads a room by id from the database on join (the `findUnique` with
  `closedAt: null` near the end of `room-manager.ts`), so a room created ahead
  of time by an HTTP endpoint can be joined later. An iCalendar builder exists
  (`lib/events-ics.ts`).
- **Decisions:** scheduling creates the room row ahead of time with a code from
  `generateRoomCode` (`lib/rmhtube/utils.ts`) and the host's settings; members
  RSVP ("Going") on the party page; a pg-boss job every 5 minutes sends one
  notification 15 minutes before and one at the start to everyone going (each
  at most once: `remindedAt`, `startedNotifiedAt` columns). A party not opened
  within 3 hours of its time is closed by the same job (`closedAt`). Parties
  are public or link-only (the room's `isPublic`); password rooms cannot be
  scheduled (a password cannot be shared on a public page).

## Functional requirements

1. FR-1 "Schedule a party" on the landing: name, description (≤ 500), date and
   time (15 minutes to 30 days ahead), public or link-only, max members, and
   optionally a first video URL for the queue (validated by the existing media
   rules in `lib/rmhtube/media.ts`).
2. FR-2 `/rmhtube/party/$roomId`: name, host, time in the viewer's zone with a
   relative time ("in 2 hours") computed when the page renders — no ticking
   timer, description,
   "Going" toggle with the count and the first avatars, "Add to calendar"
   (`.ics`), "Copy link", and "Join room" (enabled from 15 minutes before).
3. FR-3 The landing has an "Upcoming parties" section: public parties in the
   next 7 days, soonest first, and the member's own (hosting or going) at the
   top.
4. FR-4 Reminders: notification "Starting in 15 minutes: <name>" and
   "Starting now: <name>" linking to the room; the inbox labels them RMHTube
   (`systemIdentity` in `components/feed/NotificationsColumn.tsx`).
5. FR-5 The host can edit the time, name and description (going members are
   notified once of a time change) or cancel (going members are notified; the
   room is closed).
6. FR-6 The hub's browse answer returns the real `scheduledFor`, so the
   existing badge works.

## Non-functional requirements

- **Security:** scheduling is session-only, rate-limited (5 a day per
  member), at most 5 upcoming parties per host; RSVP requires a session; a
  link-only party is reachable only by its code (not listed); the party page
  shows no member list beyond the first 5 avatars and the count. Text fields
  are zod-bounded and rendered as text.
- **Reliability:** the reminder job claims rows with `updateMany … where
  remindedAt is null` so two workers cannot double-send; it takes an advisory
  lock like other jobs.
- **Performance:** upcoming list by `@@index([isPublic, scheduledFor])`
  (partial use: `closedAt` null); RSVPs by `(roomId)` and `(userId)`.
- **SEO:** a public party page has its own title, description and OG card
  (`ogCardPath` — add a `watch-party` kind if no suitable one exists, or a
  section card in `lib/og/static-cards.ts`); link-only parties are `noindex`.
- **Accessibility:** the time is in a `<time datetime>`; the Going toggle is
  `aria-pressed`.
- **i18n:** strings in `watch-parties`; times through `Intl.DateTimeFormat`
  with the viewer's zone and locale.
- **Steel (app tier):** RMHTube is full-screen; use its app-tier styles. One
  primary per view (Schedule in the form; Join or Going on the party page,
  whichever is the current action).

## Data model and API

- New model `RmhTubeRoomRsvp { roomId, userId, createdAt, remindedAt
  DateTime?, startedNotifiedAt DateTime?, @@id([roomId, userId]),
  @@index([userId]), @@map("rmhtube_room_rsvp") }` with cascades to the room
  and the user; `RmhTubeRoom` gains `@@index([isPublic, scheduledFor])`.
- Migration `20261123040200_s03_watch_party_rsvps`.
- `lib/rmhtube/parties.ts` (pure: schedule window, reminder selection, ICS
  event mapping), `lib/rmhtube/parties.server.ts`,
  `lib/rmhtube/parties-schema.ts`, `lib/rmhtube/parties.contract.ts`,
  `lib/rmhtube/parties-jobs.server.ts` (registered in `server/jobs/index.ts`,
  `rmhtube.party-reminders`, `*/5 * * * *`).
- Modules: `lib/rmhtube/api/rmhtube.parties.server.ts` (GET upcoming, POST
  schedule), `rmhtube.parties.$roomId.server.ts` (GET, PATCH, DELETE),
  `rmhtube.parties.$roomId.rsvp.server.ts` (PUT, DELETE). The `.ics` download
  is a route file (`app/routes/api/rmhtube/parties/$roomId[.]ics.ts`) because
  it is not JSON — check how `lib/events-ics.ts` is served today and copy it.
- `server/rmhtube/room-manager.ts`: browse returns `scheduledFor`.
- `anonymizeAccount` deletes the member's RSVPs and cancels their upcoming
  parties.

## Testing requirements

- Main suite `lib/rmhtube/__tests__/watch-parties.test.ts`: only the host can
  edit or cancel; the job sends each reminder once when run twice; a
  link-only party is not listed; password rooms cannot be scheduled; the
  host limit holds.
- Main suite `lib/account/__tests__/watch-party-erasure.test.ts`.
- Product suite `lib/rmhtube/__tests__/parties.product.test.ts`: schedule
  window, reminder selection, ICS output.

## Acceptance criteria

- [ ] A scheduled party appears in Upcoming with its time in my zone.
- [ ] Going members get one reminder 15 minutes before and one at the start.
- [ ] The `.ics` opens in a calendar app with the right time.
- [ ] Joining at the time opens the room with the first video queued.
- [ ] 390 px and 1280 px, and `ar`.

## Out of scope

Recurring parties, inviting by notification (sharing the link covers it),
calendar subscription feeds.
