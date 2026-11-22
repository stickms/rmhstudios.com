# 18 — Reading time

Surface: the reading tools on library books, blog posts and news articles
(`components/reading/*`), the "My reading" page (`/reading`,
`components/reading/MyReadingView.tsx`). Wave 6. Namespace `reading-time`.

## User story

As a reader trying to read more, I want the site to keep track — if I ask it
to — of how long I actually spend reading each day and in each book, and to set
myself a weekly number of minutes, so that I can see whether the habit is
holding without timing myself.

## Requirements elicitation

- **What exists (verified):**
  - Reading tools on three kinds of document (`ReadingDocKind`: `library`,
    `blog`, `news`; `prisma/schema/library.prisma`): highlights and notes,
    shelves (`ReadingShelfEntry`), a yearly goal in books or pages
    (`ReadingGoal`, `ReadingGoalUnit`; `lib/reading/goal.ts` `paceFor`), reading
    place sync (sprint 04 09), listen (sprint 02 12), the reader tools mount
    (`LibraryReadingMount.tsx`, `ArticleReading.tsx`, `ReaderReadingTools.tsx`),
    and `/reading` (`app/routes/_site/reading/index.tsx`, `MyReadingView.tsx`)
    with shelves and the goal.
  - **No time is recorded anywhere** (`grep -rn "minutesRead\|readingMinutes\|
    timeRead" lib prisma` finds nothing). `ReadingPrefs` holds only shelf
    visibility.
  - Day keys in a member's time zone: `lib/calendar/tz.ts` (`dayOf`,
    `isValidTimeZone`).
- **Decisions:**
  - **Opt-in.** "Keep track of my reading time" on `/reading`
    (`ReadingPrefs.trackTime`, default off). Nothing is measured or sent until
    it is on; turning it off stops recording and offers "Delete my reading
    time" (`useConfirm`).
  - **How time is measured, without a timer:** the reader tools record
    timestamps of reading activity — scroll, key, pointer and page turns inside
    the document, and the document becoming visible — and count the gap
    between two consecutive activities as reading when it is at most 2 minutes
    (longer gaps count as 2 minutes: someone reading a long page does not
    scroll). Time stops counting when the tab is hidden. No interval, no
    `requestAnimationFrame`, no observer (R5/B3): the counting happens inside
    the event handlers that already exist or are added as passive listeners.
    Listen mode (text-to-speech) counts while speech is playing, from its
    start and end events.
  - **Flush:** accumulated seconds are sent with `api(contract, input)`
    (`keepalive`) when the tab becomes hidden, on `pagehide`, and when more than
    5 minutes have accumulated (checked inside the activity handler), each
    request at most 900 seconds for one document.
  - **Storage:** one row per member, day (in the member's time zone, from the
    request's `tz`, validated with `isValidTimeZone`, falling back to UTC) and
    document: `ReadingTimeDay(userId, day, docKind, docKey, seconds)`,
    incremented with an upsert; the server caps a member's day at 24 hours
    total and refuses documents that do not exist (`docExists`).
  - **The weekly target** (`ReadingPrefs.weeklyMinutesTarget Int?`, 10–2,000)
    and the week's progress use the member's locale week start
    (`lib/locale-week.ts`).
  - **What `/reading` shows** (only to the member; never public, never on the
    profile): this week, minute totals per day (rows on rules with `t-meta`
    figures — D10's default, no chart), the target and how far along, the last
    four weeks' totals, and "Most time this month" (top five documents with
    title and minutes).
  - Each book's or article's reader tools show "You've read this for
    {{minutes}} minutes" in the tools panel when tracking is on.

## Functional requirements

1. FR-1 The opt-in switch, the delete action and the weekly target field on
   `/reading`.
2. FR-2 The activity-based measure and flush in the reader tools for all three
   document kinds and in listen mode.
3. FR-3 `POST /api/reading/time` (contract + `implement()`) with the caps.
4. FR-4 The reading-time section on `/reading` and the per-document line in the
   tools panel.
5. FR-5 Tracking off: nothing is sent (test), and no listener is attached.

## Non-functional requirements

- **Privacy:** opt-in; own data only; never in any public payload, OG card,
  profile or developer API; erased with the account; in the export (per-day
  totals per document).
- **Correctness:** the pure accumulator (`accumulate(prev, now)`, the 2-minute
  cap, hidden time excluded) is shared by every document kind; the server's
  daily cap is enforced in the upsert transaction, which first takes
  `lockKey(tx, 'reading-time:<userId>:<day>')` so two concurrent flushes (two
  tabs) cannot both pass the 24-hour check; the excess over the cap is
  dropped, not refused, so a flush never retries forever. A flush is
  attributed to the day of the request (a span crossing midnight lands on the
  later day; accepted, documented in the module).
- **Steel R5 / B3 (checked in validation):** the measure adds passive
  listeners only while tracking is on and a reader document is mounted;
  nothing is scheduled, nothing runs between events, nothing moves, so the
  page at rest is unchanged and `testing/e2e/steel-rest.mjs` stays green.
- **Performance:** at most one request per document per 5 minutes of reading;
  the `/reading` section is three grouped queries on
  `@@index([userId, day])`.
- **Security:** `auth: 'required'`; `rateLimit: { limit: 30, windowMs:
  60_000, prefix: 'reading-time' }`; zod (`seconds` 1–900, `docKey` ≤ 200).
- **Motion and loops:** no timers, intervals, rAF or observers (the rAF
  allowlist and `steel-rest` checks must stay green).
- **Steel:** rows on rules; figures in `t-meta`; no progress bar styling
  beyond text ("{{done}} of {{target}} minutes").
- **i18n:** `reading-time`; minutes and dates through the locale formatters.

## Data model and API

- `ReadingTimeDay { userId, day VarChar(10), docKind ReadingDocKind, docKey
  VarChar(200), seconds Int, updatedAt @updatedAt }`, `@@id([userId, day,
  docKind, docKey])`, `@@index([userId, day])`, relation to `User` (cascade),
  `@@map("reading_time_day")`; `ReadingPrefs.trackTime Boolean
  @default(false)`, `weeklyMinutesTarget Int?`. `User` back-relation under the
  auth anchor. Migration `20261127060200_s07_reading_time`.
- `lib/reading/time.ts` (pure accumulator and caps), `time-schema.ts`,
  `time.contract.ts`, `time.server.ts` (`recordReadingTime`,
  `readingTimeSummary`, `setTracking`, `setWeeklyTarget`, `deleteReadingTime`,
  `readingTimeErasureOps`, `exportReadingTime`).
- Modules `lib/reading/api/reading.time.server.ts` (POST record, GET summary,
  DELETE all) and `reading.time.prefs.server.ts` (PUT).
- Client: `components/reading/useReadingClock.ts` (the handler-driven
  accumulator), `ReadingTimeSection.tsx`, `ReadingTimeLine.tsx`; edits to the
  reader tool mounts and `MyReadingView.tsx`.

## Testing requirements

- Main suite `lib/reading/__tests__/reading-time.test.ts`: tracking off refuses
  and records nothing; record increments the day row; the 24-hour daily cap;
  unknown document refused; two concurrent flushes at 23h59m of a day cannot
  exceed 24 hours (lock); time zone day keys at midnight boundaries; delete
  all; summary totals and week start by locale.
- Main suite `lib/account/__tests__/reading-time-erasure.test.ts`.
- Product suite `lib/reading/__tests__/time.product.test.ts`: the accumulator
  (gaps, cap, hidden time, listen spans).
- Component test: with tracking off the hook attaches no listeners and sends
  nothing; with it on, hiding the tab flushes once.
- Gate tests: rAF allowlist, `useeffect-fetch-ratchet` (flush is an event
  handler, not an effect fetch), raw-api-fetch ratchet.

## Acceptance criteria

- [ ] With tracking on, reading a chapter for 20 minutes adds about 20 minutes
      to today; leaving the tab open in the background adds nothing.
- [ ] With tracking off, no reading-time request is ever made.
- [ ] The week view shows each day's minutes against a 150-minute target.
- [ ] Deleting reading time removes every row.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Public reading stats, streaks for reading, reading speed, time on other site
pages, a minutes unit for the yearly goal.
