# 05 — Where your Doctrine XP came from

Surface: RMH Strategies' profile (`/strategies/profile`: the activity heatmap and the "Full XP breakdown" link), a new
breakdown page `/strategies/profile/xp`, the data export. Wave 5. Namespace `doctrine-ledger`. App tier (L8): Doctrine's
own look.

## User story

As a member climbing Doctrine's ranks, I want to see what earned my XP and what took it away — each puzzle, streak
bonus, incident report and weekly decay — and which days I was active, so that I know what to do to rank up and
why my total fell.

## Requirements elicitation

- **What exists (verified):**
  - Every XP change writes a `DoctrineReputationLedger` row (`prisma/schema/doctrine.prisma`: `reputationId`,
    `action`, `xpDelta`, `reason`, `metadata`, `createdAt`, index `[reputationId, createdAt desc]`): `awardXp` in
    `features/doctrine/engine/reputation.ts` (actions from `XP_ACTIONS` in `features/doctrine/engine/constants.ts`)
    and the weekly decay in `features/doctrine/engine/jobs.server.ts` (`WEEKLY_DECAY`, `DECAY_REASON`). **No endpoint or screen reads
    the ledger** (its one read is the decay job's own idempotency subquery, `notDecayedThisWeek` in `jobs.server.ts`,
    which looks for this week's `WEEKLY_DECAY` row). `reason` is an English sentence (`"PUZZLE_SOLVE +10XP"`).
  - The profile page `app/routes/strategies/profile/index.tsx` draws `<ActivityHeatmap data={{}} weeks={16} />`
    (`features/doctrine/ui/reputation/activity-heatmap.tsx`, a map of `YYYY-MM-DD` → count), so the heatmap is always
    empty, and its "Full XP Breakdown →" link goes to `/strategies/profile/reputation`, which is the leaderboard, not a
    breakdown.
  - `GET /api/doctrine/reputation` (`features/doctrine/api/doctrine.reputation.server.ts`) returns totals only. The
    erasure registry erases `DoctrineReputation` and its ledger by cascade; the export carries neither.
  - Doctrine's manifest says `delivery: 'island'` (`features/doctrine/feature.ts`, namespace `c-doctrine`), but it has
    no `island.tsx`: `/strategies/profile/*` are ordinary routes under `app/routes/strategies/`, and the existing
    hooks (`features/doctrine/ui/hooks/useDoctrineReputation.ts`) read through React Query.
- **Decisions:**
  - **The breakdown page** `/strategies/profile/xp` (new): the member's ledger, newest first, keyset paged 30 at a time
    on (`createdAt`, `id`), each row the action in words (one literal key per `XP_ACTIONS` key plus `WEEKLY_DECAY`;
    an unknown action shows "Other"), the signed change in `t-meta`-style mono figures, and the date; above it, the
    last 30 days' totals by action (largest first) and the sum gained and lost. The stored `reason` is never shown.
  - **The heatmap** is fed from the ledger: positive XP rows per day (in the zone the page sends, an IANA name the
    browser reports, checked with `isValidTimeZone` and bucketed with `dayOf` from `lib/calendar/tz.ts`; UTC when
    invalid), the last 16 weeks, one grouped read.
  - **The link** "Full XP breakdown" points at the new page; the leaderboard keeps its own link text
    ("Reputation leaderboard").
  - **Privacy:** only the member's own ledger; `metadata` is never returned (it carries puzzle and incident ids).
  - **Export:** `doctrineReputation` (totals, streaks and the ledger's action, change and date, up to 5,000 rows)
    under the sprint 14 export anchor. Erasure is unchanged (the cascade from `DoctrineReputation`).

## Functional requirements

1. FR-1 `features/doctrine/engine/ledger.ts` (new, pure): the action → label-key map, the 30-day summary, the day
   bucketing, the cursor.
2. FR-2 `features/doctrine/engine/ledger.server.ts` (new): `listLedger(userId, cursor)`, `ledgerSummary(userId, now)`,
   `activityDays(userId, now, tz)`, `exportDoctrineReputation(userId)`.
3. FR-3 Contracts in `features/doctrine/engine/doctrine.contract.ts` and two endpoint modules:
   `features/doctrine/api/doctrine.reputation.ledger.server.ts` (`GET /api/doctrine/reputation/ledger?cursor=`) and
   `features/doctrine/api/doctrine.reputation.activity.server.ts` (`GET /api/doctrine/reputation/activity?tz=`), both
   `auth: 'required'`, `rateLimit: 'read'`, listed in the feature manifest's `routes`.
4. FR-4 `app/routes/strategies/profile/xp.tsx` (new) with `features/doctrine/ui/reputation/xp-ledger.tsx` (new);
   `app/routes/strategies/profile/index.tsx` passes the activity data to `ActivityHeatmap` and links to the new page.
5. FR-5 The sitemap line `/strategies/profile/xp: 'personal'` under the Wave 0 anchor; the export property under
   `// s14-05 doctrine-ledger`.

## Non-functional requirements

- **Performance:** each read uses the `[reputationId, createdAt desc]` index; the activity read is one `groupBy` over
  at most 16 weeks, or one raw query with the real table and column names (`"doctrine_reputation_ledger"`,
  `"reputationId"`, `"createdAt"`, `"xpDelta"`) asserted in a test.
- **Query shapes (verify against the schema):** the ledger has no `userId`; it is reached through
  `reputation: { userId }` or by first reading the member's `DoctrineReputation.id` (preferred: one indexed read).
  `metadata` is `Json?` and is never selected.
- **Data hooks:** two React Query hooks beside `useDoctrineReputation` (`useDoctrineLedger` with
  `useInfiniteQuery`, `useDoctrineActivity`), reading with `api()`; no `useEffect` fetch
  (`lib/__tests__/useeffect-fetch-ratchet.test.ts`).

## Data model and API

No schema change. `GET /api/doctrine/reputation/ledger?cursor=` → `{ rows: { id, action, xpDelta, at }[], nextCursor,
summary: { gained, lost, byAction: { action, xp }[] } }` (summary on the first page only);
`GET /api/doctrine/reputation/activity?tz=` → `{ days: Record<string, number> }`.

## Testing requirements

- Product suite `features/doctrine/engine/__tests__/ledger.product.test.ts`: every `XP_ACTIONS` key has a label key,
  summary arithmetic, day bucketing across a time-zone boundary, cursor round trip.
- Main suite `features/doctrine/engine/__tests__/ledger.test.ts`: own rows only, no `metadata` or `reason` in the
  response, paging stable across equal timestamps.
- `lib/account/__tests__/export-sprint-14.test.ts` (key `doctrineReputation`), `lib/__tests__/sitemap-coverage.test.ts`,
  `lib/__tests__/feature-manifests.test.ts`, `lib/__tests__/islands.test.ts`, the route table test.

## Acceptance criteria

- [ ] After solving a puzzle the member sees "Puzzle solved +10" at the top of their breakdown.
- [ ] After a weekly decay the breakdown shows the decay row with its negative change.
- [ ] The profile's heatmap shows the days the member earned XP.
- [ ] "Full XP breakdown" opens the breakdown, not the leaderboard.

## Out of scope

Other members' ledgers, editing or disputing a ledger row, changing how XP is awarded.
