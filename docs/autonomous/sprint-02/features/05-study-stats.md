# 05 — Flashcard review history and statistics

Surface: `/study`. Wave 2. Namespace `study-stats`.

## User story

As someone who reviews flashcards every day, I want to see how many cards I
reviewed each day, how many are coming due this week, how well I remember mature
cards and how far along each deck is, so that I can plan my study time and trust
that the spaced repetition is working.

## Requirements elicitation

- **What exists (verified):** `FlashcardReview` keeps only the **current** SM-2
  state per user and card (ease, interval, repetitions, dueAt). A review
  overwrites it, so no history exists to compute retention or activity from. No
  stats page exists under `/study` (no forecast or heatmap code in `lib/study`,
  `lib/rmhstudy` or `components/feed/*Deck*`).
- **Decisions:** add an append-only review log written in the same transaction
  as the SM-2 update. Statistics start from the day this ships; the page says so
  ("History since <date>") rather than inventing the past. The forecast comes
  from the existing `dueAt`, so it works from day one. Card states follow the
  usual SRS vocabulary: new (no review), learning (interval under 1 day), young
  (1 to 20 days), mature (21 days or more).
- **Shared components:** this feature creates two token-agnostic presentational
  components later features reuse: `components/ui/day-heatmap.tsx` (a year of
  days) and `components/ui/bar-chart.tsx` (labelled vertical bars). Both take a
  CSS custom property for ink so the app tier can use them too.

## Functional requirements

1. FR-1 Every review writes a `FlashcardReviewLog` row (grade, resulting
   interval and ease, time).
2. FR-2 `/study/stats`: reviews per day for the last 365 days (heatmap), current
   and longest daily review streak, reviews today and this week.
3. FR-3 Forecast: cards due per day for the next 30 days (bar chart), with
   overdue cards counted on today.
4. FR-4 Retention: share of reviews graded 1 or more (anything except Again) on young and mature cards
   over the last 30 days, each with its sample size; hidden under 20 reviews.
5. FR-5 Per-deck table: deck, cards, new / learning / young / mature counts, due
   today, last studied; links to the deck.
6. FR-6 On a deck page the owner (or any studier) sees that deck's due-today,
   mature share and a link to the stats page filtered to the deck.
7. FR-7 A deck filter on the stats page (all decks or one).

## Non-functional requirements

- **Privacy:** a member sees only their own statistics; there is no public view.
  Logs cascade-delete with the user and with the card.
- **Performance:** aggregation is done in SQL (grouped by day in the viewer's
  time zone, passed as an IANA name and validated with `Intl.supportedValuesOf`
  or a try/catch on `Intl.DateTimeFormat`), bounded to 365 days, one round trip
  per section; responses are small (≤ 400 numbers).
- **Accessibility:** each chart has a visually hidden table with the same
  numbers and a one-line text summary; heatmap cells are `aria-hidden`.
- **i18n:** strings in `study-stats`; dates and numbers through `Intl` with the
  active locale; weeks start on the locale's first day where `Intl.Locale`
  exposes it, Monday otherwise.
- **Steel:** charts are flat fills of `--site-text` at stepped mixes (as
  `components/profile/ProfileActivityHeatmap.tsx` does), no gradients, no
  animation; sections divided by rules; numbers in `t-meta` mono.

## Data model and API

- New model `FlashcardReviewLog` in `prisma/schema/rmhstudy.prisma`:
  `id BigInt @id @default(autoincrement())`, `userId`, `cardId`, `deckId`,
  `grade Int`, `intervalDays Int`, `easeFactor Float`,
  `reviewedAt DateTime @default(now())`; cascades on user and card;
  `@@index([userId, reviewedAt])`, `@@index([userId, deckId, reviewedAt])`;
  `@@map("flashcard_review_log")`.
- Migration `20261122020000_s02_flashcard_review_log`.
- The review endpoint (`lib/study/api/study.cards.$id.review.server.ts`) writes
  the log in the same `$transaction` as the SM-2 update.
- Pure `lib/study/stats.ts`: `cardState`, `streaks`, `retention`, `forecast`
  bucketing, `fillDays`.
- Server `lib/study/stats.server.ts`; contract `lib/study/stats.contract.ts`;
  endpoint `GET /api/study/stats?deckId=&tz=`.
- Route `app/routes/_site/study/stats.tsx`, `EXCLUDED_ROUTES` `'personal'`.
- `exportStudyStatsData(userId)` for the account export (integration wires it).

## Testing requirements

- Product suite `lib/study/__tests__/stats.product.test.ts`: state boundaries
  (0, 1, 20, 21 days); streak across a missed day and across a time-zone
  midnight; retention hidden under 20 samples; forecast folds overdue into
  today.
- Main suite `lib/study/__tests__/review-log.test.ts`: a review writes exactly
  one log row in the same transaction as the state update (a failing log write
  rolls back the state), and the stats query is scoped to the session user.

## Acceptance criteria

- [ ] After three reviews today, the heatmap's today cell and "Reviews today: 3"
      agree.
- [ ] The forecast shows tomorrow's due count matching the deck page.
- [ ] Retention reads "Not enough reviews yet" below 20 samples.
- [ ] A screen reader reaches every number through the tables.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Back-filling history, per-card graphs, FSRS, public study profiles.
