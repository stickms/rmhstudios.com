# 05 — Build insights for creators

Surface: a new page `/create/builds/$slug/insights`, linked from each row of
`/create/builds/manage` (`app/routes/_site/create_.builds.manage.tsx`) and from
the owner's controls on the build page. Wave 4. Namespace `build-insights`.

## User story

As a member who publishes User Builds, I want to see, per build, how many
people looked at it, liked it, commented on it and unlocked it, day by day
and around each release — so that I can tell whether a release, a post or a
price change made any difference.

## Requirements elicitation

- **What exists (verified):** `BuildView` (`prisma/schema/builds.prisma`,
  `@@map("build_view")`) stores one row per (build, signed-in viewer) or
  (build, hashed address) with `createdAt` — written by
  `app/routes/api/user-builds/$id/view.ts` — and is **read by nothing** except
  that route's de-duplication. `BuildLike`, `BuildComment` and `BuildUnlock`
  (`pricePaid`) carry `createdAt`. The manage page shows lifetime
  `likeCount` and `viewCount` totals only; `/create/earnings`
  (`lib/creator/earnings.server.ts`) aggregates coins across all builds, not
  per build or per day. Sprint 02's chart primitives exist
  (`components/ui/bar-chart.tsx`, `line-chart.tsx`). Feature 04 (wave 2) adds
  dated `BuildVersion` rows.
- **Decisions:** "views" means **first views** — the unique viewers the table
  already records (a returning viewer is not counted twice; the page says
  so). Days are UTC, matching the coin statement. Ranges 7, 30 and 90 days,
  each compared with the previous period of the same length. Releases from 04
  appear as markers on the chart and as rows ("v1.2 released") in the daily
  table. Curated builds (which skip `BuildView` rows) show only likes,
  comments and unlocks, with a note.

## Functional requirements

1. FR-1 `/create/builds/$slug/insights` (owner only; site admins may view)
   shows four totals for the range — first views, likes, comments, unlocks
   (and coins earned from unlocks) — each with the change against the
   previous period as text ("+12 vs previous 30 days").
2. FR-2 A daily chart of first views with likes overlaid (two series,
   distinguishable without colour: one bars, one line), release markers, and
   a screen-reader table of the same data ("Show as table" disclosure).
3. FR-3 A "Biggest days" list: the five days with most first views, each with
   that day's likes, comments, unlocks and any release.
4. FR-4 Range picker (7 / 30 / 90 days) through `components/ui/tabs.tsx`;
   the choice is in the URL search params.
5. FR-5 The manage page row gains "Insights"; the build page owner menu
   gains it too.

## Non-functional requirements

- **Security:** a server read guarded inside its handler: the caller must own
  the build (or be an admin); otherwise 404. Contract `GET` with
  `query: { range }` zod enum.
- **Performance:** one `$queryRaw` per table grouping by
  `date_trunc('day', "createdAt")` over the range, using new
  `@@index([buildId, createdAt])` on `BuildView` (likes, comments and unlocks
  already index `buildId`; add `[buildId, createdAt]` to each where missing).
  At most 4 queries per page load; responses are private (`no-store`).
- **Correctness:** raw SQL uses the real table names (`build_view`,
  `build_like`, `build_comment`, `build_unlock`) and quoted camelCase columns
  (`"buildId"`, `"createdAt"`, `"pricePaid"`), asserted in a test, and is
  smoke-tested against Postgres at integration.
- **Privacy:** only counts leave the server; no viewer identities. Erasure
  (anchor `s04-05`): the member's `BuildView` rows are de-identified
  (`userId` → null) so creators' totals do not change.
- **Accessibility:** the chart has a text summary and the table alternative;
  series differ by shape, not only colour; totals are a `dl`.
- **i18n:** strings in `build-insights`; numbers, dates and percentages via
  `Intl`.
- **Steel:** totals are a row of `t-title` numbers with `t-label` captions
  divided by vertical rules, not cards; the chart uses the sprint 02
  primitives unchanged.

## Data model and API

- Indexes only: `BuildView @@index([buildId, createdAt])`, and the same on
  `BuildLike`, `BuildComment`, `BuildUnlock` where absent. Migration
  `20261124040100_s04_build_view_index`.
- `lib/builds/insights.ts` (pure: range bounds, filling empty days,
  period comparison, biggest days), `lib/builds/insights-schema.ts`,
  `lib/builds/insights.contract.ts`, `lib/builds/insights.server.ts`
  (`getBuildInsights(slug, viewer, range)`).
- Module `lib/builds/api/user-builds.$slug.insights.server.ts` — check that
  `$slug` does not collide with the existing `$id` param routes in
  `lib/api/__tests__/route-table.test.ts`; if it does, use
  `/api/user-builds/$id/insights` with the build id.
- Route `app/routes/_site/create_.builds.$slug.insights.tsx` (`noindex`;
  `DYNAMIC_ROUTES` entry `null` under `s04-05`).

## Testing requirements

- Main suite `lib/builds/__tests__/build-insights.test.ts`: another member
  gets 404; an admin can read; the raw SQL names the real tables and quoted
  columns.
- Main suite `lib/account/__tests__/build-view-erasure.test.ts`.
- Product suite `lib/builds/__tests__/insights.product.test.ts`: day filling
  across month ends, period comparison with zero baselines, biggest days with
  ties, release markers.

## Acceptance criteria

- [ ] A build with views on three days shows those days and zeros between.
- [ ] A release from 04 appears as a marker on its day.
- [ ] Another member opening the URL gets "not found".
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Referrers, view sources, per-version retention, CSV export (the coin
statement already exports earnings).
