# features/medschools — RMH Med Schools

> Scope: `features/medschools/`. Repo-wide context: [`/CLAUDE.md`](../../CLAUDE.md), [`../CLAUDE.md`](../CLAUDE.md).
> Spec: `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md`. Phase 3 plan:
> `docs/superpowers/plans/2026-11-22-rmh-medschool-phase3-public-pages.md` (its "Owner revisions" O1-O6 override its
> tasks).

Anonymized US MD and DO admissions-cycle data: counts and reported events, never people. A worker (phases 1-2b, in
`server/medschools-worker/`, code in `scrape/`) collects it from CycleTrack, Admit.org and Student Doctor Network; the
public pages (phase 3) read it.

## What is public (phase 3)

Signed-out readable, in the `_site` shell (Steel), not a full-screen app:

| Route                  | Page                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| `/rmh-medschool`       | School index (rows on rules) with search, degree, state and program     |
| `/rmh-medschool/live`  | Live feed of recent reported events, 60 s refetch, "show older" paging  |
| `/rmh-medschool/$slug` | One school: Activity, History, Interviews tabs (`?tab=`, `?program=` …) |

Six anonymous `GET` endpoints (`api/medschools.*.server.ts`, registered `apiRoute` modules, `auth: 'optional'`, read
rate limit, public cache): `schools`, `schools/$slug`, `schools/$slug/activity`, `schools/$slug/history`, `live`,
`today`. Contracts live in `medschools.contract.ts`; loaders in `api/read.server.ts`; query factories in
`medschools.queries.ts` (no `createServerFn`). Route loaders seed React Query with `contractQuery`, so the charts exist
in the server HTML with scripting off.

**Placement (owner O1):** listed in the Services hub (`app/routes/_site/services/index.tsx`) and site search
(`lib/search/catalog.ts`), **not** in the games/apps catalog. There is no `catalog.ts`, no card art, no image manifest
row; the manifest has `catalog` unset and `listed: false`; `ui/ui-rules.test.ts` pins this. `/rmh-medschool` and
`/rmh-medschool/live` are `STATIC_ROUTES` in `lib/sitemap.ts`; school pages are the `medschools` sitemap chunk.

## The read rules (`engine/public-read.ts`, pure and client-safe)

- **k floor (spec §6):** `K_FLOOR = 3`. RMH tracker count rows are dropped when `contributors` is null or under 3 (fail
  closed); other sources show as published (their `contributors` is null today). An in-state/out-of-state split is
  returned only when both sides are at least 3; `MedSchoolStats` rows with `residence != GLOBAL` follow the same floor.
  The live feed excludes `source = RMH` entirely. **Held back (phase 4, Q2):** RMH count cells dated today (UTC) or
  later are dropped too, in `applyKFloor` and the `floorWhere(now)` clause, so a cell crossing 3 is never visible in
  real time; deletion is not delayed.
- **Never sum sources (spec §10):** the primary series per school x program x cycle x event type is the first present
  source in `PRIMARY_ORDER` (CycleTrack, Admit, SDN, RMH, MDApplicants), after the floor. Others are comparison series.
  Every chart says "Reported events" and names its sources; reported events are never called applicants.
- **Programs (O5):** `ProgramFilter` is `ALL | REG | PHD`; "All" sums REG + PHD **within one source** per day. A school
  shows only its own degree's options (an MD school never offers DO). Null-program events are in no series, total or
  chart: a muted line counts them, the live feed labels them "Program not reported".
- **Explicit `select` on every Prisma read.** `inState`, `dedupeHash`, `ingestedAt` and `MedSdnThread.cursorPostHash`
  are never selected; attribution links point at a school page or a thread, never a post. A live row is
  `{ id, eventType, program, school, occurredAt (minute), source }`; the key set is pinned by the black-box test.
- **Dates are UTC calendar days** (`@db.Date`); format with `formatUtcDay`, never the viewer's zone.
- **Source attribution (O3):** "Source: CycleTrack", "Source: Admit.org", "Source: Student Doctor Network", each linking
  to the school's page on that source where a URL is known (`api/source-links.ts`, names in `SOURCE_NAMES`).

## Charts (`engine/chart-geometry.ts`, `ui/charts/`)

React SVG, server-rendered, no animation, no fills (O2: approved for these pages only; Steel §18 D10 stays open for the
rest of the site). Series are told apart by dash pattern and weight, never colour, with direct end labels placed by
`spreadLabels`; only `--site-text`, `--site-text-muted` and `--site-border` are used. The first Activity chart is
`CategoryLines` with `CategoryToggles` (O4: `?show=`, at least one stays on, `aria-pressed` buttons in a
`role="group"`); then `DailyBars` for one chosen type, then a native `<details>` table as the text alternative. The
chart is wrapped in `dir="ltr"` so the time axis stays left to right in `ar`. Each width gets its own viewBox (phone,
mid, wide), all rendered, CSS shows one.

**d3 containment:** only `engine/chart-geometry.ts` imports `d3-scale` / `d3-shape`; only `ui/charts/*` imports that;
only page components import `ui/charts`. Route files must not (`ui-rules.test.ts`), so d3, zod and the charts stay in
the lazy page chunk. `scripts/check-entry-composition.ts --strict` has tripwires for both; `validateSearch` is
hand-rolled (`engine/search.ts`) because zod is forbidden in the entry.

## School crests

`public/images/medschools/crests/<slug>.webp` (96x96) are downloaded once from Admit's `crest_url` by
`scripts/medschools/fetch-admit-crests.ts` (`scrape/crests.ts`), committed as static files and listed in
`data/medschools/crests.json`. The site never calls Admit for an image at request time. `engine/crests.ts` looks one up;
`ui/SchoolCrest.tsx` draws it (a school with no crest draws nothing).

## Ingest changes that affect what the pages show

- **SDN timing (13aca4241):** an SDN event reported the day it was posted ("got an II today") takes the post's own
  timestamp, so the live feed's "time ago" is the post time. An earlier stated date stays a calendar day (UTC midnight).
  Dedupe and count cells still key on the day.
- **SDN dedupe (f576b1169):** one SDN member counts once per event type per school per cycle: events key on
  `hash(author:<member>:<school>:<cycle>:<type>)`, the member id read from the post header and hashed with the dedupe
  secret inside the `eventKey` closure, so nothing person-shaped crosses the adapter boundary. The first report wins.
  Posts with no member id keep the per-post key.
- The SDN live queue runs daily (SDN forum activity is slow); AI extraction is capped monthly. Detail:
  `server/CLAUDE.md`.

## Adding the Forecast tab (phase 5)

Add `'forecast'` to `SCHOOL_TABS` between `history` and `interviews` in `engine/public-read.ts`, one query factory in
`medschools.queries.ts`, and one tab component in `ui/`; `SchoolPage` renders tabs from `SCHOOL_TABS` and needs no other
change. Keep the chart rules and the floor above.

## Testing and verification

- Unit: colocated `*.test.ts(x)` (`pnpm exec vitest run features/medschools`); `ui/ui-rules.test.ts` holds Steel, i18n
  and bundle rules for every ui file and the three routes.
- Black box: `testing/integration/medschools-public.test.ts` (pinned key sets, no RMH or `contributors` in responses, no
  hashes in the HTML, 404 for unknown slugs, sitemap). It reads a seeded database.
- Seed: `scripts/medschools/seed-visual.ts` writes **FIXTURE** rows (never real figures) into a scratch Postgres (it
  refuses any database whose name lacks `scratch` or whose host is not localhost). Use it for screenshots (O6: 10
  viewport sizes, Day and Night, plus `ar`) and `pnpm audit:pages --routes …`.
- i18n: namespace `medschools`; new keys carry a prefix (`index-`, `live-`, `school-`, `chart-`, `event-`, `program-`,
  `source-`); the hub row's two strings are `nav-rmh-medschools` and `services-medschools-desc` in `feed`.
