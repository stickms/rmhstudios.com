# 20 — Flashcard review reminders

Surface: the study hub (`/study`, `app/routes/_site/study/index.tsx`) and study
stats (`/study/stats`), a per-minute cron in the `jobs` worker, notifications
and push. Wave 4 (after 09). Namespace `study-reminders`.

## User story

As a learner using spaced repetition, I want a reminder at a time I choose on
days when cards are due — and none on days when nothing is due — so that I keep
my reviews on schedule without opening the site to check.

## Requirements elicitation

- **What exists (verified):** per-member SM-2 state with `dueAt`
  (`FlashcardReview`, `@@index([userId, dueAt])`,
  `prisma/schema/rmhstudy.prisma`); study streaks (sprint 03,
  `rmhstudy-streaks`) and a generic streak reminder sweep
  (`lib/streak-reminders.server.ts`, `STREAK_REMINDER_QUEUE`) that nudges about
  streaks, not due cards; personal reminders
  (`lib/reminders/reminders.server.ts`) for saved items. Nothing tells a learner
  that cards are due (`grep -ri "dueReminder\|studyReminder"` finds nothing).
- **Decisions:** opt-in, one setting per member: on/off, a local time (15-minute
  steps) and the member's time zone (prefilled from the browser, validated with
  `isValidTimeZone`, `lib/calendar/tz.ts`). At that local time each day, if the
  member has at least one card due (`dueAt <= now`) in decks they still own or
  have cloned, they get one notification: "{{count}} flashcards are due",
  linking to `/study`. At most one per local day (claimed by CAS on
  `lastSentDay`). Generated cards from 09 count like any card. Paused
  automatically after 14 consecutive reminders with no review in between (the
  setting shows "Paused because you have not reviewed in two weeks" and a Resume
  button), so the site never nags someone who stopped.

## Functional requirements

1. FR-1 `/study` and `/study/stats` show a "Reminders" row: a switch, a time
   select, the time zone (with "Change"), and the next reminder time in the
   member's zone.
2. FR-2 The cron (every minute) finds members whose local time has just passed
   their chosen time today and who have not been sent today, claims them, counts
   due cards, and notifies those with at least one.
3. FR-3 The notification is `SYSTEM`, `entityType: 'study_due'`, through
   `createNotification` (so quiet hours, categories and push apply).
4. FR-4 A review in the meantime resets the no-review counter (stamped from the
   review endpoints: `lib/study/api/study.cards.$id.review.server.ts`).
5. FR-5 After 14 reminders without a review, reminders pause until the member
   resumes.

## Non-functional requirements

- **Correctness:** claiming is a conditional `updateMany({ where: { userId,
  enabled: true, paused: false, OR: [{ lastSentDay: null }, { lastSentDay: { lt:
  today } }] }, data: { lastSentDay: today } })` with `today` the member's local
  day key (`dayOf`, `lib/calendar/tz.ts`); only a claimed row is notified. The
  sweep selects candidates by a precomputed `nextAt` UTC instant (stored on save
  and after each send) with `@@index([enabled, nextAt])`, so each run reads only
  due rows, at most 1 000 per minute.
- **Security:** settings endpoint `auth: 'required'`, `rateLimit: 'write'`,
  zod-validated (`time` `HH:MM` on a 15-minute grid, valid IANA zone).
- **Privacy:** erasure deletes the row; export includes the setting.
- **Counts:** the due count is one `count` on `flashcard_review` by `userId` and
  `dueAt` (existing index).
- **i18n:** `study-reminders`; times formatted in the member's zone with the
  active locale; count via `count` interpolation (plural forms).
- **Steel:** one settings row with the shared switch and select; `t-meta`
  next-time line.
- **Accessibility:** controls labelled; the paused state is text, not only an
  icon.

## Data model and API

- `FlashcardReminder { userId String @id, enabled Boolean @default(false),
  localTime VarChar(5), timeZone VarChar(64), nextAt DateTime?, lastSentDay
  VarChar(10)?, sentSinceReview Int @default(0), paused Boolean @default(false),
  updatedAt @updatedAt }`, `@@index([enabled, nextAt])`,
  `@@map("flashcard_reminder")` in `prisma/schema/rmhstudy.prisma`; relation to
  `User` under the auth anchor. Migration
  `20261125040100_s05_flashcard_reminders`.
- `lib/study/reminders.ts` (pure: next instant from local time and zone,
  DST-safe through `wallToUtcMs`; pause rule), `lib/study/reminders.server.ts`
  (`getReminder`, `saveReminder`, `runDueReminderSweep`,
  `registerStudyReminderCron`, `markReviewed`, `exportStudyReminder`).
- Contract `lib/study/reminders.contract.ts`; module
  `lib/study/api/study.reminders.server.ts` (GET, PUT).
- `server/jobs/index.ts`: register the cron under the anchor; notification label
  `study_due` → "Study" in `components/feed/notification-labels.ts` under the
  anchor (with its test line).

## Testing requirements

- Product suite `lib/study/__tests__/reminders.product.test.ts`: next instant
  across DST changes in `Europe/London` and `America/New_York`, the 15-minute
  grid, the pause rule.
- Main suite `lib/study/__tests__/reminders.test.ts`: the sweep notifies a
  member with due cards once per local day (a second run does nothing), skips
  members with none (and still advances `nextAt`), pauses after 14, resumes; a
  review resets the counter.
- Main suite `lib/account/__tests__/study-reminders-erasure.test.ts`.

## Acceptance criteria

- [ ] With reminders at 18:00 and cards due, the member gets one notification at
      18:00 local time, and none on a day with nothing due.
- [ ] Two sweep runs in the same minute send one notification.
- [ ] Reminders pause after two idle weeks and resume on request.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

E-mail reminders, per-deck reminders, smart timing.

## As built

- "Due" matches the deck page (`due_today` in `lib/study/stats.server.ts`): scheduled cards with `dueAt <= now`
  plus reviewable cards the member never reviewed, in decks they own. The study code has no daily new-card
  limit, so none is applied. This extends the spec's `dueAt` count so a member who just made a deck is reminded.
- Banned members (`bannedUntil` in the future) are skipped; their `nextAt` still moves on. Deleted members lose
  the row in erasure. Quiet hours, categories and push come from `createNotification`.
- `MAX_LATE_MS` is 3 hours: a send the worker missed by more than that (outage) is skipped for the day, not
  delivered at the wrong time. Late by less is still sent.
- The sweep reads `enabled AND NOT paused AND nextAt <= now` by `@@index([enabled, nextAt])`, at most
  `SWEEP_BATCH` (1 000) rows per run, oldest first; the rest wait one minute. The claim is a compare-and-set on
  `nextAt` and `lastSentDay`, so concurrent workers send once.
- `markReviewed` runs after the review transaction and its failure is logged, never thrown.
- The export carries the setting at `flashcards.reminder` (`lib/account/__tests__/export-study-reminder.test.ts`).
