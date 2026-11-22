# 09 — Practice in the developer API

Surface: `/api/v1/me/typing*`, `/api/v1/me/music/practice`, `/api/v1/me/focus-sessions`, scope `read:practice`, the API
docs and SDK. Wave 3. No namespace (no UI strings).

## User story

As a member who practises typing, music and focused study on the site, I want a personal dashboard or a habit tracker I
use elsewhere to read that practice through a key, so that my practice history is not locked inside three apps.

## Requirements elicitation

- **What exists (verified):**
  - RMHType: `RmhTypeProfile` (totals, bests, averages, streaks), `RmhTypeDailyEntry` (one per member and day: `day`,
    `passageId`, `wpm`, `accuracy`, `timeMs`, `finishedAt`), `RmhTypeKeyStat` (per-key counters; 02 records them from
    every run), `RmhTypeLessonProgress` (`prisma/schema/rmhtype.prisma`); the site reads them through `lib/rmhtype/*`
    (`rmhtype.queries.ts`, `keystats.server.ts`, `lib/rmhtype/api/rmhtype.lessons.progress.server.ts`).
  - RMH Music: `MusicPracticeEntry` (sprint 03 01: `kind`, `refId`, `mode`, `score`, `durationMs`, `createdAt`, indexed
    by `userId, createdAt`) and the learn profile (`prisma/schema/rmhmusic.prisma`).
  - RMHStudy focus: `RmhStudySession` (`focusTimeMs`, `breakTimeMs`, `sessionsInRun`, `startedAt`, `endedAt`, indexed by
    `userId, startedAt`) and `RmhStudyProfile` (`weeklyGoalMinutes`, `timeZone`, streaks).
  - None of these has an API; the developer API already has personal-bests, playtime days and achievements
    (`app/routes/api/v1/me/personal-bests.ts`, `me/games/$gameId/days.ts`, `me/achievements.ts`) and flashcards
    (`read:study`).
- **Decisions:**
  - **Read-only, the key owner's own data, one scope `read:practice`.** Writing practice from outside would let a script
    inflate streaks and boards; it is out of scope.
  - **Endpoints (route files, `withDeveloperApi`):**
    - `GET /api/v1/me/typing` — the profile summaries, **one per difficulty** (`RmhTypeProfile` is unique on
      `userId, difficulty`: bests, averages, totals, streaks), and lesson progress (lesson id, best wpm, best accuracy,
      stars, attempts, completed at).
    - `GET /api/v1/me/typing/daily?from=&to=` — daily entries in a range of at most 366 days (`YYYYMMDD` days as stored,
      documented).
    - `GET /api/v1/me/typing/keys?layout=` — the key counters with the derived metrics `keyMetrics` computes (miss rate,
      mean ms), only keys past `MIN_ATTEMPTS_FOR_READING`.
    - `GET /api/v1/me/music/practice?since=&cursor=` — practice entries, newest first, keyset by (`createdAt`, `id`).
    - `GET /api/v1/me/focus-sessions?since=&cursor=` — focus sessions, newest first, keyset; plus `weeklyGoalMinutes`
      and `timeZone` in a `summary` block on the first page.
  - **Assisted, practice and custom runs** are returned as stored (the API reports history; it does not rank). No other
    member's data, no boards.
  - **Not included:** multiplayer match rows (`RmhTypeMatch*`, other players' data inside), ghosts (`RmhTypeGhost`, a
    replay payload), and any history kept only in the browser; the docs say so.
  - **Key statistics** depend on 02 (wave 1) recording from solo and daily runs; before 02 only lessons fill them. The
    endpoint reads whatever is stored and documents that recording can be switched off on the site.

## Functional requirements

1. FR-1 The five endpoints with zod query validation (one comma-free parameter per filter, ISO instants for `since`,
   bounded ranges), keyset pagination (page size at most 100) and the `/api/v1/**` error envelope.
2. FR-2 `read:practice` in `lib/api/scopes.ts` (anchor) and `docs/developer-api/scopes.md`.
3. FR-3 Registry entries (anchor), examples, SDK and docs regenerated, `NULLABLE` lines for nullable fields (`wpm` of an
   unfinished daily entry, `endedAt`, `score`, `mode`).
4. FR-4 Changelog bullets (anchor).

## Non-functional requirements

- **Security:** every query is `where: { userId: keyOwner }`; there is no id parameter that could name another member's
  row.
- **Performance:** every list query uses an existing `userId`-leading index (`RmhTypeDailyEntry` is unique on
  `userId, day`; `RmhTypeLessonProgress` is keyed `userId, lessonId`; `RmhTypeKeyStat` by its `userId`-leading key;
  `MusicPracticeEntry` and `RmhStudySession` have `userId, createdAt|startedAt`); confirm each and report any that does
  not.
- **Correctness:** additive only; BigInt and float fields serialise as numbers with their units in the field names
  (`focusTimeMs`).

## Data model and API

- No schema change. New `lib/api/v1/practice.server.ts`, `lib/api/v1/practice-schema.ts`, five route files under
  `app/routes/api/v1/me/`. Edits: `lib/api/scopes.ts`, `lib/api/registry.ts`, `scripts/generate-sdk.ts`,
  `docs/developer-api/{changelog,scopes}.md`.

## Testing requirements

- Main suite `lib/api/v1/__tests__/practice-api.test.ts` (mock Prisma): each endpoint returns only the key owner's rows;
  range and cursor validation; key metrics past the threshold only; scope required; BigInt serialised.
- `lib/api/__tests__/route-table.test.ts`, the OpenAPI/SDK checks.

## Acceptance criteria

- [ ] A key with `read:practice` reads the owner's typing summary, the last month of daily entries and the slowest keys.
- [ ] It pages through music practice entries and focus sessions with a cursor.
- [ ] A key without the scope gets `insufficient_scope`.

## Out of scope

Writing practice, other members' practice, boards, webhooks for practice events.
