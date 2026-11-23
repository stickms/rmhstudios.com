# RMH Med Schools — Phase 4 (private tracker, anonymous sharing, saved lists and preferences) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each signed-in applicant (1) a private cycle tracker at `/rmh-medschool/tracker` (schools, milestones, a
sharing switch), (2) an opt-in way to contribute each milestone to the public figures as **one anonymous event with no
person on it**, deleted again when sharing is turned off or anything it hangs from is deleted, and (3) saved school
lists and preferences (`/rmh-medschool/lists`, "Save to list", "Show my lists only", "Add this list to my tracker",
defaults that fill in only where the URL is silent), on top of the public pages phase 3 shipped.

**Architecture:** Six personal tables (`MedTrackerCycle`, `MedTrackerApplication`, `MedTrackerMilestone`,
`MedSchoolList`, `MedSchoolListItem`, `MedUserPrefs`) and two enums in one additive migration. All personal data is read
and written through `auth: 'required'`, user-scoped, never-publicly-cached `/api/medschools/me/**` endpoints (registered
`apiRoute` modules bound to contracts with `implement()`); the six phase 3 public endpoints are not touched and stay
user-independent. Sharing is one server module (`api/share-sync.server.ts`) that is the **only** code allowed to write
the tracker tables or an RMH `MedCycleEvent`: inside one transaction, under advisory locks, it reconciles the owner's
milestones with their anonymous events and recomputes the touched RMH `MedCycleCount` cells (`count`, and `contributors`
equal to it). The event's `dedupeHash` is recomputed from the server secret and the milestone id and is **stored nowhere
else**, so a database dump alone cannot link an event to a person. Preferences reach the pages by seeding the route
loader's React Query cache from the private prefs endpoint (server-rendered, no flicker), then calling the public
endpoints with explicit parameters, so the public cache keys are unchanged.

**Tech Stack:** TanStack Start, React 19, React Query, TypeScript strict, Prisma 7 (typed client, explicit `select`),
zod 4, Postgres advisory locks (`pg_advisory_xact_lock`), vitest, Playwright for the visual pass.

**Spec:** `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md` (§4a, §6, §7 "Private tracker" and "School lists
and preferences", §10 "Combining sources", §11 `tracker.tsx`, §13–14 item 4). Earlier plans: phase 3
`docs/superpowers/plans/2026-11-22-rmh-medschool-phase3-public-pages.md` (its Owner revisions O1–O6 and its read rules
carry over), phase 1 `…phase1-foundation.md` (migration conventions).

**Precedents cited (read both before Task 5 and Task 7):**

- _Signed-in page with a private loader and a sign-in prompt:_ `app/routes/_site/wallet.tsx` +
  `components/wallet/WalletPage.tsx` (the loader `prefetchRouteQuery`s a private query, signed out it fails quietly and
  the page renders `SignedOutPrompt` with a `callbackURL`; `useSession()` + `isPending` + `useArrival`).
- _Owner-only CRUD endpoints:_ `lib/homes/api/homes.watches.server.ts` + `lib/homes/watches.server.ts` +
  `lib/homes/watch-schema.ts` (`implement(C.…, { rateLimit: { policy: 'write', scope: 'user', prefix: … }, body }, …)`,
  every query keyed by `session.user.id`), and `HomeWatch` in `prisma/schema/hearth.prisma` (`userId` +
  `user User @relation(…, onDelete: Cascade)`, back-relation `homeWatches HomeWatch[]` in `prisma/schema/auth.prisma`).
- _Erasure:_ `lib/account/erasure-lists.server.ts` (`…ErasureOps(userId)` returning Prisma ops for the
  `anonymizeAccount` transaction), `lib/account/erasure-registry.ts` (one entry per model with a `User` relation),
  `lib/account/__tests__/erasure-coverage.test.ts`, and the pre-transaction steps at the top of `anonymizeAccount`
  (`releaseSeatsOf`, `leaveAllGroups`).
- _Advisory locks:_ `lib/rmhvibe/vibe-kv.server.ts:58` (`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`),
  `lib/rmhtube/parties.server.ts:195`.

## Global Constraints

- Stack of record is TanStack Start + Vite + React 19 + Nitro. **Not Next.js.** Out of scope: Forecast tab and the
  personal conditional chance (phase 5, which reads tracker rows server-side and shares nothing new), AI Q&A (phase 6),
  follows (phase 7), `MedInterviewDate` reported dates, any worker or queue change, any new public endpoint, any change
  to what the six public endpoints return.
- **Anonymization (spec §6) is the hard invariant.** The only person-bearing tables are `MedTrackerCycle`,
  `MedSchoolList`, `MedUserPrefs` (the three that carry `userId`). `MedTrackerApplication`, `MedTrackerMilestone` and
  `MedSchoolListItem` reach their owner only through a parent. `MedCycleEvent` gets **no new column**; an RMH event is
  `{ id, schoolId, cycleYear, program (never null), eventType, occurredAt (a UTC calendar day), source: RMH, dedupeHash, inState: null, ingestedAt }`
  and nothing else. No public response changes shape.
- **Sharing is opt-in and defaults off.** `shareAnonymously` defaults `false` everywhere it is created, including the
  cycle "Add this list to my tracker" creates. Only the seven public event types are shareable (`SECONDARY`,
  `INTERVIEW`, `WAITLIST`, `REJECTION`, `ACCEPTANCE`, `WITHDRAWN`, `HOLD`); `SUBMITTED` and `COMPLETE` never leave the
  private tables; home state never leaves them either.
- **k≥3 floor (spec §6) stays at read time and stays phase 3's code.** RMH figures reach the public only as
  `MedCycleCount` rows with `source = RMH`, `contributors = count`; `applyKFloor`/`where.contributors >= K_FLOOR` in
  `engine/public-read.ts` and `api/read.server.ts` already drop rows below 3 and rows with null `contributors`. This
  phase writes `contributors`; it does not touch the readers. The live feed keeps excluding `source = RMH` (D5, phase
  3).
- **Public read endpoints stay user-independent and publicly cached** (spec §7). No public module reads a session;
  personal data comes from `/api/medschools/me/**`, which declare no `cache` (uncacheable at every layer, see
  `handler.server.ts` "Cache-Control, no Vary, no ETag"). A prefs value reaches a public endpoint only as an explicit
  query parameter chosen by the client.
- **API (CLAUDE.md §3):** contracts in `features/medschools/medschools.contract.ts`, `implement()` in registered
  `apiRoute` modules under `features/medschools/api/`, `pnpm api:routes`, clients call `api()`/`contractQuery`, no raw
  `fetch('/api/…')`, `*.queries.ts` holds no `createServerFn`. Every `me/**` handler is `auth: 'required'`, rate limited
  per user (`scope: 'user'`), zod-validated, and scopes every Prisma query through `session.user.id`.
- **Steel:** rows on rules (R3), flat (R1), one ink primary per view (R4), nothing moves at rest (R5), content that
  replaces a skeleton fades 160 ms through `components/ui/arrive.tsx` (M9), the seven `t-*` classes, `--site-*` tokens,
  `Tabs` for any tab strip, `PageLayout`, logical properties, `components/ui` primitives only (`Switch`, `Select`,
  `Dialog`/`ConfirmDialog`, `Menu`/`AnchoredMenu`, `IconButton`, `SortableList`, `SignedOutPrompt`). Controls 44px on
  touch. No tinted notice boxes (Steel §18 D8 is open: notices are `t-meta` lines).
- **i18n:** every string through `t()` in namespace `medschools`; new keys carry a prefix (`tracker-`, `lists-`,
  `prefs-`, `save-`, `share-`); a reworded shipped string is a new key; no `{/* … */}` comment right before a `t()`
  call; check `locales/en/medschools.json` after `pnpm i18n:extract`. Stored user content (a list name) is user text,
  not a key.
- **SEO:** `/rmh-medschool/tracker` and `/rmh-medschool/lists` are private pages: `definePage({ noIndex: true, … })`,
  not in the sitemap, not in `STATIC_ROUTES`, no section card unless `og-page-coverage.test.ts` demands one (Fact 8).
- **Routing:** `/rmh-medschool/$slug` is a param route and `tracker`, `lists` are static siblings. TanStack prefers the
  static route, but a school slug equal to `tracker`, `lists`, `live` or `ask` would be unreachable: Task 1 pins a
  reserved-slug test over the registry data.
- **Bundle (OPT-01):** nothing heavy in a route module's top level; no `zod` in the entry closure; page components, the
  lists drag UI and the tracker forms live in lazy page chunks (route files import only `definePage`, parsers, query
  factories and one page component). Raising a budget needs a dated comment in `scripts/check-bundle-budget.ts` and a PR
  line (Task 14).
- **Commit gate:** stage first, commit separately, `pnpm check:consistency` before every commit, no `--no-verify`.
  Commit messages explain why and end with the attribution trailer the session was given (`Co-Authored-By: …`,
  `Claude-Session: …`). No `any`, `@ts-ignore`, new lint or type warnings. Migrations are additive
  (`migrations-additive.test.ts`).

## Owner revisions carried over from phase 3 (still apply)

- **O2 Chart style:** approved for the phase 3 pages only. This phase draws no chart. If a task finds it needs one (it
  should not), it uses the O2 style and records the need; Steel §18 D10 stays open.
- **O3 Attribution:** unchanged. When an RMH series is visible on a school page the existing caption names it
  (`SOURCE_NAMES.RMH` = "RMH tracker"); no link, no per-source terms exist for first-party data.
- **O4 Toggleable categories:** `MedUserPrefs.chartCategories` is the default for the Activity `show` list when the URL
  has no `show`. Same rules: comma list in `CHARTED_TYPES` order, empty or unknown falls back, one stays on.
- **O5 Program filter All / MD / MD-PhD (or DO):** a school never shows the other degree's options. A tracker
  application's program is labelled by its school's degree (`program-md`, `program-md-phd`, `program-do`,
  `program-do-phd`); `MedUserPrefs.programFilter` is `ALL | REG | PHD` and is degree-neutral, `degree` is a separate
  optional preference used on the index and live pages only.
- **O6 Visual check on phones and odd aspect ratios:** Task 13 screenshots, Day and Night, 320×568, 360×740, 390×844,
  430×932, 844×390, 768×1024, 1024×600, 1280×800, 1920×1080, 2560×1080, plus 390×844 and 1280×800 in `ar`, for the
  tracker, the lists page, the "Save to list" menu open on an index row and on a school page, and the index with "Show
  my lists only" and with a preference applied. A rough 390/1280 Day check runs right after Task 10 and Task 12.
- **O1 Placement** is unchanged (Services hub, not the catalog). Nothing in this phase adds a hub or search entry; the
  two new pages are reached from links on the med schools pages (Task 12) and, signed out, from the sign-in prompt.

## Owner revisions (charts, 2026-11-23)

**O7 Charts get colour, cards, a legend, a tween, a probe and dates (owner, 2026-11-23).** It supersedes O2's ink-only
style for the RMH Med Schools charts only; Steel §18 D10 (dashboards and data tables) stays open. Where O2 above says
"approved for the phase 3 pages only", read it as "O2's style, as revised by O7". The chart tasks of this phase use the
O7 style; the pages and rules that carry it are in `features/medschools/CLAUDE.md` (Charts).

1. **Colour.** `--site-chart-1`..`-5` (Day and Night values in `app/globals/tokens-themes.css`, pinned by
   `lib/__tests__/steel-tokens.test.ts`), the first five slots of the dataviz reference palette, validated with its
   validator against `--site-surface`: lightness band, chroma floor, adjacent CVD (worst 9.1 Day, 8.4 Night) and
   normal-vision separation (19.6 and 19.3) pass in both editions. Aqua, yellow and magenta are under 3:1 on white in
   Day, so the relief rule applies and every chart carries a legend, a dash cue and a data table. Fixed mappings
   (`ui/charts/chartColors.ts`): Interview 1, Rejection 2, Acceptance 3, Secondary 4, Waitlist 5; sources CycleTrack 1,
   Admit 2, SDN 3, RMH 4, MDApplicants 5; History cycles newest first 1..5. Tokens only: no hex and no raw palette class
   in a component.
2. **Chart cards and legend.** A chart is a card (`--site-surface`, 1px `--site-border`, 8px radius, 12 px padding on a
   phone and 16 px from `sm`), the legend above the plot; the category legend is the toggle row (each toggle carries its
   swatch). End-of-line labels are gone: a legend names every multi-series chart, and the single-series daily bars are
   named by the title and the sources line.
3. **Animation on toggle.** The y scale tweens (one tween, 280 ms, ease-out) when a toggle, program or source changes
   it; lines, bars and gridlines move together, tick labels cross-fade. A response to input only: the first paint and
   the server render never animate, one frame is requested at a time and the last requests none (the rAF file allowlist
   entry says why). `prefers-reduced-motion: reduce` makes it instant (M7's rule applied to this tween, no setting and
   no other override).
4. **Cumulative charts start at 0** on the cycle's first day (`withZeroStart`); History overlays too.
5. **Hover, touch and keyboard probe.** A crosshair at the nearest date and a tooltip (`surface-overlay`) with the date
   and each visible series' value and swatch. The plot is focusable; the arrow keys move the crosshair. The native
   `<details>` table stays.
6. **Always dates.** The History overlay aligns cycles by month and day (June 1 of every cycle lines up), labels the
   axis "Jun 1", "Aug 15" with no year, and names a series by its cycle ("2026–2027"). `HistoryCycleDto` gains
   `dayZeroOn` for this.
7. **Small-option dropdowns are button groups.** The Activity category, History's category and source: a horizontal
   single-select `role="radiogroup"` (`ui/OptionGroup.tsx`). The school page's program control is a **multi-select**:
   two toggles for the school's own degree ("MD", "MD-PhD"; DO: "DO", "DO-PhD"), at least one stays on, both on is
   `ALL`, one is `REG` or `PHD`; the URL's `program` param is unchanged (`ui/ProgramToggles.tsx`). `ProgramSelect` stays
   for the index and live pages until their own task replaces it.

## Decisions made in this plan (owner may override; items the owner must answer are the Open Questions at the end)

- **D1 One writer for sharing.** `api/share-sync.server.ts` is the only module that writes `medTrackerCycle`,
  `medTrackerApplication`, `medTrackerMilestone` rows or `source: 'RMH'` events/counts. Everything else (endpoints,
  add-to-tracker, account erasure) calls it. Why: the DB cascade (`Milestone → Application → Cycle → user`) deletes
  milestone rows without any application code seeing them, and an event can only be found through a milestone id, so
  every delete path must read the ids first. A ratchet test (Task 3) fails when any other file under `features/`, `lib/`
  or `server/` calls `.medTrackerMilestone.`/`.medTrackerApplication.`/`.medTrackerCycle.` writes or `medCycleEvent`
  writes with `source: 'RMH'`.
- **D2 The event hash is recomputed, never stored.**
  `dedupeHash = dedupeHash(secret, 'RMH', 'milestone:' + milestoneId)` (the existing `engine/dedupe.ts` HMAC; the spec's
  "derived with the server secret"). One milestone ↔ at most one event, found again by recomputation. Storing the hash
  on the milestone (the obvious design) would let anyone with a database dump join `med_cycle_event` to
  `med_tracker_milestone` without the secret. What this guarantees is narrow: the public pages and the event table alone
  link to no one. It is not a claim against someone with database access, who can still match shared figures (school,
  program, type, day) against the private tracker tables in the same database. Cost: deletion needs the secret in the
  web tier and a rotated secret orphans events (Open Q4; the audit script in Task 3 finds orphans).
- **D3 What the event row does not carry.** `id` is `crypto.randomUUID()`, and so is the id of an RMH count row (a
  `cuid()` embeds its creation time, which would date the row to the minute the user typed it), `occurredAt` is the
  milestone's calendar day at 00:00 UTC, `ingestedAt` is set to that same instant (the `now()` default would stamp the
  entry time), `inState` is `null` (home-state stays private in this phase; Open Q6), `program` is the application's
  program (never null, so these events can never land in the "program not reported" line). Test (Task 3): no stored RMH
  event column equals or contains the user id, cycle id, application id or milestone id; `id` is UUID-shaped;
  `ingestedAt == occurredAt`.
- **D4 `contributors` is computed, and is exact.** For an RMH cell `(school, program, cycleYear, day, type)`, `count` =
  the number of RMH events in it and `contributors = count`. This is exact, not approximate, because the schema makes
  the events in one cell come from distinct people: a milestone is unique per `(application, type)`, an application per
  `(cycle, school, program)`, a cycle per `(user, cycleYear)`. No code path may weaken one of those uniques (the schema
  test pins them). The k floor then applies per cell exactly as phase 3 reads it.
- **D5 Reconcile, do not patch.** Every write that can change shared state runs one function,
  `reconcileShared(tx, userId, scope)`: take the user advisory lock, read the user's flag and milestones inside the
  transaction, compute the desired event set, take school locks in sorted order for every school in the union of old and
  new cells, write events (delete missing, upsert changed), then recompute the touched RMH count cells from the events
  (delete a cell when it reaches 0). Why: a toggled switch, an edited date, a deleted school row and an account deletion
  are all "make the events equal the milestones", and one function with one test matrix cannot drift from itself the way
  four patch paths do. Two tabs and rapid toggling are safe because the flag is read after the lock.
- **D6 Milestone keyed by `(application, type)`.** `PUT …/milestones/$type { date }` is an upsert, `DELETE …/$type`
  removes. Two tabs adding the same milestone converge instead of duplicating; "edit" is a date change. An application's
  school and program are immutable (remove and add instead), so an edit never moves an event between schools or
  programs.
- **D7 Dates.** A milestone date is a calendar day string `YYYY-MM-DD`, valid on the calendar (no `2026-02-30`), inside
  `[cycleYear-1-05-01, cycleYear-08-31]` and no later than tomorrow UTC (a viewer in Hawaii can be a day behind UTC; an
  invite is dated when received). A cycle year is accepted within `[currentCycle-3, currentCycle+1]`. Why the window: it
  keeps a typo (`2062`) from becoming a public cell and stops a future-dated row from existing before its day.
- **D8 The sharing switch is a cycle flag**,
  `PUT /api/medschools/me/tracker/cycle { cycleYear, homeState?, shareAnonymously }`, idempotent. On: every eligible
  milestone of that cycle gets its event. Off: every event of that cycle's milestones is deleted and the cells
  re-rolled, in the same transaction as the flag write, before the response. The UI says exactly what is shared and what
  is not (copy below). If the server secret is unset or shorter than 16 characters the endpoint answers 503
  `{ code: 'SHARING_UNAVAILABLE' }`, the tracker response carries `sharingAvailable: false`, and the switch is disabled
  with a `t-meta` line. Turning sharing **off** never needs the secret to succeed in a world where sharing was never on;
  it does need it to delete events that exist, so with the secret unset and events present the off path 503s too and
  logs an error (it fails closed rather than pretending).
- **D9 Account deletion.** `anonymizeAccount` tombstones the user row, so no `onDelete: Cascade` fires (confirmed:
  `lib/account/deletion.server.ts`). Task 6 adds a pre-transaction step `eraseSharedMedEvents(userId)` (reads the user's
  milestone ids, deletes their events and re-rolls counts under the same locks, idempotent, so a re-run of a failed
  sweep is safe) **before** the existing `$transaction`, then `medschoolsErasureOps(userId)` inside it (`deleteMany` on
  `MedTrackerCycle`, `MedSchoolList`, `MedUserPrefs`; children by DB cascade, each checked), a registry entry per model,
  `pnpm docs:deletion`, and a data-export block. Events go at **finalisation** (the existing 30-day rule), not at
  scheduling (Open Q3).
- **D10 Lists.** Limits are the spec's (20 lists, 200 items, name ≤ 60, note ≤ 500) enforced in the transaction under a
  per-user lock (counts are re-read after the lock, so two tabs cannot both take the 200th slot). "My schools" is
  created on first use by the same endpoint that saves the item (`POST /api/medschools/me/list-items` with `listId` or
  `newListName`), under the per-user lock, so two tabs cannot create two defaults. Reorder bodies carry the full id
  list; a body whose set differs from the stored set is a 409 `STALE_ORDER` and the client refetches (a second tab added
  an item). Static, param-free paths (`me/list-items`, `me/list-order`) avoid a static-vs-`$id` sibling collision under
  `me/lists/`.
- **D11 `NULL` program in a list item.** Postgres unique indexes treat NULLs as distinct, so the spec's
  `@@unique([listId, schoolId, program])` alone allows two "either program" rows for one school. The migration adds a
  hand-written partial unique index `(list_id, school_id) WHERE program IS NULL` and the service checks inside the list
  lock. Fact 2 verifies Prisma's drift check tolerates it; Open Q10 offers the alternative (a non-null `ANY` value).
- **D12 "Add this list to my tracker".** `POST /api/medschools/me/lists/$id/add-to-tracker { cycleYear? }` creates the
  cycle if absent (sharing **off**, home state from prefs), then one application per item not already present for
  `(cycle, school, program)`; an item with no program becomes `REG` (the MD/DO process; `PHD` is always an explicit
  choice, spec §4a). It is idempotent, all-or-nothing (a cap breach, 60 applications, is a 409 naming the numbers), and
  never links back: the list and the tracker stay separate records, so deleting a list item never touches the tracker
  and removing an application never touches a list.
- **D13 Preferences apply only where the URL is silent, decided in the loader.** The route loader awaits the private
  prefs query (server side it is dispatched in-process with the request's cookies, exactly as `wallet.tsx` does; signed
  out it fails quietly and nothing is applied), computes the effective filters with the pure `applyPrefs`, and
  prefetches the **public** queries with those explicit values. The component computes the same effective filters from
  the same cached prefs. Result: the server HTML already shows the preferred view (no flicker, no post-hydration
  refetch), a signed- out or crawler request is byte-for-byte what phase 3 served, and the public endpoints are called
  with the same explicit parameters anyone could type, so the public cache key space is unchanged. Why not the
  alternatives: applying prefs in a client effect flickers and double-fetches; redirecting to a URL that carries the
  prefs traps the user (choosing "All" strips back to a clean URL and bounces to the pref again). The HTML document is
  already per-viewer (the root loader seeds the session user), so reading prefs in the loader does not make it less
  cacheable than it is (Fact 3).
- **D14 The URL must be able to say "I chose the default".** Today `parseIndexSearch`/`parseSchoolSearch` fall back to
  `program: 'ALL'` and the routes `stripSearchParams` defaults, so `?program=ALL` cannot be told from "absent". Task 9
  changes the parsers to return `program?: ProgramFilter` (absent stays absent), removes `stripSearchParams` for the
  prefs-affected keys (`program`, `degree`, `show`), and moves the "drop a default from the URL" step into the pages'
  write helper, which strips a value only when it equals the global default **and** no preference would override it. So
  a viewer with a `PHD` preference who picks "All" gets `?program=ALL` and a shared link reads "All" for everyone, and a
  viewer with no preferences gets exactly today's clean URLs. A small `t-meta` line "Filters from your preferences" with
  a link to the preferences section appears while any default came from prefs (so the page never silently differs from
  its URL).
- **D15 "Show my lists only" is a client filter**, not a public parameter: `?list=<listId>` (one list) or `?list=all`
  (every list), applied to the school array the public endpoint already returned, from the private lists query. No
  public cache key changes; the list is meaningless to anyone else, so a shared `?list=` link reads the unfiltered index
  for a signed-out viewer and says why in one line.
- **D16 Personal query keys are namespaced** `['medschools','me', …]` and invalidated by their mutations; a sign-out
  clears them (the existing session handling clears the query client; Task 9 asserts the keys are under that prefix).
- **D17 Tracker and list pages are `ssr` normally** (loader prefetch) and render a skeleton then content under
  `useArrival`; a `401` after load (session expired mid-edit) turns the page into the `SignedOutPrompt` with
  `callbackURL`, never a blank or a raw error.

### Steel §18 open decisions this phase touches (not resolved here; owner needed)

- **D13 (RMH Med Schools pages: no section-10 recipe fits; the row phase 3 added):** the tracker, the lists page and the
  "Save to list" menu are more of the same gap (a titled page of rows on rules, forms in rows, no spine). Task 14 adds
  one sentence to that row naming the new pages; it does not answer it.
- **D7 (catalogues: tiles or rows):** lists and tracker applications are rows on rules, the stated default.
- **D8 (inline notices):** the sharing explanation, "sharing unavailable", the stale-order refetch and the prefs-applied
  line are `t-meta` lines, no tinted box.
- **X2 (no recipe fits):** forms inside rows (add school, add milestone, rename, note) have no recipe. They use
  `components/ui` controls on rules; recorded under D13, not decided.
- **D10 (data tables):** not touched; no table or chart is added.

## Review Focus

Inputs the spec implies but no obvious task test reaches; each has its test in the named task.

1. **Sharing toggled rapidly and from two tabs.** On, off, on within a second; tab A toggles while tab B adds a
   milestone; two tabs `PUT` the same `(application, type)`. The final events must equal the final milestones and the
   final flag, whatever the interleaving. Task 3 (fake DB with a real mutex stand-in, interleaving matrix), Task 13
   (`Promise.all` of 20 mixed requests against the running app, then an invariant check).
2. **A milestone edited after sharing.** Date change moves the event between two count cells (both re-rolled; the old
   cell can drop below 3 and disappear); a type change is delete+add; a change to an ineligible type (`COMPLETE`)
   deletes the event. Task 3.
3. **k at exactly 3.** 2 events in a cell: a count row exists with `contributors: 2` and the public activity response
   omits it; the third arrives: it appears; the third is deleted: it disappears without a stale row; 3→4→3 keeps it;
   every event deleted: the row is gone (no zero rows). Same cell with other sources' rows: they are untouched and never
   summed. Task 3 (rollup), Task 13 (through the public endpoint).
4. **Every delete path.** Delete a milestone, an application (DB cascade to milestones), a cycle (cascade to both), turn
   sharing off, delete the account mid-cycle (with some milestones shared, some not, one cycle shared and another not),
   delete a school row (cascade from `MedSchool` removes events and applications). After each, zero RMH events remain
   for those milestones and the counts equal a from-scratch recompute. A failure halfway through account erasure must be
   re-runnable. Task 3 (matrix), Task 6 (erasure with a mid-step failure), Task 13 (scratch-DB script).
5. **Deleting a list item that is also in the tracker, and the reverse.** Neither touches the other; "Add to tracker"
   twice adds nothing the second time; an item whose school became inactive still lists and still adds. Task 7, Task 11.
6. **Cross-user access.** Every `me/**` handler with another user's id (list, item, application, milestone) answers 404
   (not 403: no existence oracle), never mutates, and the integration test proves it with two real sessions. Task 5,
   Task 8, Task 13.
7. **Secret and failure behaviour.** Unset or short secret: share endpoints 503 `SHARING_UNAVAILABLE`, the tracker still
   works unshared, erasure of an account with no shared events succeeds, erasure with shared events and no secret fails
   loudly and leaves the account scheduled (it retries next night). Task 3, Task 6.
8. **Lists at the caps and under concurrency.** The 201st item, the 21st list, the 61st application in "Add to tracker",
   a 60-character name made of combining marks, a note with `\u0000`, two tabs creating "My schools" at once, a reorder
   body with a stale or foreign id, a reorder body with duplicates. Task 7.
9. **URL beats preferences, including the explicit default.** `?program=ALL` with a `PHD` preference is All; no params
   with a `PHD` preference is PHD; `?degree=DO` with an MD school page ignores the degree preference (a school has its
   own); `?show=` empty falls to the preference, then to all five; an invalid preference value (a stale row after an
   enum change) falls to the default, never throws. Task 2, Task 9.
10. **SSR parity.** The server HTML for a signed-in viewer with preferences equals what the client renders after
    hydration (no hydration mismatch warning, no second fetch); a signed-out request equals phase 3's output; the public
    endpoint URLs the loader calls are exactly the explicit-parameter URLs. Task 9, Task 12.
11. **Dates and strings.** `2026-02-30`, `2026-11-20T10:00`, `0099-01-01`, a date in the future, a date outside the
    cycle window, leap day, `date` as a number or an array; `homeState` `zz`, `''`, `NC `; notes with markup (rendered
    as text, never HTML). Task 2, Task 4.
12. **A school slug that collides with a static route** (`tracker`, `lists`, `live`, `ask`) and a school that is
    deactivated while on a list, in the tracker, or shared. Task 1, Task 3.

## File Structure

| Path                                                                                                                                                                                                                            | Responsibility                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema/medschools.prisma`, `prisma/schema/auth.prisma`, `prisma/migrations/20261201100000_medschools_tracker/`                                                                                                          | Models, enums, back-relations on `User`, the partial unique index                                                                               |
| `features/medschools/engine/schema.test.ts`                                                                                                                                                                                     | Updated anonymization rule (Task 1)                                                                                                             |
| `features/medschools/engine/tracker.ts` (+test)                                                                                                                                                                                 | Pure: milestone types and eligibility, `toSharedEvent`, date and cycle validation, cell keys, list limits and `reorderIds`. Client-safe, no I/O |
| `features/medschools/engine/prefs.ts` (+test)                                                                                                                                                                                   | Pure: `applyPrefs`, `writeSearch` (D13, D14). Client-safe                                                                                       |
| `features/medschools/engine/search.ts`                                                                                                                                                                                          | Parsers keep "absent" (Task 9)                                                                                                                  |
| `features/medschools/api/share-sync.server.ts` (+test, +`share-ratchet.test.ts`)                                                                                                                                                | The one writer: `reconcileShared`, `rollupRmhCells`, `eraseSharedMedEvents`, `auditRmh`                                                         |
| `features/medschools/api/tracker.server.ts` (+test)                                                                                                                                                                             | Tracker service on top of `share-sync`                                                                                                          |
| `features/medschools/api/lists.server.ts`, `prefs.server.ts` (+tests)                                                                                                                                                           | Lists and prefs service                                                                                                                         |
| `features/medschools/api/me-schemas.ts`                                                                                                                                                                                         | zod bodies and queries for every `me/**` endpoint (server-side importers only)                                                                  |
| `features/medschools/medschools.contract.ts`                                                                                                                                                                                    | Existing: add the personal contracts and DTOs                                                                                                   |
| `features/medschools/api/medschools.me.*.server.ts` (+`me-routes.server.test.ts`)                                                                                                                                               | Registered `apiRoute` modules for `/api/medschools/me/**`                                                                                       |
| `features/medschools/medschools.queries.ts`                                                                                                                                                                                     | Personal query factories under `['medschools','me',…]`                                                                                          |
| `lib/account/erasure-medschools.server.ts`, `lib/account/erasure-registry.ts`, `lib/account/deletion.server.ts`, export module, `docs/account-deletion.md`                                                                      | Erasure ops, pre-step, registry, export                                                                                                         |
| `app/routes/_site/rmh-medschool/{tracker,lists}.tsx`                                                                                                                                                                            | Thin private routes                                                                                                                             |
| `app/routes/_site/rmh-medschool/{index,$slug,live}.tsx`                                                                                                                                                                         | Loader reads prefs (Task 12)                                                                                                                    |
| `features/medschools/ui/tracker/*`, `ui/lists/*`, `ui/SaveToList.tsx`, `ui/PrefsNote.tsx`                                                                                                                                       | Pages and pieces                                                                                                                                |
| `scripts/medschools/{seed-visual.ts,visual-check.mjs,check-rmh-events.ts,verify-erasure.ts}`, `testing/integration/medschools-private.test.ts`, `testing/integration/lib/medschools-fixture.ts`, `.github/workflows/web-ci.yml` | Verification                                                                                                                                    |
| `features/medschools/CLAUDE.md`, `features/CLAUDE.md`, spec §14, Steel §18 D13 row                                                                                                                                              | Docs                                                                                                                                            |

---

### Task 1: Schema, migration, anonymization test, erasure floor

**Files:**

- Modify: `prisma/schema/medschools.prisma`, `prisma/schema/auth.prisma` (back-relations
  `medTrackerCycles MedTrackerCycle[]`, `medSchoolLists MedSchoolList[]`, `medUserPrefs MedUserPrefs?` beside
  `homeWatches`)
- Create: `prisma/migrations/20261201100000_medschools_tracker/migration.sql` (sorts after the current latest,
  `20261130060200_s10_admin_communities`; re-check `ls prisma/migrations | tail` first)
- Modify: `features/medschools/engine/schema.test.ts`
- Create: `lib/account/erasure-medschools.server.ts`; Modify: `lib/account/erasure-registry.ts`,
  `lib/account/deletion.server.ts` (one `...medschoolsErasureOps(userId)` line in the transaction),
  `docs/account-deletion.md` (generated), `docs/_generated/facts.json` (generated)
- Test: reserved-slug check in `features/medschools/scrape/registry.data.test.ts` (or a new `registry-slugs.test.ts`)

**Interfaces:** produces the Prisma models (signatures; copy the style of the existing file, `@@map` snake_case):

```prisma
enum MedMilestoneType { SUBMITTED COMPLETE SECONDARY INTERVIEW WAITLIST REJECTION ACCEPTANCE WITHDRAWN HOLD }
enum MedProgramFilter { ALL REG PHD }
model MedTrackerCycle       { id; userId; cycleYear Int; homeState String? @db.VarChar(2); shareAnonymously Boolean @default(false);
                              createdAt; updatedAt; user User (Cascade); applications[]; @@unique([userId, cycleYear]); @@index([userId]) }
model MedTrackerApplication { id; cycleId; schoolId; program MedProgram; notes String? @db.VarChar(1000); createdAt;
                              cycle (Cascade); school MedSchool (Cascade); milestones[]; @@unique([cycleId, schoolId, program]); @@index([schoolId]) }
model MedTrackerMilestone   { id; applicationId; type MedMilestoneType; date DateTime @db.Date; createdAt; updatedAt;
                              application (Cascade); @@unique([applicationId, type]) }
model MedSchoolList         { id; userId; name String @db.VarChar(60); position Int; createdAt; updatedAt; user (Cascade); items[]; @@index([userId, position]) }
model MedSchoolListItem     { id; listId; schoolId; program MedProgram?; position Int; note String? @db.VarChar(500); addedAt;
                              list (Cascade); school MedSchool (Cascade); @@unique([listId, schoolId, program]); @@index([listId, position]); @@index([schoolId]) }
model MedUserPrefs          { userId @id; programFilter MedProgramFilter @default(ALL); degree MedDegree?; homeState String? @db.VarChar(2);
                              chartCategories MedEventType[] @default([]); updatedAt @updatedAt; user (Cascade) }
```

Add `trackerApplications MedTrackerApplication[]` and `listItems MedSchoolListItem[]` to `MedSchool`. Update the header
comment ("Private tracker models … may carry their owner's `userId`") to name the three models. The migration SQL
additionally holds
`CREATE UNIQUE INDEX "med_school_list_item_list_school_any_key" ON "med_school_list_item"("list_id", "school_id") WHERE "program" IS NULL;`
(D11).

- [ ] **Step 1: Write the failing tests.**
  - `schema.test.ts`: `allowsUserId` becomes exactly `MedTrackerCycle`, `MedSchoolList`, `MedUserPrefs`,
    `MedSchoolFollow` (a name list, not a `startsWith('MedTracker')` prefix: `MedTrackerApplication` and
    `MedTrackerMilestone` must **not** carry `userId`); the self-test string gains `MedSchoolList`, `MedUserPrefs`
    (allowed) and `MedSchoolListItem`, `MedTrackerMilestone`, `MedTrackerApplication` (each `userId` flagged). A new
    test pins the uniques the sharing maths rests on (D4): `MedTrackerCycle @@unique([userId, cycleYear])`,
    `MedTrackerApplication @@unique([cycleId, schoolId, program])`,
    `MedTrackerMilestone @@unique([applicationId, type])`, and `MedTrackerApplication.program` is not optional. The
    existing "MedCycleEvent has exactly the spec's columns" test stays untouched and must still pass (no new event
    column). `shareAnonymously` defaults `false` (regex on the model body).
  - Registry test (`erasure-coverage.test.ts` runs as is): it fails until `MedTrackerCycle`, `MedSchoolList`,
    `MedUserPrefs` have entries and `anonymizeAccount` records a `deleteMany` for each.
  - Reserved slugs: no school in `data/medschools` (the registry source the seed reads) has a slug in
    `['tracker','lists','live','ask']`.
  - Migration: `migrations-additive.test.ts` passes; a test reads the migration text and asserts the partial index line.
- [ ] **Step 2: Run to verify failure:**
      `pnpm exec vitest run features/medschools/engine/schema.test.ts lib/account/__tests__/erasure-coverage.test.ts`.
      Expected: FAIL.
- [ ] **Step 3: Implement** schema, back-relations, migration
      (`pnpm exec prisma migrate dev --create-only --name medschools_tracker` against a scratch DB, rename the
      directory, append the partial index, as phase 1 Task 2 did), `erasure-medschools.server.ts`:

```ts
export function medschoolsErasureOps(userId: string) {
  /* deleteMany MedTrackerCycle {userId}, MedSchoolList {userId}, MedUserPrefs {userId};
                                                          children go by the database cascade (checked, noted in the file header) */
}
```

Registry entries (`decision: 'erase'`, one-line reasons: "private tracker; cascades to applications and milestones; the
shared anonymous events are removed by `eraseSharedMedEvents` before this runs (Task 6)"), then `pnpm docs:deletion` and
`pnpm facts:generate`.

- [ ] **Step 4: Verify schema, migration and client agree:**
      `pnpm exec prisma validate && pnpm exec prisma generate && pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema --exit-code`
      (shadow database as phase 1) then the Step 2 command plus `lib/__tests__/migrations-additive.test.ts`. Expected:
      PASS and "No difference detected" (Fact 2 if the partial index shows as drift).
- [ ] **Step 5: Commit** —
      `feat(medschools): private tracker, lists and preferences tables, with account erasure of the rows`. (The
      shared-event half of erasure is Task 6; no tracker UI exists yet, so no event can exist in between.)

---

### Task 2: Pure rules (tracker, sharing, lists, preferences)

**Files:**

- Create: `features/medschools/engine/tracker.ts`, `tracker.test.ts`, `prefs.ts`, `prefs.test.ts`

**Interfaces:**

- Consumes: `MedEventType`, `MedProgram`, `MedDegree` from `./types`; `cycleYearOf`, `defaultDayZero` from `./cycle`;
  `CHARTED_TYPES`, `K_FLOOR` from `./public-read`; `dedupeHash` from `./dedupe` (used server-side only; `tracker.ts`
  imports nothing from `node:`).
- Produces (client-safe):

```ts
export type MilestoneType =
  'SUBMITTED' | 'COMPLETE' | 'SECONDARY' | 'INTERVIEW' | 'WAITLIST' | 'REJECTION' | 'ACCEPTANCE' | 'WITHDRAWN' | 'HOLD';
export const MILESTONE_TYPES: readonly MilestoneType[]; // display order
export const SHAREABLE: Record<MilestoneType, MedEventType | null>; // SUBMITTED, COMPLETE -> null
export const LIMITS: {
  lists: 20;
  itemsPerList: 200;
  listName: 60;
  note: 500;
  trackerNotes: 1000;
  applicationsPerCycle: 60;
};
export interface SharedEventRow {
  schoolId: string;
  cycleYear: number;
  program: MedProgram;
  eventType: MedEventType;
  occurredAt: Date; /* day, 00:00 UTC */
}
export function toSharedEvent(a: {
  type: MilestoneType;
  date: string;
  schoolId: string;
  program: MedProgram;
  cycleYear: number;
  sharing: boolean;
}): SharedEventRow | null;
export function cellKey(
  e: Pick<SharedEventRow, 'schoolId' | 'program' | 'cycleYear' | 'eventType' | 'occurredAt'>,
): string; // 'school|program|cycle|YYYY-MM-DD|type'
export type DateProblem = 'format' | 'calendar' | 'window' | 'future';
export function milestoneDateProblem(cycleYear: number, date: unknown, now: Date): DateProblem | null;
export function cycleYearProblem(cycleYear: unknown, now: Date): 'range' | null;
export function normalizeHomeState(v: unknown): string | null | 'invalid'; // 'NC', ' nc ' -> 'NC'; '' -> null; 'ZZ' -> 'invalid' (checked against a US state/DC/territory list)
export function reorderIds(stored: readonly string[], requested: readonly string[]): string[] | null; // null when sets differ or duplicates
export function cleanText(v: unknown, max: number): string | null; // trims, NFC, strips control chars and U+0000, rejects over max in code points -> null

// prefs.ts
export interface Prefs {
  programFilter: 'ALL' | 'REG' | 'PHD';
  degree: 'MD' | 'DO' | null;
  homeState: string | null;
  chartCategories: MedEventType[];
}
export interface IndexView {
  q?: string;
  degree?: 'MD' | 'DO';
  state?: string;
  program: ProgramFilter;
  fromPrefs: boolean;
}
export function applyPrefs(
  kind: 'index' | 'live' | 'school',
  search: ParsedSearch,
  prefs: Prefs | null | undefined,
  ctx?: { schoolDegree?: 'MD' | 'DO' },
): EffectiveView;
export function writeSearch(kind, next: EffectiveView, prefs: Prefs | null | undefined): Record<string, string>; // D14
```

- [ ] **Step 1: Write the failing tests.**
  - `SHAREABLE`: seven public types map to themselves; `SUBMITTED`/`COMPLETE` map to `null`. `toSharedEvent` returns
    `null` when `sharing` is false or the type is ineligible; otherwise `occurredAt` is
    `new Date('2026-11-20T00:00:00.000Z')` for `'2026-11-20'` under `TZ=America/Los_Angeles` and `TZ=Pacific/Kiritimati`
    (set `process.env.TZ` before the first `Date`, as `public-read.test.ts` does) and `program` is passed through
    unchanged.
  - `milestoneDateProblem(2027, …)`: `'2026-10-05'` ok; `'2026-02-30'` `'calendar'`; `'2026-11-20T10:00'`,
    `'11/20/2026'`, `20261120`, `['2026-11-20']`, `null` `'format'`; `'2026-04-30'` and `'2027-09-01'` `'window'`
    (window is `2026-05-01`..`2027-08-31`); a day after tomorrow-UTC `'future'` with `now = 2026-11-20T23:30Z` (tomorrow
    `2026-11-21` ok, `2026-11-22` future); leap day `2028-02-29` valid for cycle 2028. `cycleYearProblem`:
    current±window ok, 1999 and 2101 `'range'`, `2027.5` and `'2027'` `'range'`.
  - `normalizeHomeState`: `'nc '` → `'NC'`, `''`/`undefined` → `null`, `'ZZ'` and `'N'` → `'invalid'`, `'DC'` ok.
  - `reorderIds(['a','b','c'], ['c','a','b'])` → `['c','a','b']`; `['a','b']` (missing), `['a','b','c','d']` (extra),
    `['a','a','b']` (duplicate) → `null`.
  - `cleanText('  x\u0000y  ', 10)` → `'xy'`; 61 code points with `max 60` → `null`; 60 emoji (each 2 UTF-16 units) is
    valid (count code points, not `.length`); `''` and whitespace → `null`.
  - `applyPrefs('index', {}, {programFilter:'PHD', degree:'MD', …})` → `degree MD, program PHD, fromPrefs true`;
    `applyPrefs('index', {program:'ALL'}, prefs PHD)` keeps `ALL` (explicit); `{degree:'DO'}` with no program and a
    `PHD` pref → `DO` + `PHD` (program is degree-neutral);
    `applyPrefs('school', {}, {degree:'DO', …}, {schoolDegree:'MD'})` ignores the degree preference;
    `applyPrefs('school', {show: []}, prefs with chartCategories ['INTERVIEW','ACCEPTANCE'])` uses the preference, then
    `CHARTED_TYPES` when the preference is empty; `null`/`undefined` prefs return the phase 3 defaults and
    `fromPrefs: false`; an unknown stored value (`programFilter: 'X' as never`) falls to `ALL`.
  - `writeSearch`: no prefs → defaults are omitted (identical to today's URLs: `program 'ALL'` absent); with a `PHD`
    pref → `program=ALL` is written when the view is All, and `program=PHD` is **also written** (a shared link must not
    depend on the recipient's prefs); with `degree` pref `MD` and view degree `MD` → `degree=MD` written.
- [ ] **Step 2: Run to verify failure:**
      `pnpm exec vitest run features/medschools/engine/tracker.test.ts features/medschools/engine/prefs.test.ts`.
      Expected: FAIL.
- [ ] **Step 3: Implement.** `applyPrefs` rule: for each key, `explicit = key in search`;
      `value = explicit ? search[key] : prefs?.[key] ?? default`; `fromPrefs = some key taken from prefs`.
      `writeSearch`: a key is omitted only when
      `value === globalDefault && (prefs == null || prefs[key] is the default or unset)`. `tracker.ts` imports no zod
      and nothing server-side (it is imported by the lazy page chunks).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** —
      `feat(medschools): pure rules for the tracker, sharing eligibility, list limits and preference defaults`.

---

### Task 3: The sharing writer (`share-sync.server.ts`)

**Files:**

- Create: `features/medschools/api/share-sync.server.ts`, `share-sync.test.ts`, `share-ratchet.test.ts`
- Modify: `features/medschools/scrape/test-support.ts` (extend the in-memory fake:
  `medTrackerCycle|Application|Milestone` delegates with their uniques and relation cascades, `medCycleEvent.groupBy`,
  `deleteMany`, a `$transaction(fn)` that runs `fn` against the same fake, and `$executeRaw` as a recorded mutex that
  serialises callers per key)

**Interfaces:**

- Consumes: Task 2 rules; `dedupeHash` (`engine/dedupe.ts`); `MedPrisma`-style client type.
- Produces (server-only):

```ts
export type ShareScope = { cycleYear?: number; applicationId?: string; milestoneType?: MilestoneType }; // omitted = the user's whole tracker
export class SharingUnavailableError extends Error {} // secret unset or < 16 chars
export function shareSecret(env?: NodeJS.ProcessEnv): string | null;
export async function reconcileShared(tx: Tx, userId: string, scope?: ShareScope): Promise<{ touchedCells: string[] }>; // D5
export async function rollupRmhCells(
  tx: Tx,
  cells: readonly CellRef[],
): Promise<{ created: number; updated: number; deleted: number }>;
/** Delete the events of these milestone ids (read BEFORE the rows are deleted), re-roll their cells. */
export async function deleteSharedEvents(tx: Tx, userId: string, milestoneIds: readonly string[]): Promise<void>;
export async function eraseSharedMedEvents(userId: string): Promise<{ events: number }>; // account erasure pre-step (Task 6)
export async function auditRmh(
  prisma: Prisma,
): Promise<{ orphanEvents: number; mismatchedCells: number; missingEvents: number }>;
```

The algorithm the tests do not determine (D5, the one worth writing out):

```ts
export async function reconcileShared(tx, userId, scope = {}) {
  await lock(tx, `med-tracker:${userId}`);                                   // serialises this user's writes
  const ms = await tx.medTrackerMilestone.findMany({ where: { application: { cycle: { userId, ...scopeCycle } }, ...scopeRest },
    select: { id: true, type: true, date: true, application: { select: { schoolId: true, program: true, cycle: { select: { cycleYear: true, shareAnonymously: true } } } } } });
  const desired = new Map(ms.flatMap((m) => { const e = toSharedEvent({ …, sharing: m.application.cycle.shareAnonymously }); return e ? [[hashOf(m.id), e]] : []; }));
  const hashes = ms.map((m) => hashOf(m.id));                                // every milestone in scope, shareable or not
  const stored = await tx.medCycleEvent.findMany({ where: { source: 'RMH', dedupeHash: { in: hashes } }, select: { id, dedupeHash, schoolId, program, cycleYear, eventType, occurredAt } });
  const cells = new Set([...stored.map(cellOfStored), ...[...desired.values()].map(cellKey)]);
  for (const schoolId of sortedSchoolIds(cells)) await lock(tx, `med-rmh:${schoolId}`);   // sorted: no deadlock between users
  /* delete stored whose hash is not in desired; create desired not stored (id: randomUUID(), ingestedAt: occurredAt, inState: null, source: 'RMH');
     update stored whose fields differ; then */ await rollupRmhCells(tx, [...cells]);
  return { touchedCells: [...cells] };
}
```

`rollupRmhCells` groups events by `(schoolId, program, cycleYear, eventType, day)` for the touched cells (one `groupBy`
per school), compares with existing `source: 'RMH'` count rows for those cells, and writes `count = n, contributors = n`
(D4); a cell with 0 events deletes its row. It never touches another source's rows. `deleteSharedEvents` recomputes the
hashes, locks as above, deletes, and calls `rollupRmhCells`. `eraseSharedMedEvents(userId)` runs one
`prisma.$transaction`: user lock, read **all** the user's milestone ids (no scope, sharing flag ignored),
`deleteSharedEvents`, return the count. `lock` is `tx.$executeRaw\`SELECT pg_advisory_xact_lock(hashtextextended(${key},
0))\``(precedent`vibe-kv.server.ts`); the `$transaction` runs at the default isolation (READ COMMITTED) because the
locks provide the ordering.

- [ ] **Step 1: Write the failing tests** (`share-sync.test.ts`, on the extended in-memory fake; a deterministic
      secret):
  - **Basic:** sharing on with one `INTERVIEW` milestone writes exactly one event (`source RMH`, `inState null`, program
    and school from the application, `occurredAt` the day) and one count row `{count:1, contributors:1}`; `SUBMITTED`
    and `COMPLETE` write nothing; sharing off writes nothing and **deletes** a previously written event, and the count
    row disappears.
  - **Anonymity of the written row (D3):** serialise every column of every RMH event and assert none contains the user
    id, cycle id, application id or milestone id (use long distinct ids); `id` matches the UUID v4 pattern and not
    `/^c[a-z0-9]{24}$/`; `ingestedAt` equals `occurredAt`; `dedupeHash` equals
    `dedupeHash(secret,'RMH','milestone:'+id)` and no table other than `medCycleEvent` contains it (the milestone row
    has no such column: assert the milestone delegate's stored keys).
  - **k floor and contributors (Review Focus 3):** three users' milestones in one cell give `count 3, contributors 3`;
    delete one → `count 2, contributors 2` (row kept: hiding is the reader's job, asserted in Task 13); delete the rest
    → row gone; the same cell with a CYCLETRACK and an ADMIT count row is untouched in every step.
  - **Edit after sharing (Review Focus 2):** change a milestone's date → the old cell's count falls and the new cell's
    rises in one reconcile, both rows consistent; change type to `COMPLETE` → event gone; back to `SECONDARY` → event
    back with the same `dedupeHash` and a new `id`.
  - **Toggling and two tabs (Review Focus 1):** run `on, off, on` and
    `Promise.all([toggleOn, addMilestone, toggleOff, toggleOn])` over many seeded interleavings on the fake mutex; after
    each, `auditRmh`-style invariants hold: events == `toSharedEvent` of the milestones under the final flag, one event
    per milestone, counts == groupBy of events, no row with 0.
  - **Delete paths (Review Focus 4):** `deleteSharedEvents` for a milestone, for an application's milestones, for a
    cycle's, for an account's; in each case the milestone ids were read **before** the rows were deleted (assert call
    order on the fake). Deleting a school row (fake cascade) leaves `auditRmh` with no orphan.
  - **Secret:** `shareSecret({})`, `{MEDSCHOOLS_DEDUPE_SECRET:'short'}` → `null`; `reconcileShared` with sharing on and
    no secret throws `SharingUnavailableError` and writes nothing; with sharing off and **no** events stored it succeeds
    without the secret; with sharing off and events stored it throws (D8, Review Focus 7).
  - **Locks:** every transaction takes `med-tracker:<user>` first and the `med-rmh:<school>` keys in ascending order
    (assert the recorded lock sequence), including a user touching two schools.
  - **`auditRmh`:** an event whose hash matches no milestone is an orphan; a count row that differs from the grouped
    events is a mismatch; a shared milestone with no event is missing; a healthy state returns zeros.
  - **Ratchet (`share-ratchet.test.ts`, static scan, D1):** no file in `features/`, `lib/`, `server/`, `scripts/` except
    `share-sync.server.ts` (and test files) contains `.medTrackerMilestone.` / `.medTrackerApplication.` /
    `.medTrackerCycle.` followed by `create|update|upsert|delete|createMany|updateMany|deleteMany`, or `medCycleEvent`
    writes with `source: 'RMH'`. `tracker.server.ts` writes only through `withShared` closures (Task 4), so the
    allowlist is `share-sync.server.ts` alone, plus `lib/account/erasure-medschools.server.ts` (`deleteMany` of
    `MedTrackerCycle` after the pre-step, named in the allowlist with its reason).
- [ ] **Step 2: Run to verify failure:**
      `pnpm exec vitest run features/medschools/api/share-sync.test.ts features/medschools/api/share-ratchet.test.ts`.
      Expected: FAIL.
- [ ] **Step 3: Implement** the module and the fake extension. Export `withShared(userId, scope, mutate)`:
      `prisma.$transaction(async (tx) => { lock user; const r = await mutate(tx); await reconcileShared(tx, userId, scope); return r; })`
      so Task 4 services write rows only inside it. Keep a `Tx` type that is the Prisma transaction client.
- [ ] **Step 4: Run** the same command plus `pnpm exec vitest run features/medschools/scrape` (the fake is shared; phase
      1–2b tests must still pass) and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** —
      `feat(medschools): the one writer for anonymous tracker events (reconcile, k-floor counts, audit)`.

---

### Task 4: Tracker contracts, schemas, service

**Files:**

- Modify: `features/medschools/medschools.contract.ts` (append the tracker contracts and DTOs)
- Create: `features/medschools/api/me-schemas.ts` (tracker part), `features/medschools/api/tracker.server.ts`,
  `tracker.server.test.ts`

**Interfaces:**

- Consumes: Tasks 2–3.
- Produces contracts (all under `/api/medschools/me/tracker`, auth required; `endpoint<…>()({ method, path })`, types
  via `import type` from the zod schemas):

| Const                      | Method and path                                                       | Body / query                                  | Response                |
| -------------------------- | --------------------------------------------------------------------- | --------------------------------------------- | ----------------------- |
| `getMedTrackerApi`         | GET `/api/medschools/me/tracker`                                      | `cycle?`                                      | `TrackerDto`            |
| `putMedTrackerCycleApi`    | PUT `/api/medschools/me/tracker/cycle`                                | `{ cycleYear, homeState?, shareAnonymously }` | `TrackerDto`            |
| `deleteMedTrackerCycleApi` | DELETE `/api/medschools/me/tracker/cycle`                             | query `cycleYear`                             | `{ ok: true }`          |
| `addMedApplicationApi`     | POST `/api/medschools/me/tracker/applications`                        | `{ cycleYear, schoolSlug, program }`          | `TrackerApplicationDto` |
| `patchMedApplicationApi`   | PATCH `/api/medschools/me/tracker/applications/$id`                   | `{ notes }`                                   | `TrackerApplicationDto` |
| `deleteMedApplicationApi`  | DELETE `/api/medschools/me/tracker/applications/$id`                  | none                                          | `{ ok: true }`          |
| `putMedMilestoneApi`       | PUT `/api/medschools/me/tracker/applications/$id/milestones/$type`    | `{ date }`                                    | `TrackerApplicationDto` |
| `deleteMedMilestoneApi`    | DELETE `/api/medschools/me/tracker/applications/$id/milestones/$type` | none                                          | `TrackerApplicationDto` |

DTOs:
`TrackerDto { sharingAvailable: boolean; cycles: number[] /* the user's cycle years, newest first */; cycle: TrackerCycleDto | null }`,
`TrackerCycleDto { cycleYear; homeState: string | null; shareAnonymously: boolean; applications: TrackerApplicationDto[] }`,
`TrackerApplicationDto { id; school: { slug; name; shortName; degree; state; active: boolean }; program: 'REG'|'PHD'; notes: string | null; milestones: { type: MilestoneType; date: string }[] /* ordered by date then MILESTONE_TYPES */ }`.
No DTO has a user id, a cycle id or the event hash.

Service signatures (every one takes `userId` first and keys every query on it):

```ts
export async function getTracker(userId: string, cycle?: number, now?: Date): Promise<TrackerDto>; // default cycle: the newest the user has, else null
export async function putCycle(
  userId: string,
  i: { cycleYear: number; homeState?: string | null; shareAnonymously: boolean },
  now?: Date,
): Promise<TrackerDto>;
export async function deleteCycle(userId: string, cycleYear: number): Promise<boolean>;
export async function addApplication(
  userId: string,
  i: { cycleYear: number; schoolSlug: string; program: MedProgram },
): Promise<TrackerApplicationDto | 'cycle-missing' | 'school-missing' | 'duplicate' | 'cap'>;
export async function patchApplication(
  userId: string,
  id: string,
  notes: string | null,
): Promise<TrackerApplicationDto | null>;
export async function deleteApplication(userId: string, id: string): Promise<boolean>;
export async function putMilestone(
  userId: string,
  id: string,
  type: MilestoneType,
  date: string,
  now?: Date,
): Promise<TrackerApplicationDto | null | 'bad-date'>;
export async function deleteMilestone(
  userId: string,
  id: string,
  type: MilestoneType,
): Promise<TrackerApplicationDto | null>;
```

A missing row or another user's row is `null` (the route answers 404). Deletes read the milestone ids first and call
`deleteSharedEvents` inside the same `withShared` transaction, **then** delete the row (Task 3 ratchet: through the
helper).

- [ ] **Step 1: Write the failing tests** (`tracker.server.test.ts` on the fake from Task 3; every delegate call
      recorded):
  - **Scoping (Review Focus 6):** with two users, every function called with user B and user A's application, cycle or
    milestone id returns `null`/`false`, mutates nothing, and every recorded `where` contains a `userId`-bearing path
    (`cycle: { userId }`); no function takes a user id from input.
  - `putCycle` creates `shareAnonymously: false` when the body omits it is **impossible** (the body requires the
    boolean); a first call with `true` writes events for already-present eligible milestones (none yet) and a later
    `false` deletes them; `homeState` normalises or rejects (`'ZZ'` → 400-shaped error from the schema, not the
    service); a cycle year outside the window is rejected by the schema.
  - `addApplication`: duplicate `(cycle, school, program)` → `'duplicate'`; an inactive school → `'school-missing'` (new
    adds use active schools only); the 61st application → `'cap'`; a `PHD` program for a DO school is allowed (DO-PhD
    exists).
  - `putMilestone`: bad dates (Review Focus 11) → `'bad-date'`; a second `PUT` of the same type updates the date (one
    row); with sharing on it writes/moves the event (assert via the fake); `deleteMilestone` removes the event first.
  - `deleteApplication`/`deleteCycle` with sharing on: events and count rows are gone afterwards and the ids were read
    before the cascade (call order); a cycle with two applications at two schools re-rolls both schools' cells.
  - `getTracker` never returns `inState`, hashes or ids other than application ids; `sharingAvailable` is
    `shareSecret() !== null`.
  - Notes: markup stays a string (`<b>x</b>` is returned verbatim, rendering escapes), `\u0000` is stripped, > 1000 code
    points rejected.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/api/tracker.server.test.ts`.
      Expected: FAIL.
- [ ] **Step 3: Implement** the contracts, the zod schemas (`cycleYear` integer in the window computed from `now` at
      parse time via a function schema; `date` a string matching `^\d{4}-\d{2}-\d{2}$` then `milestoneDateProblem`;
      `type` an enum of `MILESTONE_TYPES`; strict objects, unknown keys rejected) and the service. Do not import `zod`
      into the contract file.
- [ ] **Step 4: Run** the same command plus `pnpm exec vitest run features/medschools/api/share-ratchet.test.ts` and
      `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** —
      `feat(medschools): tracker contracts, validation and service (every query scoped to the owner)`.

---

### Task 5: Tracker endpoints

**Files:**

- Create under `features/medschools/api/`: `medschools.me.tracker.server.ts`, `medschools.me.tracker.cycle.server.ts`,
  `medschools.me.tracker.applications.server.ts`, `medschools.me.tracker.applications.$id.server.ts`,
  `medschools.me.tracker.applications.$id.milestones.$type.server.ts`
- Create: `features/medschools/api/me-routes.server.test.ts`
- Modify: `lib/api/route-table.server.ts` (generated: `pnpm api:routes`), `features/medschools/feature.ts` (`routes`
  list)

**Interfaces:**

- Consumes: Task 4. Pattern: `lib/homes/api/homes.watches.server.ts`.
- Produces: each module exports
  `route = apiRoute('/api/medschools/me/tracker…', { … implement(contract, { rateLimit, body|query }, handler) })`. Auth
  is the default `'required'`. Rate limits: reads `{ policy: 'read', scope: 'user', prefix: 'medschools-me-read' }`,
  writes `{ policy: 'write', scope: 'user', prefix: 'mutation:medschools/tracker' }`, the sharing toggle and cycle
  delete `{ limit: 10, windowMs: 60_000, prefix: 'medschools-share', scope: 'user' }`. **No `cache` option on any of
  them.** Statuses: 400 invalid, 401 signed out, 404 not yours or missing, 409 `{ error, code: 'DUPLICATE' | 'CAP' }`,
  503 `{ error, code: 'SHARING_UNAVAILABLE' }` from `SharingUnavailableError` (refusal bodies via `refusalBody` from
  `@/lib/errors/codes`: add `MEDSCHOOLS_SHARING_UNAVAILABLE`, `MEDSCHOOLS_DUPLICATE`, `MEDSCHOOLS_CAP` to `ERROR_CODES`,
  `locales/en/errors.json` and the `useRefusalText` switch; follow `lib/CLAUDE.md` "Refusals").

- [ ] **Step 1: Write the failing tests** (mock `auth` for a session and no session, the rate limiter to pass,
      `./tracker.server`; call through `handlersOf` as `read-routes.server.test.ts` does):
  - signed out → 401 for every route and method, the service never called;
  - a signed-in call passes `session.user.id` (not any body or query field) as the first service argument;
  - 404 for each `null`/`false` service result; 409 with the right `code`; 503 with `SHARING_UNAVAILABLE` and no secret
    in the body;
  - 400 for `cycleYear` strings and floats, a body with an unknown key (`userId`, `dedupeHash`), `date` of the shapes in
    Review Focus 11, an over-long `notes`;
  - **never publicly cached:** no response from any `me/**` route has `cache-control` containing `public` or `s-maxage`,
    and none sets `etag`; the table test (`route-table.test.ts`) passes (every contract resolves to one handler).
  - a service that throws → bare `{ error: 'Internal Server Error' }` 500.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/api/me-routes.server.test.ts`.
      Expected: FAIL.
- [ ] **Step 3: Implement** the five modules, add the files to the manifest `routes`, run `pnpm api:routes`.
- [ ] **Step 4: Run**
      `pnpm exec vitest run features/medschools lib/api/__tests__/route-table.test.ts lib/__tests__/api-handler-adoption.test.ts lib/__tests__/feature-manifests.test.ts`.
      Expected: PASS.
- [ ] **Step 5: Commit** —
      `feat(medschools): private tracker endpoints (required auth, per-user rate limits, never public cache)`.

---

### Task 6: Account deletion and export

**Files:**

- Modify: `lib/account/deletion.server.ts` (pre-transaction call), the export module that carries the newest private
  blocks (`lib/account/export-sprint-10.server.ts`: add
  `medschools: await (await import('@features/medschools/api/export.server')).exportMedschools(userId)`),
  `lib/account/__tests__/erasure-coverage.test.ts` (mock the new pre-step as the file mocks its other pre-steps; read
  how `releaseSeatsOf` is handled before editing)
- Create: `features/medschools/api/export.server.ts`, `lib/account/__tests__/medschools-erasure.test.ts`,
  `lib/account/__tests__/export-medschools.test.ts`

**Interfaces:**

- Consumes: Task 3 `eraseSharedMedEvents`, Task 1 `medschoolsErasureOps`.
- Produces: in `anonymizeAccount`, a line beside the other pre-erasure steps: `await eraseSharedMedEvents(userId);`
  (before the `prisma.$transaction([...])`, so milestone ids still exist; idempotent). `exportMedschools(userId)`
  returns
  `{ tracker: [{ cycleYear, homeState, shareAnonymously, applications: [{ school (slug), program, notes, milestones: [{ type, date }] }] }], lists: [{ name, items: [{ school (slug), program, note }] }], prefs }`
  (no hashes, no ids of shared events).

- [ ] **Step 1: Write the failing tests** (`medschools-erasure.test.ts`, in-memory fake from Task 3 plus a prisma mock
      for the rest):
  - **Mid-cycle account (Review Focus 4):** a user with two cycles (one shared, one not), three applications, six
    milestones, two lists, prefs; run the sequence the real function runs (pre-step, then the ops against the fake):
    afterwards zero RMH events whose hash matches any of the user's milestone ids (recompute from the ids captured
    _before_ the run), RMH count rows equal a from-scratch recompute, zero tracker/list/prefs rows, another user's
    events and counts in the same cells untouched (counts reduced by exactly this user's contribution).
  - **Re-run safety:** the pre-step throws after deleting half the events (inject a fault in the fake); the account
    stays scheduled; running the whole sequence again succeeds and ends in the same state.
  - **No secret, no shared events:** the pre-step succeeds (nothing to delete) and the ops delete the rows; **no secret,
    shared events present** → the pre-step throws, the transaction never runs (assert `prisma.$transaction` not called),
    `finalizeDueDeletions` logs and leaves the user for the next run (its existing per-user catch).
  - `erasure-coverage.test.ts` passes: the three registry entries match the three recorded `deleteMany` ops;
    `pnpm docs:deletion --check` passes.
  - Export test: the block has the keys above and none of `id`, `userId`, `dedupeHash`; another user's rows never
    appear.
- [ ] **Step 2: Run to verify failure:**
      `pnpm exec vitest run lib/account/__tests__/medschools-erasure.test.ts lib/account/__tests__/export-medschools.test.ts lib/account/__tests__/erasure-coverage.test.ts`.
      Expected: FAIL.
- [ ] **Step 3: Implement** the pre-step wiring, the export block and the test mock. `docs/account-deletion.md`:
      `pnpm docs:deletion`.
- [ ] **Step 4: Run** the same command plus `pnpm exec vitest run lib/account` and `pnpm docs:deletion --check`.
      Expected: PASS.
- [ ] **Step 5: Commit** —
      `feat(medschools): erase the tracker's anonymous events with the account, and export the private data`.

---

### Task 7: Lists and preferences: contracts, schemas, services

**Files:**

- Modify: `features/medschools/medschools.contract.ts`, `features/medschools/api/me-schemas.ts`
- Create: `features/medschools/api/lists.server.ts`, `lists.server.test.ts`, `prefs.server.ts`, `prefs.server.test.ts`

**Interfaces:**

- Consumes: Task 2 (`LIMITS`, `reorderIds`, `cleanText`), Task 4 (`addApplication`-style helpers through `withShared`,
  never raw writes).
- Produces contracts:

| Const                               | Method and path                                     | Body                                                                  | Response                                        |
| ----------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| `getMedListsApi`                    | GET `/api/medschools/me/lists`                      | none                                                                  | `{ lists: MedListDto[] }`                       |
| `createMedListApi`                  | POST `/api/medschools/me/lists`                     | `{ name }`                                                            | `MedListDto`                                    |
| `patchMedListApi`                   | PATCH `/api/medschools/me/lists/$id`                | `{ name }`                                                            | `MedListDto`                                    |
| `deleteMedListApi`                  | DELETE `/api/medschools/me/lists/$id`               | none                                                                  | `{ ok: true }`                                  |
| `putMedListOrderApi`                | PUT `/api/medschools/me/list-order`                 | `{ ids }`                                                             | `{ lists: MedListDto[] }`                       |
| `saveMedListItemApi`                | POST `/api/medschools/me/list-items`                | `{ schoolSlug, program?: 'REG'\|'PHD'\|null, listId?, newListName? }` | `MedListDto`                                    |
| `patchMedListItemApi`               | PATCH `/api/medschools/me/lists/$id/items/$itemId`  | `{ note?, program? }`                                                 | `MedListDto`                                    |
| `deleteMedListItemApi`              | DELETE `/api/medschools/me/lists/$id/items/$itemId` | none                                                                  | `MedListDto`                                    |
| `putMedListItemOrderApi`            | PUT `/api/medschools/me/lists/$id/item-order`       | `{ ids }`                                                             | `MedListDto`                                    |
| `addMedListToTrackerApi`            | POST `/api/medschools/me/lists/$id/add-to-tracker`  | `{ cycleYear? }`                                                      | `{ cycleYear; added: number; skipped: number }` |
| `getMedPrefsApi` / `putMedPrefsApi` | GET / PUT `/api/medschools/me/prefs`                | `{ programFilter, degree, homeState, chartCategories }`               | `MedPrefsDto`                                   |

`MedListDto { id; name; position; items: { id; school: { slug; name; shortName; degree; state; active }; program: 'REG'|'PHD'|null; note: string | null; position }[] }`
(no `userId`); `MedPrefsDto` is `Prefs` from Task 2 (defaults when no row: `ALL`, `null`, `null`, `[]`). `GET me/lists`
returns at most 20 lists and 4,000 items; it is the one query the index rows, the school page and the lists page share.

Service signatures: `listLists(userId)`, `createList(userId, name)` (`'cap'` at 20), `renameList`, `deleteList`,
`reorderLists(userId, ids)` (`null` on a stale set), `saveItem(userId, i)` (creates "My schools" through
`cleanText(i.newListName ?? 'My schools')` when neither id nor name is given and the user has no list; `'cap'` at 200;
`'duplicate'` is **success** and returns the list: saving twice is a no-op, one list per call), `patchItem`,
`deleteItem`, `reorderItems`, `addListToTracker(userId, listId, cycleYear?, now?)`, `getPrefs`, `putPrefs` (an upsert;
`homeState` through `normalizeHomeState`; `chartCategories` filtered to `CHARTED_TYPES`, deduplicated, order
normalised).

- [ ] **Step 1: Write the failing tests.**
  - **Scoping (Review Focus 6):** every service called with another user's list or item id returns `null`/`false` and
    mutates nothing; `saveItem` with a `listId` that is another user's list is `null`, never an insert; recorded
    `where`s all pass through `userId`.
  - **Caps and concurrency (Review Focus 8):** the 21st list → `'cap'`; the 201st item → `'cap'`; two simultaneous
    `saveItem` calls that each see 199 items end with 200, not 201 (fake mutex on the user lock); two simultaneous first
    saves create **one** "My schools" (the other call finds it).
  - **Duplicates:** saving the same `(list, school, program)` twice leaves one row; saving `program: null` twice leaves
    one (the partial-index rule, D11) while `null` and `'PHD'` for one school coexist; deleting a list cascades its
    items; a school that is inactive can be _kept_ on a list but not _saved_.
  - **Names and notes:** `cleanText` limits (60, 500) in code points; a name that is only whitespace is rejected;
    `\u0000` stripped; markup returned verbatim.
  - **Reorder:** `reorderLists`/`reorderItems` with the exact id set renumbers `position` 0..n-1 in one transaction; a
    stale, foreign or duplicate id set → `null` (route 409 `STALE_ORDER`); positions are dense after a delete.
  - **Add to tracker (D12, Review Focus 5):** creates the cycle with `shareAnonymously: false` and `homeState` from
    prefs; null-program items become `REG`; running it twice adds nothing the second time (`skipped` = previous
    `added`); a cap breach (existing 40 + 30 items) is all-or-nothing and writes nothing; it never reads or writes the
    list's rows; deleting a list item afterwards leaves the application, and removing the application afterwards leaves
    the list item; the writes go through `withShared` (ratchet).
  - **Prefs:** unknown `programFilter`, `degree: 'PhD'`, `homeState: 'ZZ'`, `chartCategories: ['SUBMITTED']` → rejected
    by the schema (400); an unknown value already stored (simulate an enum change) is read as the default by `getPrefs`
    and never throws; `putPrefs` twice is idempotent; `getPrefs` with no row returns the defaults without creating one.
- [ ] **Step 2: Run to verify failure:**
      `pnpm exec vitest run features/medschools/api/lists.server.test.ts features/medschools/api/prefs.server.test.ts`.
      Expected: FAIL.
- [ ] **Step 3: Implement** contracts, schemas, services (every multi-row change in `prisma.$transaction` under
      `lock(tx, 'med-lists:'+userId)`).
- [ ] **Step 4: Run** the same command plus `pnpm exec vitest run features/medschools/api/share-ratchet.test.ts` and
      `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** —
      `feat(medschools): saved school lists and preferences service (caps under a per-user lock, add-to-tracker)`.

---

### Task 8: Lists and preferences endpoints

**Files:**

- Create under `features/medschools/api/`: `medschools.me.lists.server.ts`, `medschools.me.lists.$id.server.ts`,
  `medschools.me.list-order.server.ts`, `medschools.me.list-items.server.ts`,
  `medschools.me.lists.$id.items.$itemId.server.ts`, `medschools.me.lists.$id.item-order.server.ts`,
  `medschools.me.lists.$id.add-to-tracker.server.ts`, `medschools.me.prefs.server.ts`
- Modify: `features/medschools/api/me-routes.server.test.ts`, `lib/api/route-table.server.ts` (generated),
  `features/medschools/feature.ts` (`routes`), `lib/errors/codes` + `locales/en/errors.json` + `useRefusalText`
  (`MEDSCHOOLS_STALE_ORDER`, `MEDSCHOOLS_LIST_CAP`)

**Interfaces:** same conventions as Task 5. Rate limits: reads as Task 5; list/item writes
`{ policy: 'write', scope: 'user', prefix: 'mutation:medschools/lists' }`; `add-to-tracker`
`{ limit: 10, windowMs: 60_000, prefix: 'medschools-add-to-tracker', scope: 'user' }`; prefs `PUT` the write policy. 409
for `STALE_ORDER`/`LIST_CAP`/`ITEM_CAP`.

- [ ] **Step 1: Write the failing tests** (extend `me-routes.server.test.ts`): signed out 401 for all eight modules;
      `userId` always from the session; 404 for a service `null`; 409 codes; 400 for unknown keys, `ids` that are not
      arrays of strings, `ids` of length > 200, a `schoolSlug` outside `/^[a-z0-9-]{1,80}$/`; **a path-segment id of
      `%00`, 300 characters, or `../` reaches the service unchanged and is a 404 or 400, never a 500**; no `me/**`
      response is publicly cacheable (extend the Task 5 assertion over all 13 modules); table test passes (no
      static/`$id` sibling collision under `me/lists/`).
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/api/me-routes.server.test.ts`.
      Expected: FAIL.
- [ ] **Step 3: Implement** the eight modules; `pnpm api:routes`.
- [ ] **Step 4: Run**
      `pnpm exec vitest run features/medschools lib/api/__tests__/route-table.test.ts lib/__tests__/api-handler-adoption.test.ts lib/__tests__/feature-manifests.test.ts lib/errors`.
      Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): lists and preferences endpoints (owner-scoped, never public cache)`.

---

### Task 9: Preference plumbing on the client: parsers, query factories, effective view

**Files:**

- Modify: `features/medschools/engine/search.ts` (+`search.test.ts`), `features/medschools/medschools.queries.ts`
- Create: `features/medschools/ui/useEffectiveView.ts` (+`useEffectiveView.test.tsx`),
  `features/medschools/ui/PrefsNote.tsx`
- Modify: `app/routes/_site/rmh-medschool/{index,$slug,live}.tsx` only to drop `stripSearchParams` for the
  prefs-affected keys and to point `loaderDeps`/loader at the new helpers (the loader reading of prefs is Task 12; this
  task makes it possible and keeps behaviour identical for signed-out viewers)

**Interfaces:**

- Consumes: Task 2 `prefs.ts`, Task 7 contracts.
- Produces: parsers `parseIndexSearch`, `parseLiveSearch`, `parseSchoolSearch` return `program?`, `degree?`, `show?`
  **absent when absent** (D14); `INDEX_SEARCH_DEFAULTS` etc. remain as the _global defaults_ used by `applyPrefs` and
  `writeSearch`, no longer handed to `stripSearchParams` for `program`/`degree`/`show` (other keys keep it). Query
  factories: `listsQuery()` =
  `contractQuery(['medschools','me','lists'], getMedListsApi, undefined, { staleTime: 30_000 })`, `prefsQuery()` =
  `['medschools','me','prefs']` with `staleTime: 5 * 60_000`, `trackerQuery(cycle?)` =
  `['medschools','me','tracker', cycle ?? null]`; mutations invalidate `['medschools','me']`. Hook:

```ts
export function useEffectiveView(
  kind: 'index' | 'live' | 'school',
  search: ParsedSearch,
  ctx?: { schoolDegree?: 'MD' | 'DO' },
): { view: EffectiveView; prefs: Prefs | null; setSearch(next: Partial<EffectiveView>): void };
```

`PrefsNote` renders the `t-meta` line "Filters from your preferences." plus a `Link` to `/rmh-medschool/lists`
(preferences section) only when `view.fromPrefs`.

- [ ] **Step 1: Write the failing tests.**
  - `search.test.ts`: `parseIndexSearch({})` has no `program` key; `{program:'ALL'}` keeps `ALL` (the explicit-default
    case, Review Focus 9); `{degree:'x'}` drops it; every phase 3 expectation about malformed values still holds (they
    fall to _absent_ instead of the default, so the existing assertions that read `program: 'ALL'` change to `program`
    undefined **and** `applyPrefs` giving `ALL`: update them in this commit, keep the cases).
  - `useEffectiveView.test.tsx` (`renderToString` with a seeded `QueryClient`): no prefs → the view equals phase 3's for
    the same URL; prefs `PHD` + empty URL → `PHD`, `fromPrefs`; `?program=ALL` + prefs `PHD` → `ALL`,
    `fromPrefs: false`; school kind ignores the degree pref; `setSearch` produces the `writeSearch` URL.
  - Static: every personal query key starts with `['medschools','me']`; `medschools.queries.ts` has no `createServerFn`;
    the three route files still contain no import from `ui/charts`, `chart-geometry`, `d3-` or `zod`.
  - Phase 3 `pages.test.tsx` and `school-page.test.tsx` pass unchanged except for the parser expectation above (signed
    out nothing differs).
- [ ] **Step 2: Run to verify failure:**
      `pnpm exec vitest run features/medschools/engine/search.test.ts features/medschools/ui/useEffectiveView.test.tsx`.
      Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run**
      `pnpm exec vitest run features/medschools lib/__tests__/queries-server-fn-ratchet.test.ts lib/__tests__/design-consistency.test.ts`
      and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** —
      `feat(medschools): explicit-default URLs and a preferences-aware effective view (public requests unchanged)`.

---

### Task 10: Tracker page

**Files:**

- Create: `app/routes/_site/rmh-medschool/tracker.tsx`
- Create: `features/medschools/ui/tracker/TrackerPage.tsx`, `ApplicationRow.tsx`, `AddSchool.tsx`, `MilestoneForm.tsx`,
  `SharingRow.tsx`, `tracker-page.test.tsx`
- Modify: `features/medschools/feature.ts` (`routes`), `features/medschools/ui/ui-rules.test.ts` (new files and the new
  route)

**Interfaces:**

- Consumes: Tasks 4–5, 9 (`trackerQuery`, `listsQuery`, `useSession` from `@/components/Providers`, `SignedOutPrompt`).
- Produces: route `/_site/rmh-medschool/tracker` (precedent `wallet.tsx`):
  `head: definePage({ path: '/rmh-medschool/tracker', title: 'My tracker | RMH Studios', description, noIndex: true })`,
  `validateSearch` (hand-rolled: `cycle?: number`), `loaderDeps`,
  `loader: prefetchRouteQuery(trackerQuery(deps.cycle))`, `component: TrackerPage`. Signed out: `PageLayout` +
  `SignedOutPrompt` (`title` "Sign in to track your cycle", `callbackURL="/rmh-medschool/tracker"`), no request made.
- **Page:** `PageLayout` title "My tracker" (key `tracker-title`), breadcrumbs RMH Med Schools > My tracker. Order top
  to bottom:
  1. A cycle row: `Select` of the user's cycle years labelled `cycleLabel(year)` ("2026–2027") and an "Add cycle" ghost
     `Button` (creates the cycle for a chosen year; defaults to the current cycle, `resolveCycleYear`-style).
  2. `SharingRow`: `Switch` (`aria-describedby` the explanation) + label "Share my milestones anonymously" and, under
     it, `t-meta` copy (keys `share-*`): "When this is on, each milestone you add (secondary, interview invite,
     waitlist, rejection, acceptance, withdrawn, hold) is shared as one anonymous event: the school, the program, the
     type and the day. The public pages never link it to you, your submission and completion dates and your home state
     are never shared, and a public figure appears only when at least 3 people reported the same thing on the same day.
     Public figures update once a day. Turn it off, or delete the milestone, and the event is removed at once; the
     public totals follow at the next daily update." Disabled with `share-unavailable` ("Sharing is unavailable right
     now.") when `sharingAvailable` is false. A failed toggle reverts the switch and toasts (sonner) with the refusal
     text; the switch is **controlled by the server response**, never optimistic. 2b. Home state `Select` (US states +
     DC), `t-meta` "Used only for your own view. Never shared."
  3. The applications as rows on rules (R3): school name (a `Link` to `/rmh-medschool/$slug`), `degree · state`, the
     program label (`program-md|md-phd|do|do-phd` by the school's degree, O5), the milestones as a compact list
     "Interview invite, Nov 20" (`formatUtcDay`, never the viewer's zone), a `t-meta` line for notes; per row a ghost
     "Add milestone" `Button` (opens `MilestoneForm` inline in the row: type `Select` offering the types not yet set
     plus the existing ones for edit, a native `type="date"` `Input` with `min`/`max` from `milestoneDateProblem`'s
     window, Save, Cancel) and an icon-button `Menu` (Edit notes, Remove). Remove uses `ConfirmDialog` (its copy states
     that shared events are removed too when sharing is on).
  4. "Add school" is the page's **one ink primary** (R4): opens `AddSchool` (a search `Combobox`-style `SearchField`
     over `listMedSchoolsApi` results, program choice by degree, duplicate and cap messages as `t-meta`). The
     list-driven path ("Add this list to my tracker") lives on the lists page (Task 11).
  - Empty states: no cycle (`EmptyState` + the single primary "Add cycle"... only one primary per view: the empty
    state's button is the primary, the header's is ghost), no applications, error with retry; skeleton rows hold the row
    shape; a `401` after load turns into the sign-in prompt (D17).

- [ ] **Step 1: Write the failing tests** (`tracker-page.test.tsx`, `renderToString` with a seeded cache):
  - Signed out (session mocked absent) renders the prompt with the exact `callbackURL` and no tracker markup; with data
    renders each application's school as a link to `/rmh-medschool/<slug>`, program labels by degree (a DO school's PHD
    row reads "DO-PhD", never "MD-PhD"), dates as "Nov 20" under `TZ=America/Los_Angeles` for `'2026-11-20'`.
  - The switch has an accessible name, `aria-checked` equals the DTO, is `disabled` with the unavailable line when
    `sharingAvailable: false`; the explanation text contains "at least 3 people", "never shared" and does not contain
    "applicants".
  - Exactly one `variant="primary"`/default ink button in the tree per state (empty, populated).
  - Rules (`ui-rules.test.ts` extended): no `fetch(`, no JSX text literals, no
    `surface-card`/`surface-panel`/`rounded-xl|2xl|full`/`shadow-`/`backdrop`, no raw `<table`, route file has
    `noIndex: true`, `definePage`, `prefetchRouteQuery`, and imports nothing from `ui/charts`/`d3`/`zod`; notes rendered
    as text (a fixture note `<img src=x onerror=1>` appears escaped in the HTML string).
  - `MilestoneForm` offers only unset types for add and the date input's `min`/`max` match the cycle window.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/ui/tracker`. Expected: FAIL.
- [ ] **Step 3: Implement.** Mutations call `api(contract, input)`, then
      `invalidateQueries({ queryKey: ['medschools','me'] })`; the toggle and delete handlers `await` the response before
      changing visible state. Reuse `Switch`, `Select`, `Button`, `ConfirmDialog`, `Menu`, `Dialog`, `EmptyState`,
      `Skeleton`, `useArrival`; write no new CSS classes (Task 14 measures).
- [ ] **Step 4: Run**
      `pnpm exec vitest run features/medschools lib/__tests__/design-consistency.test.ts lib/__tests__/style-tiers.test.ts lib/__tests__/arrival-coverage.test.ts lib/__tests__/og-page-coverage.test.ts lib/__tests__/sitemap-coverage.test.ts`
      and `pnpm typecheck` (a dev run or `vite build --mode development` regenerates `routeTree.gen.ts`; never edit it).
      Then the rough visual check: seed (Task 13 harness or the existing seed), open 390 and 1280, Day, once signed in.
      Expected: PASS and no clipping.
- [ ] **Step 5: Commit** — `feat(medschools): the private tracker page with an anonymous sharing switch`.

---

### Task 11: Lists page, "Save to list" menu, preferences section, add to tracker

**Files:**

- Create: `app/routes/_site/rmh-medschool/lists.tsx`
- Create: `features/medschools/ui/lists/ListsPage.tsx`, `ListCard.tsx` (rows, not boxes: the name is `ListSection`),
  `ListItemRow.tsx`, `PrefsSection.tsx`, `lists-page.test.tsx`
- Create: `features/medschools/ui/SaveToList.tsx`, `SaveToList.test.tsx`
- Modify: `features/medschools/feature.ts` (`routes`), `ui/ui-rules.test.ts`

**Interfaces:**

- Consumes: Tasks 7–9; `SortableList` (`components/ui/sortable-list.tsx`: drag plus always-present ▲/▼ buttons, so
  keyboard and touch can reorder), `Menu`/`AnchoredMenu`, `PromptDialog` (rename, new list), `ConfirmDialog`.
- Produces: route `/_site/rmh-medschool/lists` (same shape as Task 10; `noIndex: true`, loader prefetches `listsQuery()`
  and `prefsQuery()`). **Page:** `PageLayout` title "My lists"; one section per list, in `position` order, reorderable
  via `SortableList`; each section header: the name (rename and delete in a `Menu`), item count, ghost "Add to my
  tracker" `Button`; each item row on a rule: school link, `degree · state`, program (`program-either` "Either program"
  / the O5 labels), an inline note field (`Textarea`, saved on blur through `patchMedListItemApi`, counted to 500),
  remove `IconButton`, reorder handles. "New list" is the page's one ink primary. Then a "Preferences" section (D13;
  Open Q9): `Select`s for program (All / MD-PhD or DO-PhD style by the chosen degree, never both degrees' labels at
  once), degree (None / MD / DO), home state, and the category toggles (`CategoryToggles`, the phase 3 component,
  writing `chartCategories`), each change `PUT`s the whole prefs object (rows on rules, `t-meta` line "These fill in a
  page's defaults only when its address does not say otherwise."). Stale order (409) refetches silently and shows a
  `t-meta` line once.
- `SaveToList({ school: { slug, name }, program?: MedProgram | null })`: an icon `IconButton` (bookmark glyph from
  lucide, `aria-label` "Save {{name}} to a list") that opens a `Menu` of the user's lists with a check on lists that
  already hold the school, "New list" (prompt for a name) and, when the user has no list, a single "My schools" row.
  Renders **nothing** when signed out or the session is unresolved. Toggling a list row calls `saveMedListItemApi` /
  `deleteMedListItemApi`; the menu reflects the server response, not an optimistic guess.

- [ ] **Step 1: Write the failing tests.**
  - `SaveToList.test.tsx`: signed out renders no markup; signed in with two lists, one holding the school, shows two
    rows with `aria-checked`/check matching, a "New list" row, an accessible trigger name containing the school name;
    with no lists shows exactly "My schools" and "New list"; the trigger is a `button` with `pointer-coarse:min-h-11`
    class (touch floor).
  - `lists-page.test.tsx`: signed out → prompt with `callbackURL="/rmh-medschool/lists"`; lists render in position order
    with items as rows; an inactive school's item still renders, with a `t-meta` "no longer listed" line and no link
    action that would 404; the note field `maxLength` 500 and counts code points; the preferences `Select` for program
    offers only labels of the chosen degree (a `DO` preference never shows "MD-PhD"); exactly one default-variant
    button; "Add to my tracker" calls `addMedListToTrackerApi` once and shows `added`/`skipped` counts from the
    response; rename and delete go through the prompt and confirm dialogs.
  - Rules in `ui-rules.test.ts`: the same static rules as Task 10 over the new files; no `layoutId`; `SortableList` is
    the only reorder implementation (no second drag library import).
- [ ] **Step 2: Run to verify failure:**
      `pnpm exec vitest run features/medschools/ui/lists features/medschools/ui/SaveToList.test.tsx features/medschools/ui/ui-rules.test.ts`.
      Expected: FAIL.
- [ ] **Step 3: Implement.** Check R5 on `SortableList` (it animates in response to a drag only; Fact 9). Mutations
      invalidate `['medschools','me']`.
- [ ] **Step 4: Run**
      `pnpm exec vitest run features/medschools lib/__tests__/design-consistency.test.ts lib/__tests__/style-tiers.test.ts lib/__tests__/arrival-coverage.test.ts`
      and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): saved lists page, Save to list menu and preferences`.

---

### Task 12: Prefs and lists on the public pages (index, school, live)

**Files:**

- Modify: `app/routes/_site/rmh-medschool/index.tsx`, `$slug.tsx`, `live.tsx` (loaders),
  `features/medschools/ui/IndexPage.tsx`, `SchoolPage.tsx`, `ActivityTab.tsx`, `LivePage.tsx`
- Modify: `features/medschools/ui/pages.test.tsx`, `school-page.test.tsx`, `ui-rules.test.ts`

**Interfaces:**

- Consumes: Tasks 9, 11.
- Produces:
  - **Loaders (D13):** each route loader first `await prefetchRouteQuery(context.queryClient, prefsQuery())`, then
    `const prefs = context.queryClient.getQueryData(prefsQuery().queryKey) ?? null`, then
    `const view = applyPrefs(kind, deps, prefs, ctx)`, then prefetches the public queries with `view` (explicit
    parameters only). The school loader still returns `SchoolHead`; the `head()` and canonical are computed from the
    path only (a preference never changes `<title>`, canonical or og). The index loader also prefetches `listsQuery()`
    when `deps.list` is set. The prefs prefetch is skipped on the server for a request that carries no session cookie if
    Fact 4 finds a cheap way; otherwise it is accepted (a cookie-less request makes no database read).
  - **Index:** `?list=<id>|all` (parsed by `parseIndexSearch`, string id `^[a-z0-9]{1,40}$` or `all`); a "My lists"
    ghost `Select` or `Button` visible only to signed-in users with at least one list ("All schools" / "All my lists" /
    each list), filtering the public `schools` array **client-side** by the list items' slugs (D15); a signed-out viewer
    of a `?list=` link sees the unfiltered index and a `t-meta` line. Each row gets `<SaveToList>` in its trailing slot
    for signed-in viewers (the figure column keeps its width; Task 13 checks 320px). `PrefsNote` shows while
    `view.fromPrefs`.
  - **School page:** `SaveToList` beside the page actions (program = the current `ProgramFilter` when `REG|PHD`, else
    `null`); program and `show` defaults from prefs through `useEffectiveView('school', …, { schoolDegree })`; the
    `CategoryToggles` write via `writeSearch`; links to "My tracker" and "My lists" (`Link`, signed-in only) in the
    page's `t-meta` row.
  - **Live:** degree and program defaults from prefs (`NONE` is never a preference).
  - A `t-meta` "My tracker · My lists" pair of links appears on the index for signed-in viewers (this is where the two
    private pages are discovered).

- [ ] **Step 1: Write the failing tests** (extend the phase 3 page tests; `renderToString` with a seeded cache):
  - **SSR parity (Review Focus 10):** index with prefs `{programFilter:'PHD', degree:'MD'}` seeded and an empty URL: the
    HTML shows the MD-PhD option selected, the public query seeded under the explicit key `{degree:'MD', program:'PHD'}`
    and **not** under the empty key; the same markup with `?program=ALL&degree=MD` shows All; with no prefs the HTML
    equals the phase 3 fixture snapshot byte for byte (guard against drift).
  - **Loader (route file source + a unit test with a fake queryClient):** the loader calls `prefsQuery` before any
    public prefetch, passes the `applyPrefs` result to `schoolsQuery`/`todayQuery`/`activityQuery`, never passes a user
    id, and a failed prefs fetch (queryClient cache empty) behaves as phase 3.
  - **Public cache untouched (Review Focus 10):** the URLs the loader produces for the public endpoints (via
    `apiUrl(contract, input)`) contain only the documented public query keys; none contains `list`, `userId`, `prefs`;
    the six public routes' tests (`read-routes.server.test.ts`) pass unchanged.
  - **Lists filter:** `?list=all` with two lists holding two of five schools shows exactly those two rows (no refetch:
    assert the public query key is unchanged); an inactive school on a list is skipped silently; signed out shows five
    and the explanation line.
  - **Save menu on rows:** present for signed-in, absent for signed-out in the same fixture; a school page with
    `?program=PHD` saves with `program: 'PHD'`.
  - **Collisions:** `/rmh-medschool/tracker` and `/lists` resolve to their own routes (route-tree test or a static
    assertion that both files exist next to `$slug.tsx`).
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/ui`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run**
      `pnpm exec vitest run features/medschools lib/__tests__/design-consistency.test.ts lib/__tests__/style-tiers.test.ts lib/__tests__/og-page-coverage.test.ts lib/__tests__/sitemap-coverage.test.ts lib/__tests__/arrival-coverage.test.ts`
      and `pnpm typecheck`; run `pnpm exec tsx scripts/check-entry-composition.ts --strict` after a
      `pnpm build:frontend:sourcemap` (no `zod`, no `d3-*` in the entry). Then the rough visual check at 390 and 1280,
      Day, signed in with a preference and a list. Expected: PASS.
- [ ] **Step 5: Commit** —
      `feat(medschools): preferences fill the public pages' defaults, lists filter the index, Save to list on rows`.

---

### Task 13: Black-box tests, seeded visual pass, erasure script

**Files:**

- Create: `testing/integration/medschools-private.test.ts`, `scripts/medschools/check-rmh-events.ts`,
  `scripts/medschools/verify-erasure.ts`
- Modify: `testing/integration/lib/medschools-fixture.ts` (more fixture: a second school, helpers `seedTrackerFixture`,
  `rmhEventCount`, `rmhCountRows`), `scripts/medschools/seed-visual.ts` (a signed-in demo account's tracker, two lists,
  prefs; labelled FIXTURE), `scripts/medschools/visual-check.mjs`, `.github/workflows/web-ci.yml` (the integration job's
  env gets `MEDSCHOOLS_DEDUPE_SECRET`, a test-only 32-character value, and the same value is exported for the test's own
  recomputation)

**Interfaces:** consumes everything; produces evidence. Lesson from phase 3: **CI's database is empty**, so the test
writes its own school, users (`signUp(label)` from `testing/integration/lib/client.ts`) and rows in `beforeAll`, deletes
them in `afterAll`, and asserts nothing about pre-existing data.

- [ ] **Step 1: Black-box test** `medschools-private.test.ts` (running app, two real users `a` and `b`, one fixture MD
      school and one DO school):
  - **Auth and cache:** every `/api/medschools/me/**` is 401 anonymously; every 200 response has a `cache-control` with
    no `public`/`s-maxage` and no `etag`; `/api/medschools/schools` still carries `public` and `s-maxage` and **does not
    change** with a session cookie sent (byte-equal bodies with and without a session for the same URL).
  - **Cross-user (Review Focus 6):** `b` calls list, item, application, milestone, add-to-tracker with `a`'s ids: 404
    each, `a`'s data intact.
  - **Share on/off through the public endpoint (Review Focus 3):** three users (`a`, `b`, a third `signUp`) each share
    an `INTERVIEW` milestone for the fixture school on the same day: `GET /api/medschools/schools/<slug>/activity` now
    contains an RMH series for that day (and its "Sources" data names RMH); `a` turns sharing off: the RMH series
    vanishes from the response (2 contributors) and `rmhEventCount` via `db()` is 2; `a` re-enables: back to 3; the
    response still carries no `contributors` key, no `dedupeHash`, and `/api/medschools/live` still contains no RMH row.
    With only 2 users sharing, assert the series is absent while `med_cycle_count` holds a `contributors: 2` row.
  - **Edits and deletes:** moving a milestone's date moves the count between two `med_cycle_count` rows; deleting the
    application, the cycle, the milestone each leaves `rmhEventCount` and `rmhCountRows` for the cell equal to a
    recompute; `COMPLETE`/`SUBMITTED` never create an event.
  - **Anonymity at rest:** after a share, every `med_cycle_event` row with `source = 'RMH'` for the fixture school has
    an id that is a UUID, `"ingestedAt" = "occurredAt"`, `"inState" is null`, and `JSON.stringify(row)` contains none of
    the users' ids, the cycle, application or milestone ids; `\d med_tracker_milestone` has no hash column (query
    `information_schema.columns`).
  - **Concurrency (Review Focus 1):** 20 mixed requests with `Promise.all` (toggle on/off, add/delete milestones, from
    two clients on the same account) then `eventually` the invariant:
    `events == shareable milestones under the final flag` (computed in the test from the DB with the same HMAC, using
    the shared test secret) and counts equal `group by`.
  - **Lists and prefs:** create, rename, reorder, add 3 items, note, remove; the 21st list and the 201st item are 409
    (seed 200 items with SQL for speed); "My schools" created once under `Promise.all` of two first saves; prefs round
    trip; `GET /rmh-medschool?...` HTML for the signed-in user with a `PHD` preference contains the MD-PhD option
    selected and the same URL anonymous does not; `/rmh-medschool/tracker` anonymous HTML contains the sign-in prompt
    and `noindex`.
  - **Reserved slug:** `/rmh-medschool/tracker` is not the school 404. Run:
    `INTEGRATION_BASE_URL=http://localhost:7005 DATABASE_URL=$DATABASE_URL MEDSCHOOLS_DEDUPE_SECRET=… pnpm test:integration -- testing/integration/medschools-private.test.ts`
    (scratch DB and app as phase 3 Task 12 Step 2, with the secret exported to the app too). Expected: PASS.
- [ ] **Step 2: Erasure and audit scripts.** `verify-erasure.ts` (scratch-DB guard like `seed-visual.ts`: localhost and
      a name containing `scratch`): seeds two users with shared milestones in overlapping cells, runs
      `anonymizeAccount(userA)` from the real module, asserts zero RMH events for A's milestones, counts equal a
      recompute, B's contribution intact, A's tracker/list/prefs rows gone, and exits non-zero otherwise; it also kills
      the pre-step midway (a thrown error injected through a test-only env flag **in the script, not the product code**)
      and re-runs. `check-rmh-events.ts` runs `auditRmh` against any database (read-only) and prints the three counts;
      document it in `features/medschools/CLAUDE.md` as the check to run after rotating the secret. Both are thin: logic
      stays in `features/medschools/api/`.
- [ ] **Step 3: Screenshots (O6).** Extend `visual-check.mjs`: sign in as the seeded demo account (cookie jar from the
      sign-in API, as the script does for other routes); capture `/rmh-medschool/tracker` (empty cycle, populated,
      add-milestone form open, sharing on, `sharingAvailable` false by launching a second app instance without the
      secret), `/rmh-medschool/lists` (several lists, a note being edited, preferences), `/rmh-medschool` with the Save
      menu open on a row, with `?list=all`, with a preference applied (the `PrefsNote` visible) and one with
      `program=ALL` explicit, `/rmh-medschool/<slug>` with the Save menu open; Day and Night at the ten O6 sizes plus
      `ar` at 390 and 1280; assert per shot no sideways scroll, the touch targets of the new controls ≥ 44px at the
      coarse-pointer viewports, nothing clipped at 320×568 (row trailing menu, date input, switch label wrapping), the
      tracker sharing explanation never truncated, the Save menu fully inside the viewport at 844×390, mirrored layout
      in `ar`. **Look at every PNG**; fix and re-run; do not commit PNGs.
- [ ] **Step 4: Page audit:**
      `pnpm audit:pages --routes /rmh-medschool,/rmh-medschool/tracker,/rmh-medschool/lists,/rmh-medschool/<slug> --full --base-url http://localhost:7005`
      (signed-in cookie where the script supports it). Expected: no edge-pinned layer, no anatomy drift; do not add
      allowlist entries.
- [ ] **Step 5: Run the erasure and audit scripts** against the scratch database:
      `pnpm exec tsx scripts/medschools/verify-erasure.ts && pnpm exec tsx scripts/medschools/check-rmh-events.ts` (both
      zero-orphan). Tear the scratch database down.
- [ ] **Step 6: Commit** —
      `test(medschools): black-box tests for the private tracker, sharing and erasure, with a seeded visual pass`.

---

### Task 14: Budget, docs, final gate

**Files:**

- Modify: `scripts/check-bundle-budget.ts` (only as measured), `features/medschools/CLAUDE.md`, `features/CLAUDE.md`
  (nothing new in "Moved so far"; confirm), `docs/plans/2026-11-11-steel-design-implementation.md` §18 (the D13 row),
  `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md` §14 (phase 4 status line), `docs/_generated/facts.json`,
  `locales/en/medschools.json`, `locales/en/errors.json`, `.env.example` (note that the web tier reads
  `MEDSCHOOLS_DEDUPE_SECRET` too, and that rotating it orphans shared events: run `check-rmh-events.ts`),
  `server/CLAUDE.md` or `docs/architecture.md` only if the secret is now read by web (one sentence)

- [ ] **Step 1: Measure** exactly as phase 3 Task 11: baseline in a second worktree on `main` (`pnpm build:frontend`,
      `pnpm exec tsx scripts/check-bundle-budget.ts --json`), then the branch (`pnpm build:frontend:sourcemap`, same
      command, `pnpm exec tsx scripts/check-entry-composition.ts --strict`). Record `siteCssBrotli`, `entryRaw`,
      `criticalPathRaw`, `criticalPathBrotli` and the delta; also compare the signed-out `/rmh-medschool` document TTFB
      p50 over 50 requests before and after (the loader now dispatches one extra in-process request, Fact 4) and record
      it.
- [ ] **Step 2: Find what the CSS cost** (diff class selectors as phase 3 did); replace arbitrary-value utilities with
      existing classes first.
- [ ] **Step 3: Raise only the measured remainder** in `BUDGETS` with a dated comment in the existing form, headed
      `RMH Med Schools tracker and lists (2026-11-xx): site CSS brotli RAISED … (OPT-01 line)`, naming the feature, the
      measured before/after and the headroom kept; same for the other lines only if they exceed. Never raise a line that
      still passes. If nothing exceeds, change nothing.
- [ ] **Step 4: Docs.** `features/medschools/CLAUDE.md`: a "Private (phase 4)" section: the two pages, the `me/**`
      endpoint list, the one-writer rule and why (D1), the hash rule and the no-stored-link reason (D2, D3),
      `contributors` (D4), the reconcile algorithm (D5), what is and is not shared, account deletion (D9), how
      preferences apply (D13, D14), the rotation procedure, and a line under "What is public" saying the public
      endpoints stay user-independent. Steel §18 D13 row: append "Phase 4 adds the private tracker, the lists page and
      the Save to list menu to the same gap; unanswered." Spec §14: a phase 4 status line listing the decisions and
      owner answers. Run `pnpm i18n:extract` and confirm `locales/en/medschools.json` gained every `tracker-`, `lists-`,
      `prefs-`, `save-`, `share-` key and kept the earlier ones; `pnpm facts:generate`; `pnpm docs:deletion --check`.
- [ ] **Step 5: Final gate.** `pnpm check:consistency --base main`, `pnpm test`, `pnpm typecheck`, `pnpm lint`,
      `pnpm exec tsx scripts/check-bundle-budget.ts`, `pnpm exec tsx scripts/check-entry-composition.ts --strict`,
      `pnpm api:routes:check`, `pnpm images:variants:check`. Expected: all green, no new warnings.
- [ ] **Step 6: Record the PR lines** (budget raise if any, the new env requirement on the web tier, the migration, "no
      public endpoint changed").
- [ ] **Step 7: Commit** — `docs(medschools): phase 4 documentation, budget record and the Steel gap note`.

---

## Self-review (against the spec; fixes applied above)

- **Spec coverage:** §7 tracker models, sharing "writes an anonymous `MedCycleEvent` (source RMH) per milestone and
  deletes it if sharing is turned off" → Tasks 1, 3, 4; "School lists and preferences" paragraph (models, limits, Save
  to list, lists view, Show my lists only, Add this list to my tracker, URL wins, separate auth-required
  never-publicly-cached endpoints, anonymization schema test) → Tasks 1, 7, 8, 11, 12; §6 anonymization and k≥3 → D2–D4,
  Tasks 3 and 13; §6 "First-party data contributes … only if the user opted in, and only through aggregates" → default
  off, one-writer, public readers unchanged; §11 `tracker.tsx` signed-in → Task 10; §13/14 item 4 → all; account
  deletion → Task 6; O6 → Task 13.
- **Brief items:** private tracker (10), sharing with exact `contributors` and complete deletion (3, 6), lists and
  preferences with SSR/client decision and its reason (D13, D14, Tasks 9, 12), migrations and the updated schema test
  (1), account deletion confirmed (the user row is tombstoned, no cascade fires; explicit ops plus a pre-step), visual
  check, fixtures that seed their own data, budget (13, 14).
- **Step scan:** code appears only as signatures, the Prisma shapes, and the `reconcileShared` algorithm; every test
  case a task depends on is enumerated; decisions the implementer cannot make alone (paths, limits, copy, key names,
  lock keys, status codes) are fixed.
- **Type consistency:** `SHAREABLE`/`toSharedEvent` (Task 2) are what `reconcileShared` (Task 3) calls;
  `TrackerDto`/`MedListDto`/`MedPrefsDto` (Tasks 4, 7) are what the query factories (Task 9) and pages (Tasks 10–12)
  read; `Prefs` (Task 2) equals `MedPrefsDto`; `applyPrefs`/`writeSearch` (Task 2) are what `useEffectiveView` (Task 9)
  and the loaders (Task 12) call; `LIMITS` is the one source of every cap.
- **Gaps found and flagged, not resolved:** the floor is per day cell so the RMH series will be sparse for small schools
  (Open Q1); additions are visible the moment they cross 3, which lets a person who knows two contributors infer a third
  (Open Q2); the spec says nothing on abuse (Open Q8), on the secret's rotation (Open Q4), on whether account erasure is
  immediate (Open Q3), or on where preferences are edited (Open Q9).

## Facts an implementer must verify (do not assume)

1. **The web tier has `MEDSCHOOLS_DEDUPE_SECRET`.** `docker-compose.yml` gives `web`
   `env_file: ${ENV_FILE:-.env.production}`, the same file the worker reads, so it should; confirm on the deployed host
   and in `deploy.sh`, and that the integration CI job exports it (Task 13). Without it sharing is disabled (D8), which
   is safe but silent: log one `error` at boot when unset and a `medschools` worker/web start-up check line.
2. **Prisma drift with the partial unique index** (`migrate diff --exit-code` after the hand-added
   `WHERE program IS NULL` index) and with `prisma migrate status` in the `prisma` workflow. If it reports drift, the
   fallback is Open Q10's non-null `ANY` value, not a dropped constraint.
3. **The HTML document is per-viewer already** (root loader seeds the session user in `app/routes/__root.tsx`) and
   Apache/Cloudflare do not cache it publicly (`deploy/apache/rmhstudios.conf` has no HTML cache rule; confirm the
   Cloudflare page rules). D13 relies on it.
4. **`prefetchRouteQuery` on the server dispatches in-process with the request's cookies** (`wallet.tsx` relies on this)
   and what a cookie-less request costs (`defineHandler` auth required: no cookie, no database read). Look for a cheap
   "has a session cookie" signal in the loader context; if none exists, measure the extra in-process call (Task 14
   Step 1) before accepting it.
5. **`implement()` with no `cache` option adds no cache headers** and `microCache` is off (`lib/api/handler.server.ts`
   near lines 121 and 485): the `me/**` tests assert it, but confirm no wrapper default (an `ETag` on GET) leaks
   through.
6. **A `cuid()` default embeds a timestamp** (cuid v1) and that Prisma 7's `cuid()` is that variant: if it is cuid2 the
   reason for D3's UUID is weaker but the choice stays (it costs nothing).
7. **`hashtextextended` advisory locks work through the pooler** (`lib/__tests__/pgbouncer-safety.test.ts` bans
   session-scoped locks; `pg_advisory_xact_lock` is the allowed form and the precedents use it) and the lock-key spaces
   (`med-tracker:`, `med-rmh:`, `med-lists:`) do not collide with the existing ones.
8. **`og-page-coverage.test.ts` and `sitemap-coverage.test.ts` treatment of `noIndex` routes:** whether a private page
   needs a section card; do not add the pages to `STATIC_ROUTES` (the sitemap test rejects a listed noindex page).
9. **`SortableList` and R5/M-rules:** it uses framer-motion `Reorder` (drag) and `transition` from `lib/motion`; confirm
   it animates only in response to input and ends within 360 ms; if it does not, reorder with the ▲/▼ buttons only and
   say so in the PR.
10. **The anonymize sweep's mocked test** (`erasure-coverage.test.ts` prisma proxy returns op objects): a pre-step that
    reads through `prisma` needs the same module mock the other pre-steps have.
11. **Existing phase 3 test expectations about `program: 'ALL'`** in `search.test.ts`/`pages.test.tsx` change meaning in
    Task 9 (absent, then `ALL` through `applyPrefs`); keep every case, change the assertion shape, and say so in the
    commit.
12. **`MedSchool` deactivation** (`active: false`) while on a list, in the tracker or shared: tracker and list reads
    must not filter on `active`; the school page for an inactive slug is already a 404 (phase 3), so the row's link must
    degrade to plain text.

## Rulings on the open questions (facilitator, 2026-11-23, owner-overridable; these override task text)

The owner asked for all remaining phases to be completed without stopping, so each open question below is settled with
the privacy-safe option and recorded here for the owner to override.

- **Q1** Keep per-day cells with the k≥3 floor, exactly as the spec says. No weekly buckets.
- **Q2** Tracker figures update once a day. The public readers never read an RMH row's live `count` / `contributors`
  (which follow the tracker minute by minute); they read `publishedCount` / `publishedContributors`, copied from them by
  the daily job `medschools.rmh-publish` (00:05 UTC, an exclusive pg-boss queue fired by the jobs timekeeper, with a
  persisted minimum interval so a deploy does not re-fire it). A row never published is absent; the k≥3 floor applies to
  `publishedContributors`; the date hold-back (cells dated today UTC or later are dropped) stays as well. Why a snapshot
  and not only the date hold-back: members back-fill by back-dating, so a past cell crosses 3 (or goes 3 to 4) the
  moment someone saves, and the hold-back keyed on the cell's date would reveal who just shared. The writer keeps a cell
  whose last event went at count 0 (so it never vanishes mid-day); the job deletes zero rows. **Consequence the owner
  should know:** turning sharing off, or deleting a milestone, removes the event at once but leaves the public totals
  until the next daily update (at most about a day). The private tables and the live columns are exact at all times.
- **Q3** Shared events are removed at the moment of the deletion request (not at finalisation) and sharing is switched
  off. A cancelled deletion does not restore sharing; the tracker shows a one-line note and the user can turn it back
  on.
- **Q4** Reuse `MEDSCHOOLS_DEDUPE_SECRET` with the `RMH:milestone:` domain prefix (no new env var). Sharing fails closed
  (503, toggle disabled with a note) when it is unset. Document rotation as the plan describes.
- **Q5** Confirmed: no-program items become `REG`, the current cycle unless given, sharing off.
- **Q6** No in-state splits; `inState` stays null for RMH events; home state stays private.
- **Q7** `SUBMITTED`/`COMPLETE` are never shared as events. Phase 5 aggregates them server-side from private tracker
  rows under its own k≥20 floor (spec §10). No interview-scheduled dates in this phase.
- **Q8** Sharing requires an account at least 7 days old (server-checked; the toggle explains why when it is too new),
  plus the per-user write rate limit. RMH stays the last primary and is never summed.
- **Q9** Preferences live in a section under the lists on `/rmh-medschool/lists`. The default list's stored name is the
  user's own data, so storing it translated is fine.
- **Q10** Use a non-null three-valued column `ANY | REG | PHD` for `MedSchoolListItem.program` (a new enum), not a
  nullable column with a partial index; update spec §7 in the same change.
- **Q11** Confirmed: the window, the cycle-year range and 60 applications per cycle.
- **Q12** Build from `components/ui` primitives on rules; record the gap on the existing Steel §18 D13 row (it stays
  open).

## Open owner questions (not resolved by assumption; each names what the plan does meanwhile)

1. **Floor shape for RMH figures.** The spec's floor applies to "daily counts", i.e. each (school, program, day, type)
   cell needs 3 contributors. For most schools on most days an RMH series will be empty for a long time. Keep per-day
   cells (the plan's default, follows the spec exactly), or publish weekly buckets for RMH only (needs a reader change
   in phase 3 code and a decision on how a weekly figure is drawn on a daily chart)?
2. **Inference by differencing.** When a cell goes from 2 to 3, the three become visible at once, and a person who knows
   two of the contributors learns the third's school, type and day. Hold back the current UTC day's RMH cells until the
   day ends, publish RMH cells on a delay (say 24 hours), or accept it as CycleTrack's rule does? The plan accepts it
   and deletes immediately.
3. **When account deletion removes shared events.** The plan removes them at finalisation (30 days after the request,
   with everything else). Should they go at the moment of the request instead (then a cancelled deletion needs sharing
   restored, which the plan would have to build)?
4. **The server secret.** The plan reuses `MEDSCHOOLS_DEDUPE_SECRET` with a `RMH:milestone:` domain prefix (the spec's
   "the server secret") and needs it in the web tier. Use a separate `MEDSCHOOLS_RMH_SHARE_SECRET` instead? Either way
   rotating it orphans existing shared events (they can no longer be recomputed); the plan's answer is the audit script
   plus a documented procedure (turn off sharing for all, rotate, let users turn it on again). Acceptable?
5. **"Add this list to my tracker".** Items with no program become `REG`; the cycle is the current cycle unless given;
   the new cycle starts with sharing off. Confirm all three.
6. **Home state and in-state splits.** Tracker events are stored with `inState = null` and home state stays private (it
   adds a quasi-identifier and nothing reads it). Does the owner want RMH in-state/out-of-state splits later (each side
   would need its own 3-contributor floor, and `inState` would then be written)?
7. **`SUBMITTED` and `COMPLETE`, and interview dates.** Never shared in this phase. Phase 5's conditional chance needs
   "application complete → invite" times; does the owner want those aggregated from private tracker rows server-side (no
   event, own k≥20 floor, as §10 says) or shared as events (needs new `MedEventType` values and reader changes)? And
   does an "interview scheduled for" date (spec §7 `MedInterviewDate` REPORTED) belong in a later phase as a field on
   the `INTERVIEW` milestone?
8. **Abuse.** Three throwaway accounts can manufacture a public RMH cell. The spec is silent. Options: sharing requires
   an account older than N days or a verified/linked sign-in, a per-IP limit on sharing, or a cap on RMH's weight (it is
   never summed and is the last primary). The plan adds none beyond rate limits.
9. **Where preferences are edited, and defaults.** The plan puts a "Preferences" section under the lists on
   `/rmh-medschool/lists`; alternatives are a link in the index header or a dialog. The default list is named "My
   schools" (stored text, the client sends it translated); is storing a localised default name acceptable?
10. **`NULL` program uniqueness in list items.** The plan keeps the spec's `program MedProgram?` and adds a partial
    unique index plus a lock-guarded check. The alternative is a non-null three-valued column (`ANY | REG | PHD`), a
    small deviation from the spec text that removes the hand-written SQL. Which?
11. **Window and caps.** Milestone dates within `[cycleYear-1-05-01, cycleYear-08-31]` and not past tomorrow UTC; cycle
    years within three back and one forward; 60 applications per cycle (the spec fixes lists but not the tracker's cap).
    Confirm or change.
12. **Steel §18 D13/X2.** Forms inside rows, the Save to list menu and the preferences rows have no section-10 recipe.
    The plan builds them from `components/ui` primitives on rules and records the gap on the existing D13 row. Answer
    D13/X2 now, or after seeing the pages?
