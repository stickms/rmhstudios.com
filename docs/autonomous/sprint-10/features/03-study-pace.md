# 03 — A study pace for each deck, and a test date

Surface: the deck page (`/study/$deckId`), the review session (`/study/review`), `/study`. Wave 3. Namespace
`study-pace`. Site tier (Steel).

## User story

As a student with an exam in three weeks, I want to set how many new cards a deck gives me a day, or tell it the date of
my test and have it work out the pace, so that I neither drown in 200 new cards on the first night nor reach the exam
having never seen half the deck.

## Requirements elicitation

- **What exists (verified):**
  - The review session is `reviewQueue` in `lib/study/queue.server.ts`: every scheduled card due now, then up to
    `NEW_PER_SESSION = 20` never-reviewed cards from the member's own decks, oldest deck first (`lib/study/queue.ts`);
    `SESSION_MAX = 200`. The limit is per **session**, not per day: five sessions in an evening introduce 100 new cards,
    and nothing is per deck.
  - A card is new when the member has no `FlashcardReview` row for it; `FlashcardReviewLog` (`userId`, `deckId`,
    `cardId`, `reviewedAt`, indexed `[userId, deckId, reviewedAt]`) records every grade.
  - Day boundaries for study already follow the member's zone: `lib/study/stats.ts` (`dayKeyInZone`, `isValidTimeZone`)
    and `lib/study/stats.server.ts` (the zone is a validated parameter).
  - `FlashcardDeck` (`prisma/schema/rmhstudy.prisma`) has no pace or date field.
- **Decisions:**
  - **Per deck, owner only.** "New cards a day" (0–200, or "No daily limit", the default) and an optional "Test date" (a
    local `YYYY-MM-DD`, today or later). On a copied deck the copy's owner sets their own; the source's settings are
    never copied.
  - **Opt-in, so nobody's queue changes under them (validation pass 2).** An earlier draft made 20 new cards a **day**
    per deck the site default. That silently changes every member's queue (a member with one deck who reviews three
    times an evening would get 20 new cards where they got 60; a member with ten decks could get 200 new cards where
    they got 20), and members would notice it as the site breaking, not as a feature. So `newPerDay = null` means
    **exactly today's behaviour**: the deck's new cards share the session's `NEW_PER_SESSION = 20` across the member's
    unpaced decks, oldest deck first, with no daily count; no migration rewrites anyone's decks. A deck the owner gives
    a pace is counted per day: the queue counts new cards first graded today in that deck (in the member's zone, sent by
    the client as `tz` and validated, UTC otherwise) and adds at most the rest of its allowance; paced decks' new cards
    still count toward the batch's `NEW_PER_SESSION` and `SESSION_MAX`. The deck page states the current behaviour in
    one line ("No daily limit: each review session adds up to 20 new cards across your decks") beside the field, so the
    choice is discoverable. A site-wide per-day default is out of scope (it would be a behaviour change for everyone; a
    later sprint can offer it as a setting).
  - **Test date → a suggested pace.** With a date set (on a paced or unpaced deck), the deck page shows "To see every
    card by <date>, learn N a day" (`ceil(newRemaining / daysLeft)`, days counted in the member's zone, the test day
    excluded) with "Use N a day", and once the date passes it shows "The test date has passed" with "Clear". The date
    never changes the pace on its own (a number changing under the member is surprising).
  - **Forecast.** The deck page shows the next seven days' due counts for that deck from existing rows (scheduled plus
    the new cards the pace will add), as a `components/ui/bar-chart.tsx` with its table view.
  - **"Learn more today."** In review, when a paced deck's allowance is used up, "Learn 10 more from <deck>" adds ten
    for the rest of the day (a per-day extra kept with the deck, reset by the day key).
  - **Export:** a `deckPace` section (deck id, new per day, test date) under the anchor.

## Functional requirements

1. FR-1 Columns `newPerDay Int?` (null = no daily limit, today's behaviour), `testDate String? @db.VarChar(10)`,
   `extraNewDay String? @db.VarChar(10)`, `extraNew Int @default(0)` on `FlashcardDeck`.
2. FR-2 `newIntroducedToday(userId, deckIds, dayStart)` (one grouped query over the log for the **paced** decks only:
   cards whose first log row is today; skipped entirely when no deck is paced) and the per-deck allowance in
   `reviewQueue`; `reviewAllCount` and `dueByDeck` (the due counts and badges) use the same allowance. With no paced
   deck, the queue, the counts and their queries are byte-for-byte today's.
3. FR-3 The deck page's "Pace" section: the number field, the date field, the suggestion line, the forecast.
4. FR-4 "Learn N more" in the review's end screen.
5. FR-5 A registered `PATCH /api/study/decks/$id/pace` (contract + `implement()`, owner checked, zod-validated, the date
   validated as a real calendar day not in the past in the given zone).
6. FR-6 The export section.

## Non-functional requirements

- **Correctness:** the allowance is computed from the log, never from a counter that could drift; two concurrent
  sessions may each add the remainder once (bounded by `NEW_PER_SESSION`), accepted and stated.
- **Performance:** one grouped query per queue build across the member's decks (indexed by
  `[userId, deckId, reviewedAt]`); no new index.
- **Accessibility:** the chart has its table; the suggestion is text with a button, not a chart annotation.

## Data model and API

- `prisma/schema/rmhstudy.prisma` (`FlashcardDeck`): the four columns. Migration `20261130030100_s10_study_pace`.
- New `lib/study/pace.ts` (pure: allowance, suggested pace, days left in a zone), `pace-schema.ts`, `pace.contract.ts`,
  `pace.server.ts`, `lib/study/api/study.decks.$id.pace.server.ts`, `components/study/DeckPace.tsx`.
- Edits: `lib/study/queue.server.ts`, `lib/study/queue.ts` (doc comment and the default), the review client
  (`components/study/ReviewAll.tsx`, sends `tz`), `components/feed/DeckStudyColumn.tsx` (the section, owner only),
  `lib/study/decks-schema.ts` if the deck payload carries the fields (owner only).

## Testing requirements

- Product suite `lib/study/__tests__/pace.product.test.ts`: allowance per paced deck; an unpaced deck uses the
  per-session rule; a mix of paced and unpaced decks never exceeds `NEW_PER_SESSION` per batch; a zero pace adds none;
  the suggested pace across a DST change and across the test day; a past date.
- Main suite `lib/study/__tests__/pace-queue.test.ts` (mock Prisma): the queue never adds more than the allowance for a
  deck; another member's deck pace is refused at the endpoint; a copy does not inherit the source's pace; raw SQL uses
  `"flashcard_review_log"` and the quoted camelCase columns.
- Existing `lib/study/__tests__/*queue*` stay green **unchanged** (no deck in them is paced); a changed expectation
  there is a regression, not an update.

## Acceptance criteria

- [ ] A deck set to 5 new a day gives 5 new cards in the first session and none in a second one that day.
- [ ] A member who never sets a pace gets exactly the queue they got before this feature (the existing queue tests pass
      unmodified).
- [ ] Setting a test date shows the suggested pace; "Use N a day" applies it.
- [ ] "Learn 10 more" adds exactly ten for the rest of the day.
- [ ] The deck page shows a seven-day forecast with a table view.

## Out of scope

Changing the scheduling algorithm, a site-wide per-day default or setting, reminders tied to the test date, cramming
mode that ignores intervals.
