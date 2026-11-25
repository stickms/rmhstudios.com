# 09 — Your job search on your calendar

Surface: `/rmhladder/settings` ("Show on my calendar"), `/calendar` "Yours" week, the private calendar feed
(`/api/calendar/<token>.ics`). Wave 3. Namespace `ladder-calendar`. Site tier (Steel).

## User story

As a student with interviews and follow-ups in RMHLadder, I want them on the calendar I already use — the site's "Yours"
week and the calendar app subscribed to my private feed — so that I stop downloading a new calendar file from the
pipeline every time a date changes.

## Requirements elicitation

- **What exists (verified):**
  - RMHLadder keeps dates on each application (`LadderApplication.followUpDate`, `interviewDates DateTime[]`) and on the
    job (`LadderJob.applicationDeadline`), and offers a one-off download: the "Export calendar" link in
    `app/routes/_site/rmhladder/pipeline.tsx` → `GET /api/rmhladder/calendar`
    (`lib/rmhladder/api/rmhladder.calendar.server.ts`), an ICS file that goes stale the moment a date changes, and that
    puts the member's private application `notes` in the event description.
  - The site has one personal calendar: `/calendar` (`app/routes/_site/calendar.tsx`, "Yours" from `getMyGrid` in
    `lib/schedule/grid.server.ts` through `myScheduleQuery`) and the private, tokenised feed
    (`lib/calendar/feed.server.ts` `buildFeedForToken`: RSVPs, office hours, polls, tournaments, study-buddy sessions;
    `lib/calendar/my-events.server.ts`). Neither reads RMHLadder.
  - RMHLadder's own settings: `LadderUserPrefs` (`prisma/schema/rmhladder.prisma`, with `timezone`), edited at
    `app/routes/_site/rmhladder/settings.tsx`.
- **Decisions:**
  - **Opt-in:** a new `LadderUserPrefs.calendarInFeed Boolean @default(false)`; when on, the member's interviews,
    follow-ups and the deadlines of jobs they track (status not rejected or withdrawn) appear in "Yours" and in the
    private feed, 7 days back and 120 ahead (the feed's own window).
  - **What an entry says:** "Interview: {{title}} at {{company}}", "Follow up: …", "Deadline: …", linking to
    `/rmhladder/pipeline`. **Never the notes, contact e-mail, referral name or pay**: a calendar provider stores the
    feed's text, and the feed URL is a bearer credential. Own jobs (feature 08) appear with the titles the member gave.
  - **Times:** an interview at its stored instant (30 minutes); a follow-up and a deadline as all-day entries on the
    day in the member's RMHLadder time zone (`lib/calendar/tz.ts` `dayOf`).
  - **Stable UIDs:** `ladder-interview-<applicationId>-<n>`, `ladder-followup-<applicationId>`,
    `ladder-deadline-<jobId>`, so a subscribed calendar updates entries in place; a removed date disappears at the next
    poll.
  - **The download stays** but stops writing notes into the description (the same privacy reason).
  - **Cache:** the feed is cached for 60 s (`FEED_CACHE_MS`); a change to the setting invalidates it.

## Functional requirements

1. FR-1 Migration `20261220030200_s13_ladder_calendar`: `ALTER TABLE "ladder_user_prefs" ADD COLUMN "calendarInFeed"
   BOOLEAN NOT NULL DEFAULT false`.
2. FR-2 `lib/rmhladder/calendar-entries.ts` (new, pure: applications and jobs → entries, the UIDs, the day rule, the
   text that never carries notes) and `calendar-entries.server.ts` (the read for one member and a window).
3. FR-3 `lib/calendar/feed.server.ts` and `lib/schedule/grid.server.ts` (`getMyGrid`) add the entries when the
   setting is on; the feed's description line names RMHLadder.
4. FR-4 The setting: the RMHLadder settings page gains the switch (its existing server function writes it; the guard
   stays inside the handler); turning it on or off invalidates the feed cache.
5. FR-5 `rmhladder.calendar.server.ts` no longer writes `application.notes` into descriptions.

## Non-functional requirements

- **Privacy:** no private application field leaves in the feed (a test reads the ICS text for every private field).
- **Correctness:** all-day entries land on the right local day across a daylight-saving change (a test in
  `America/New_York`).
- **Performance:** one indexed read of the member's applications (`@@unique([userId, jobId])` leads with `userId`).

## Data model and API

`LadderUserPrefs.calendarInFeed Boolean @default(false)`. No new endpoint.

## Testing requirements

- Product suite `lib/rmhladder/__tests__/calendar-entries.product.test.ts`: entries, UIDs, all-day days in the member's
  zone (a DST boundary), rejected and withdrawn applications excluded.
- Main suite `lib/calendar/__tests__/feed-ladder.test.ts`: off by default; on adds entries; no notes, e-mail, referral or
  pay in the ICS; the cache is invalidated on change.
- Main suite `lib/rmhladder/__tests__/calendar-download.test.ts`: the download carries no notes.
- Gates: server-fn guard ratchet, field names, migration safety.

## Acceptance criteria

- [ ] With "Show on my calendar" on, an interview appears in "Yours" and in the subscribed feed.
- [ ] Moving the interview changes the same calendar entry at the next poll.
- [ ] No application note appears in the feed or in the downloaded file.
- [ ] With the setting off, nothing from RMHLadder appears.

## Out of scope

Reminders by e-mail or push for interviews (RMHLadder alerts cover follow-ups), two-way sync, other members' calendars.
