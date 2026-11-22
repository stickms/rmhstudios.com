# RMH Med Schools — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the data foundation for RMH Med Schools: the Prisma models, the US MD/DO school registry with CycleTrack
aliases, a `medschools-worker` process (pg-boss, fully wired for deploy), and a polite CycleTrack ingest (hourly +
resumable historical backfill) whose anonymization boundary is test-enforced.

**Architecture:** Pure logic in `features/medschools/engine/`; per-source scrapers in `features/medschools/scrape/`
behind a shared polite-HTTP host gate (one request at a time per host, ≥1 s spacing, ≥2 s for backfill, backoff, halt
after 3 consecutive failures). Adapters return only `NormalizedCount` / `NormalizedEvent` values (no person fields);
pipelines write through a structural `MedPrisma` interface so tests use an in-memory fake, exactly as
`lib/homes/scrape/` does. The worker is a second copy of `server/homes-worker/index.ts` with two
`startScheduledConsumer` queues.

**Tech Stack:** TypeScript strict, Prisma 7 (`@prisma/adapter-pg`), pg-boss via `lib/jobs/scheduled-consumer.server.ts`,
`node-html-parser` (already a dependency), vitest (colocated `*.test.ts`, discovered by glob), esbuild bundle, Docker
Compose.

**Spec:** `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md` (phase 1 = §14 item 1; schema §7, worker §8,
anonymization §6, wiring §13). App URL is `/rmh-medschool`.

## Global Constraints

- Stack of record is TanStack Start + Vite + React 19 + Nitro. **Not Next.js.** Phase 1 adds no routes, UI, API
  endpoints, catalog entry or i18n namespace (all phase 3).
- **Anonymization is a hard invariant (spec §6):** no identifier of a person crosses the adapter boundary. Raw response
  types are private to the adapter; adapters emit only `NormalizedEvent`/`NormalizedCount`. Source dedupe keys are
  stored only as `HMAC-SHA256(MEDSCHOOLS_DEDUPE_SECRET, source + ':' + id)`, never raw. No `medschools.prisma` column
  named like `user.*name|author|avatar|display` (the `userId` of private tracker models is the only exception; none
  exist in phase 1).
- **Sources are never summed** (spec §7, §10). CycleTrack counts are "reported events", not applicants.
- **Politeness (spec §8), every adapter:** one request at a time per host; ≥1 s spacing (backfill ≥2 s); User-Agent
  `RMHStudiosMedSchools/1.0 (+https://rmhstudios.com/rmh-medschool)` (no personal address); honour `Retry-After`/429
  with exponential backoff; conditional GET where the host supports it; stop the source for the run after 3 consecutive
  failures; respect robots.txt (CycleTrack disallows `/amcas/account/` and `/_internal/`). All of it is written down in
  `features/medschools/scrape/sources.ts` and nowhere else.
- **Scheduler:** pg-boss only. No `setInterval`/node-cron (`lib/__tests__/scheduler-ratchet.test.ts`); the worker's
  shutdown wait uses a promise race with `setTimeout`, so no ratchet row is added.
- **Queues:** `medschools.cycletrack` (hourly at :20, i.e. cron `20 * * * *`) and `medschools.backfill` (manual
  `runNow` + bootstrap). **Env:** `MEDSCHOOLS_CYCLETRACK_ENABLED`, `MEDSCHOOLS_CYCLETRACK_CRON`,
  `MEDSCHOOLS_DEDUPE_SECRET`, `MEDSCHOOLS_SHUTDOWN_DEADLINE_MS`.
- **Worker resources (spec §13):** compose `mem_limit: 512m`, `cpus: 0.5`, `DATABASE_POOL_SIZE=3` (the worker's own
  PrismaClient is also `max: 3`).
- **Server-only code:** never import `*.server.ts` from client code. Do not create a directory named `server/` inside
  `features/medschools/` (`tsconfig.server.json` globs `features/*/server/**`); use `scrape/`.
- **Typecheck projects:** every new file must be in exactly one tsconfig project
  (`lib/__tests__/tsconfig-projects.test.ts`). `features/**`, `server/**` fall in `tsconfig.site.json`
  (`include: **/*.ts`; only `server/api-routes` and `scripts` are excluded). `scripts/**` is excluded from every
  project, so keep logic in `features/medschools/` and make scripts thin.
- **Migrations are additive** (`lib/__tests__/migrations-additive.test.ts`, `scripts/check-migration-safety.ts`): new
  tables only. Name: `prisma/migrations/<YYYYMMDDHHMMSS>_<snake_name>/migration.sql`; latest existing is
  `20261120110000_rmhcharacters`.
- **Commit gate:** every commit passes `pnpm check:consistency`. The agent hook runs it automatically on `git commit`;
  **stage first, commit separately** (`git add …` then `git commit …`) so exactly the staged tree is gated. A failing
  gate is fixed, never bypassed. Commit messages explain why and end with the session's attribution trailer.
- No new type/lint warnings; no `any`/`@ts-ignore` (ratcheted). Generated files (`app/routeTree.gen.ts`) are never
  hand-edited. No secrets in the repo.

## Review Focus

Failure modes the spec implies but a straightforward implementation would miss. Each has a pinning test in the owning
task.

1. **Empty or missing table is not zero.** CycleTrack says "Missing charts mean data is unavailable, not zero." A school
   page with a stamp but no table for a program/cycle must leave stored counts for that program/cycle untouched. → Task
   5 (`parse: page with stamp and no tables returns empty`), Task 7
   (`does not delete counts for a program/cycle absent from the page`).
2. **Challenge / error page served with HTTP 200.** A Cloudflare interstitial, a login redirect or a renamed layout must
   be a _failure_ (counts toward the 3-strike halt), never "zero events". → Task 5 (`UnexpectedPageError`), Task 7
   (`three unexpected pages halt the run`).
3. **School-name key edge cases.** `Texas A&amp;M` (HTML escape), `Massachussetts` (upstream typo), `%20` encoding, and
   Canadian entries must round-trip sitemap → alias key → request URL → alias lookup. → Task 3 (names), Task 5 (sitemap,
   `schoolUrl`), Task 6 (registry).
4. **Upstream revisions and re-runs.** A count lowered or removed upstream must overwrite/delete (never add), and a
   second identical run must write nothing. → Task 3 (`diffCounts`), Task 7
   (`second identical run performs zero writes`).
5. **Interrupted runs.** A SIGTERM mid-walk or a crash mid-backfill must leave the run `PARTIAL`/stale and the next
   backfill must resume from the cursor, not restart or skip. Dates are plain `YYYY-MM-DD` stored as `@db.Date` with no
   timezone shift. → Task 8, Task 7 (`date round-trips without timezone shift`).

---

## File Structure

```
prisma/schema/medschools.prisma                      models + enums (Task 2)
prisma/migrations/20261120120000_medschools/         additive migration (Task 2)
features/medschools/
  feature.ts                                         manifest, listed:false (Task 3)
  engine/types.ts                                    enums, NormalizedCount/Event (Task 3)
  engine/dedupe.ts  cycle.ts  names.ts  diff.ts      pure helpers (Task 3)
  engine/schema.test.ts                              schema anonymization test (Task 2)
  scrape/sources.ts                                  politeness config (Task 1)
  scrape/http.ts                                     createPoliteHost (Task 4)
  scrape/types.ts                                    MedPrisma structural interface (Task 7)
  scrape/test-support.ts                             fake prisma, fixture loader, leak guard (Task 7)
  scrape/registry.ts                                 build/seed registry + cycles (Task 6)
  scrape/ingest-page.ts                              write one parsed page (Task 7)
  scrape/run-cycletrack.ts                           hourly run (Task 7)
  scrape/run-backfill.ts                             resumable backfill (Task 8)
  scrape/adapters/cycletrack/{parse-school,parse-first,parse-sitemap,urls,index}.ts + tests (Task 5)
  scrape/adapters/cycletrack/__fixtures__/*          captured HTML/JSON (Task 1)
  scrape/adapters/mdapplicants/…                     gated (Task 9)
data/medschools/schools.json  cycles.json  overrides.json   reviewed registry (Task 6)
scripts/medschools/capture-cycletrack.ts             one-shot fixture capture (Task 1)
scripts/medschools/build-registry.ts                 registry builder (Task 6)
server/medschools-worker/index.ts + wiring.test.ts   the process (Task 10)
```

---

### Task 1: Feasibility spike and fixtures

**Files:**

- Create: `scripts/medschools/capture-cycletrack.ts`
- Create: `features/medschools/scrape/sources.ts`
- Create: `features/medschools/scrape/adapters/cycletrack/__fixtures__/` (files below)
- Test: `features/medschools/scrape/adapters/cycletrack/fixtures.test.ts`, `features/medschools/scrape/sources.test.ts`

**Interfaces:**

- Produces (`sources.ts`):
  ```ts
  export const MEDSCHOOLS_USER_AGENT = 'RMHStudiosMedSchools/1.0 (+https://rmhstudios.com/rmh-medschool)';
  export interface SourceConfig {
    origin: string;
    userAgent: string;
    spacingMs: number;
    backfillSpacingMs: number;
    maxConsecutiveFailures: number;
    maxRetries: number;
    retryAfterCapMs: number;
    timeoutMs: number;
  }
  export const SOURCES: { CYCLETRACK: SourceConfig }; // spacingMs 1000, backfillSpacingMs 2000, maxConsecutiveFailures 3, maxRetries 3, retryAfterCapMs 120_000, timeoutMs 15_000
  ```
- Produces: the fixture files and a **FINDINGS block** (header comment of the capture script) that Tasks 5, 8, 9
  consult. Each endpoint gets one line `USE` or `SKIP` plus the field shape.

- [ ] **Step 1: Copy the already-saved pages into the fixture dir, stripping the CSRF meta**

  Source `/tmp/claude-0/ct/` → fixtures: `yale.html`→`yale.html`, `alcom.html`→`alabama-com.html`,
  `toronto.html`→`toronto.html`, `first.html`→`first.html`, `sitemap.xml.html`→`sitemap.xml`,
  `hist.html`→`mdapplicants-index.html`. Run `sed -i '/name="csrf-token"/d'` on each. Do not copy the `.h` header files
  (they carry `set-cookie`). If `/tmp/claude-0/ct/` is gone, re-capture them in Step 3 instead.

- [ ] **Step 2: Write the failing fixture test**

  `fixtures.test.ts`: for every file in `__fixtures__/`, assert non-empty, no `csrf-token`, no `set-cookie`; assert
  `yale.html` contains `daily milestone observations, 2026-2027` and `Hourly update generated`; assert `sitemap.xml`
  contains `explorer/school/Texas%20A&amp;M` and `explorer/school/Massachussetts`. `sources.test.ts`:
  `SOURCES.CYCLETRACK` equals the values above and `MEDSCHOOLS_USER_AGENT` equals the spec string exactly.

- [ ] **Step 3: Implement `capture-cycletrack.ts` and run it once**

  Signature: `pnpm exec tsx scripts/medschools/capture-cycletrack.ts [--force]`. A fixed target list, fetched
  sequentially with `await sleep(1100)` between requests (≥1 s), UA = the constant above (literal for now; Task 4 swaps
  in the import), refusing to overwrite existing files without `--force`, `--max-time` guard of 12 requests, writing
  bodies only (no headers, `csrf-token` meta removed). Targets (≈9 requests): `/robots.txt`;
  `/explorer/school/Yale?view=historical` → `yale-historical.html`; `/explorer/school/A.T.%20Still%20-%20Arizona` →
  `atsu-arizona.html` (a **DO** page, to confirm the `md_info`/`phd_info` class names and caption text for DO schools);
  `/explorer/school/Texas%20A%26M` and `/explorer/school/Texas%20A&M` → `texas-am-encoded.html` / `texas-am-raw.html`
  (which spelling resolves); `/explorer/school/Yale/summary.json?program=reg` → `yale-summary.json`;
  `/static/explorer_graphs/mcat_gpa_155_reg.JSON` → `yale-mcat-gpa-reg.json` and `.../status_155_reg_curr.JSON` →
  `yale-status-reg-curr.json` (append the `?v=` stamp from `yale.html`); one per-school page linked from
  `mdapplicants-index.html` → `mdapplicants-school.html`. Stop at the first 403/429 and report; do not retry.

- [ ] **Step 4: Write the FINDINGS block** (header comment of the script, dated) answering, from the captured files: (a)
      does `/explorer` list schools with location, or must the registry builder read each page `<title>` ("Name (City,
      ST)")? (b) which `Texas A&M` spelling works → this fixes `schoolUrl` in Task 5; (c) does `yale-historical.html`
      use the same `daily milestone observations, YYYY-YYYY` tables (→ Task 8 reuses `parseSchoolPage`) or something
      else (→ Task 8 writes `parseHistoricalPage`); (d) are the `summary.json` / `mcat_gpa` / `status_*` JSON shapes
      usable for GPA/MCAT medians, ranges and interview→acceptance % (→ Task 5 `parseStatsJson`), or SKIP (stats fields
      stay null this phase); (e) DO page markup; (f) does the MDApplicants school page expose per-year counts (→ Task 9
      proceeds) or not (→ Task 9 is deferred); (g) any `ETag`/`Last-Modified` seen (CycleTrack sends
      `cache-control: private, no-store`, so conditional GET is expected to be unavailable). Adjust the later tasks'
      fixture names if they differ.

- [ ] **Step 5: Run tests**

  Run:
  `pnpm exec vitest run features/medschools/scrape/adapters/cycletrack/fixtures.test.ts features/medschools/scrape/sources.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit** —
      `git add scripts/medschools features/medschools && git commit -m "feat(medschools): CycleTrack feasibility spike, fixtures and politeness config"`

---

### Task 2: Prisma schema, migration, anonymization schema test

**Files:**

- Create: `prisma/schema/medschools.prisma`
- Create: `prisma/migrations/20261120120000_medschools/migration.sql`
- Test: `features/medschools/engine/schema.test.ts`

**Interfaces:**

- Produces Prisma models (accessor names are the lower-camel forms used later: `prisma.medSchool`, `medSchoolAlias`,
  `medSchoolAliasMiss`, `medCycle`, `medCycleCount`, `medCycleEvent`, `medSchoolStats`, `medSourceRun`). Table names
  `@@map` to snake_case (`med_school`, `med_school_alias`, …) as the other schema files do.

  Enums: `MedDegree {MD DO}`, `MedProgram {REG PHD}`,
  `MedEventType {SECONDARY INTERVIEW WAITLIST REJECTION ACCEPTANCE}`,
  `MedSource {CYCLETRACK ADMIT SDN MDAPPLICANTS RMH}` (alias rows never use `RMH`),
  `MedRunStatus {RUNNING OK PARTIAL FAILED}`, `MedRunTrigger {CRON MANUAL BOOTSTRAP}`.

  Models (spec §7 verbatim, plus the concrete column choices below):
  - `MedSchool`: `id cuid`, `slug @unique`, `name`, `shortName`, `degree MedDegree`, `city`, `state` (2-letter),
    `country @default("US")`, `website?`, `interviewFormat?`, `interviewType?`, `active @default(true)`, timestamps.
    Index `(degree, state)`.
  - `MedSchoolAlias`: `schoolId` (FK, cascade), `source`, `sourceKey`; `@@unique([source, sourceKey])`.
  - `MedSchoolAliasMiss`: `source`, `sourceKey`, `firstSeenAt`, `lastSeenAt`, `seenCount Int`, `resolvedSchoolId?`;
    `@@unique([source, sourceKey])`.
  - `MedCycle`: `cycleYear Int @id` (entry year), `amcasOpensOn?`, `amcasSubmitOn?`, `aacomasOpensOn?` (`@db.Date`),
    `dayZeroOn @db.Date` (start of day-of-cycle `d`, §10), `dateEstimated Boolean`.
  - `MedCycleCount`: `schoolId`, `program`, `cycleYear Int` (**no FK**: archive years 1998+ have no `MedCycle` row),
    `date @db.Date`, `eventType`, `source`, `count Int`, `contributors Int?`;
    `@@unique([schoolId, program, cycleYear, date, eventType, source])`; indexes `(schoolId, cycleYear)`,
    `(cycleYear, date)`.
  - `MedCycleEvent`: `schoolId`, `cycleYear`, `eventType`, `occurredAt`, `source`, `dedupeHash @unique`,
    `inState Boolean?`, `ingestedAt`. No program, no person fields. Indexes `(occurredAt)`, `(schoolId, cycleYear)`.
  - `MedSchoolStats`: `schoolId`, `program`, `cycleYear`, `gpaMedian Float?`, `gpaLow Float?`, `gpaHigh Float?`,
    `mcatMedian Int?`, `mcatLow Int?`, `mcatHigh Int?`, `interviewToAcceptancePct Float?`, `firstSecondaryOn?`,
    `firstInterviewOn?`, `firstAcceptanceOn?` (`@db.Date`), `sourceUpdatedAt DateTime?`;
    `@@unique([schoolId, program, cycleYear])`.
  - `MedSourceRun`: `id`, `source`, `job String`, `trigger`, `startedAt @default(now())`, `finishedAt?`, `status`,
    `stats Json?`, `error String?`; index `(source, job, startedAt)`.

- [ ] **Step 1: Write the failing schema test** (`features/medschools/engine/schema.test.ts`)

  Local helper `forbiddenColumns(schemaText: string): string[]` parses `model X { … }` blocks and returns `Model.field`
  for every scalar field whose name matches `/user.*name|author|avatar|display/i`, **and** every `userId` field on a
  model whose name does not start with `MedTracker` or equal `MedSchoolFollow`. Tests:
  - `medschools.prisma has no person-like columns`:
    `expect(forbiddenColumns(readFileSync('prisma/schema/medschools.prisma','utf8'))).toEqual([])`.
  - `the checker catches the columns it exists to catch` (negative control): feeds a string with
    `model MedCycleEvent { id String @id\n authorName String }`, `username`, `avatarUrl`, `displayName`, and `userId` on
    `MedCycleEvent`; expects all five reported, and `userId` on `MedTrackerCycle` not reported.
  - `MedCycleEvent has exactly the spec's columns`: field names of that model equal
    `['id','schoolId','cycleYear','eventType','occurredAt','source','dedupeHash','inState','ingestedAt']`.
  - `MedCycleCount unique key is (school, program, cycle, date, type, source)`: the `@@unique` line text contains those
    six fields in order.

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run features/medschools/engine/schema.test.ts` → FAIL (file
      `medschools.prisma` not found).

- [ ] **Step 3: Write `medschools.prisma`** per the Interfaces block; follow `prisma/schema/hearth.prisma` style (`///`
      doc comments, `@@map`, `@@index`). The header comment states the anonymization rule and that
      `MedCycleCount.cycleYear` is the entry year (2026-2027 → 2027).

- [ ] **Step 4: Create the migration.** With a throwaway Postgres (`DATABASE_URL=postgresql://…/scratch`), run
      `pnpm exec prisma migrate dev --create-only --name medschools`, then rename the generated directory to
      `20261120120000_medschools`. Check `prisma.config.ts`/`prisma/` for the shadow-database setting if the command
      asks for one.

- [ ] **Step 5: Verify schema, migration and generated client agree**

  Run:
  `pnpm exec prisma validate && pnpm exec prisma generate && pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema --exit-code`
  (add `--shadow-database-url` if required). Expected: all exit 0 (diff prints "No difference detected"). Then
  `pnpm exec vitest run features/medschools/engine/schema.test.ts lib/__tests__/migrations-additive.test.ts` → PASS.

- [ ] **Step 6: Commit** —
      `git add prisma features/medschools && git commit -m "feat(medschools): schema and migration for registry, counts, events, stats, runs"`

---

### Task 3: Engine primitives — types, dedupe HMAC, cycle math, name normalization, count diff

**Files:**

- Create: `features/medschools/feature.ts`, `engine/types.ts`, `engine/dedupe.ts`, `engine/cycle.ts`, `engine/names.ts`,
  `engine/diff.ts`
- Test: `engine/types.test.ts`, `engine/dedupe.test.ts`, `engine/cycle.test.ts`, `engine/names.test.ts`,
  `engine/diff.test.ts` (all under `features/medschools/`)

**Interfaces:**

- Produces (`types.ts`):
  ```ts
  export type MedSource = 'CYCLETRACK' | 'ADMIT' | 'SDN' | 'MDAPPLICANTS' | 'RMH';
  export type MedProgram = 'REG' | 'PHD';
  export type MedEventType = 'SECONDARY' | 'INTERVIEW' | 'WAITLIST' | 'REJECTION' | 'ACCEPTANCE';
  export interface NormalizedCount {
    source: MedSource;
    schoolKey: string;
    program: MedProgram;
    cycleYear: number;
    date: string /* YYYY-MM-DD */;
    eventType: MedEventType;
    count: number;
    contributors: number | null;
  }
  export interface NormalizedEvent {
    source: MedSource;
    schoolKey: string;
    cycleYear: number;
    eventType: MedEventType;
    occurredAt: Date;
    dedupeHash: string;
    inState: boolean | null;
  }
  ```
- Produces: `dedupeHash(secret: string, source: MedSource, id: string): string` (64-char hex; throws
  `Error('MEDSCHOOLS_DEDUPE_SECRET must be at least 16 characters')` otherwise);
  `cycleYearFromLabel(label: string): number` (`'2026-2027'`→2027, throws unless second = first+1);
  `dayOfCycle(date: string, dayZeroOn: string): number`; `defaultDayZero(cycleYear: number): string`
  (`${cycleYear-1}-06-01`); `normalizeSchoolKey(raw: string): string` (HTML-unescape, then `decodeURIComponent`, trim;
  never lowercases or fixes typos); `isCanadianLocation(location: string): boolean` (trailing `, XX` in
  `AB BC MB NB NL NS ON PE QC SK NT NU YT`); `slugify(name: string): string`;
  `diffCounts(existing: CountRow[], incoming: CountRow[]): { toCreate: CountRow[]; toUpdate: Array<CountRow & {id: string}>; toDelete: string[] }`
  where `CountRow = { id?: string; program; cycleYear; date; eventType; count }` keyed by
  `program|cycleYear|date|eventType`.
- `feature.ts`:
  `defineFeature({ id: 'medschools', kind: 'app', basePath: '/rmh-medschool', delivery: 'shell', routes: [], namespaces: [], listed: false })`
  (no `catalog`; phase 3 adds routes, namespace `medschools` and the catalog entry).

- [ ] **Step 1: Write the failing tests**
  - `types.test.ts`:
    `expectTypeOf<keyof NormalizedEvent>().toEqualTypeOf<'source'|'schoolKey'|'cycleYear'|'eventType'|'occurredAt'|'dedupeHash'|'inState'>()`
    and the same exact-key pin for `NormalizedCount` (`…|'count'|'contributors'`). This is the compile-time
    anonymization pin: adding a person field breaks it.
  - `dedupe.test.ts`: `dedupeHash('s'.repeat(16),'ADMIT','12345')` is `/^[0-9a-f]{64}$/`, equals a value computed in the
    test with `createHmac('sha256', secret).update('ADMIT:12345').digest('hex')`, does not contain `'12345'`, differs
    for source `'SDN'` with the same id, differs for another secret, throws for `''` and a 15-char secret.
  - `cycle.test.ts`: `cycleYearFromLabel('2026-2027')===2027`; `'2026-2028'` and `'abc'` throw;
    `defaultDayZero(2027)==='2026-06-01'`; `dayOfCycle('2026-06-01','2026-06-01')===0`, `('2026-12-31', …)===213`; no
    timezone drift: result identical under `TZ=Pacific/Auckland` and `America/Los_Angeles` (use `vi.stubEnv('TZ')` is
    unreliable, so implement with `Date.UTC` and assert on dates around DST changes:
    `('2027-03-14','2026-06-01')===286`).
  - `names.test.ts`: `normalizeSchoolKey('Texas%20A&amp;M')==='Texas A&M'`; `'Massachussetts'` unchanged;
    `'Arizona%20-%20Phoenix'==='Arizona - Phoenix'`; `isCanadianLocation('Toronto, ON')` true, `('New Haven, CT')`
    false, `('Portland, OR')` false (OR is Oregon, not a province), `('Kingston, ON')` true;
    `slugify('Texas A&M University College of Medicine')==='texas-a-m-university-college-of-medicine'`.
  - `diff.test.ts`: identical input → all three arrays empty; changed count → `toUpdate` with the existing `id` and new
    count; present-in-existing-absent-in-incoming → `toDelete` has the id; new key → `toCreate`; **a count lowered from
    20 to 18 updates to 18 (does not add)**; duplicate keys in `incoming` throw.

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run features/medschools/engine` → FAIL (modules missing).

- [ ] **Step 3: Implement** the signatures above. `dayOfCycle` and `diffCounts` approach: parse `YYYY-MM-DD` with
      `Date.UTC(y, m-1, d)` and divide by 86_400_000; `diffCounts` indexes `existing` in a `Map` by key.

- [ ] **Step 4: Run** — `pnpm exec vitest run features/medschools/engine lib/__tests__/feature-manifests.test.ts` → PASS
      (the manifest test checks id = folder, routes exist, namespaces registered).

- [ ] **Step 5: Commit** —
      `git add features/medschools && git commit -m "feat(medschools): engine primitives with anonymization type pin and dedupe HMAC"`

---

### Task 4: Polite HTTP host gate

**Files:**

- Create: `features/medschools/scrape/http.ts`
- Modify: `scripts/medschools/capture-cycletrack.ts` (import `MEDSCHOOLS_USER_AGENT` instead of the literal)
- Test: `features/medschools/scrape/http.test.ts`

**Interfaces:**

- Consumes: `SOURCES`, `SourceConfig` (Task 1).
- Produces:

  ```ts
  export class SourceHaltedError extends Error {} // thrown by get() once the session halted
  export interface PoliteResult {
    ok: boolean;
    status: number;
    body: string;
    notModified?: boolean;
  }
  export interface PoliteClient {
    get(path: string, opts?: { etag?: string }): Promise<PoliteResult>; // path or absolute URL on the source origin
    noteSuccess(): void; // resets the consecutive-failure counter
    noteFailure(reason: string): void; // pipelines call this for an unparseable page
    readonly halted: boolean;
    readonly requests: number;
    readonly lastFailure: string | null;
  }
  export interface PoliteHost {
    session(opts?: { spacingMs?: number }): PoliteClient;
  }
  export function createPoliteHost(
    config: SourceConfig,
    deps?: {
      fetchImpl?: typeof fetch;
      sleep?: (ms: number) => Promise<void>;
      now?: () => number;
    },
  ): PoliteHost;
  ```

  One host gate (serializer + last-request time) is shared by all sessions, so the hourly job and the backfill can never
  overlap on the host; each session has its own failure counter and spacing (`spacingMs` defaults to `config.spacingMs`;
  backfill passes `config.backfillSpacingMs`). Default transport is `safeFetch` from `@/lib/ssrf-guard.server` (dynamic
  import, `allowedProtocols: ['https:']`), as `lib/homes/scrape/http.ts` does.

- [ ] **Step 1: Write the failing tests** (fake `fetchImpl`, fake `sleep` that advances a fake `now`):
  - `sends the descriptive User-Agent on every request`: header equals
    `RMHStudiosMedSchools/1.0 (+https://rmhstudios.com/rmh-medschool)`.
  - `spaces consecutive requests by at least 1000 ms`: two `get`s → recorded request times differ ≥1000; with
    `session({spacingMs: 2000})` ≥2000.
  - `serializes concurrent callers`: two sessions call `get` with `Promise.all`; the fake fetch records an overlap
    counter that never exceeds 1.
  - `429 with Retry-After: 7 waits 7000 ms then succeeds`; `Retry-After` of 9999 s is capped at `retryAfterCapMs`
    (120000); a 503 without the header backs off 2000, 4000 ms (doubling from the spacing); a request still failing
    after `maxRetries` resolves `{ok:false}` and counts one failure.
  - `halts after 3 consecutive failures`: three failing `get`s, then the 4th throws `SourceHaltedError` and the fake
    fetch call count does not increase; `noteSuccess()` between failures resets the count; `noteFailure()` ×3
    (pipeline-reported bad pages) also halts. A 404 resolves `{ok:false,status:404}` and does **not** count.
  - `fetches robots.txt once and refuses disallowed paths`: robots body
    `Disallow: /amcas/account/\nDisallow: /_internal/`; `get('/amcas/account/x')` resolves `{ok:false,status:0}` with no
    second fetch of that path; robots is fetched once per host across sessions; an unreachable robots.txt is treated as
    allowed.
  - `etag: sends If-None-Match and maps 304 to {ok:true, notModified:true}`.

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run features/medschools/scrape/http.test.ts` → FAIL.

- [ ] **Step 3: Implement `createPoliteHost`.** Reuse `isPathAllowed` from `@/lib/rmhladder/adapters/robots`. Serialize
      with a promise chain (`tail = tail.then(run)`), waiting `max(0, lastAt + spacing - now())` before each request.
      Failure = network error, 5xx, or 429 after retries; 404 and robots refusals are not failures.

- [ ] **Step 4: Run** — same command → PASS. Then `pnpm exec tsx scripts/medschools/capture-cycletrack.ts --help` still
      parses (smoke).

- [ ] **Step 5: Commit** —
      `git add features/medschools scripts/medschools && git commit -m "feat(medschools): polite per-host HTTP gate with backoff and 3-strike halt"`

---

### Task 5: CycleTrack adapter (parsers, URLs, adapter boundary)

**Files:**

- Create: `features/medschools/scrape/adapters/cycletrack/{parse-school,parse-first,parse-sitemap,urls,index}.ts`
- Create (only if Task 1 finding (d) is USE): `…/cycletrack/parse-stats.ts`
- Test: `…/cycletrack/{parse-school,parse-first,parse-sitemap,urls}.test.ts`

**Interfaces:**

- Consumes: `NormalizedCount`, `normalizeSchoolKey`, `cycleYearFromLabel` (Task 3); fixtures (Task 1).
- Produces:

  ```ts
  export class UnexpectedPageError extends Error {}
  export interface ParsedTable {
    program: MedProgram;
    cycleYear: number;
    counts: NormalizedCount[];
  } // counts only where n > 0
  export interface ParsedSchoolPage {
    sourceStamp: string | null;
    tables: ParsedTable[];
    counts: NormalizedCount[]; /* flattened */
  }
  export function parseSchoolPage(html: string, schoolKey: string): ParsedSchoolPage;

  export interface FirstDates {
    secondaryOn: string | null;
    interviewOn: string | null;
    acceptanceOn: string | null;
  }
  export interface FirstRow {
    key: string;
    displayName: string;
    degree: 'MD' | 'DO';
    reg: FirstDates;
    phd: FirstDates;
  }
  export function parseFirstTable(html: string): { cycleYear: number; rows: FirstRow[] };

  export function parseSitemap(xml: string): { schoolKeys: string[]; historicalKeys: string[] };
  export function schoolUrl(key: string, view?: 'historical'): string; // path form, per Task 1 finding (b)
  ```

  `index.ts` re-exports these; **nothing else in the repo imports the parsers' internals** and the raw page type never
  leaves `parse-school.ts` (only `ParsedSchoolPage` of `NormalizedCount`s does).

- [ ] **Step 1: Write the failing tests**
  - `parse-school.test.ts` (fixtures `yale.html`, `alabama-com.html`, `atsu-arizona.html`, `toronto.html`):
    - `yale: reads the freshness stamp`: `sourceStamp === '2026-11-20T02:16:05+00:00'`.
    - `yale: parses MD current and previous cycle tables`: `tables` contains `{program:'REG', cycleYear:2027}` and
      `{program:'REG', cycleYear:2026}`; the 2026 table includes the row
      `2026-02-25 → REJECTION 131, WAITLIST 14, ACCEPTANCE 20` as three `NormalizedCount`s with `source:'CYCLETRACK'`,
      `contributors:null`; **no count has `count === 0`**; every `date` matches `/^\d{4}-\d{2}-\d{2}$/`.
    - `yale: parses the MD-PhD tables as PHD`.
    - `cycle year comes from the caption, not the date`: a December 2026 row inside the 2026-2027 table has
      `cycleYear: 2027`; January 2027 too.
    - `DO page parses` (`atsu-arizona.html`) — same assertions; `schoolKey` is passed through unchanged.
    - **`page with stamp and no tables returns empty`** (synthetic: `yale.html` with every `<details>` section removed)
      → `tables: []`, `counts: []`, no throw.
    - **`challenge page throws UnexpectedPageError`**: inputs `'<html><title>Just a moment...</title></html>'`, `''`,
      and `yale.html` with the stamp and all tables removed.
    - `malformed cell throws`: a daily table with `<td>x</td>` or a negative count; header whose first column is not
      `Date` or lacks one of the five event names.
  - `parse-first.test.ts` (`first.html`): `cycleYear === 2027`; a row for key `A.T. Still - Arizona` has `degree:'DO'`,
    `reg.secondaryOn:'2026-05-22'`, `reg.interviewOn:'2026-07-31'`, `reg.acceptanceOn:'2026-08-25'`,
    `phd.secondaryOn:null` ("Not reported"); degrees are only `MD`/`DO`; counts: 182 MD and 56 DO (the grep counts of
    the fixture's `>MD<`/`>DO<` cells, Canadian rows included); `Toronto` is present (filtering is the registry's job).
  - `parse-sitemap.test.ts`: `schoolKeys.length === 238`, `historicalKeys.length === 185`; contains `'Texas A&M'`
    (unescaped, decoded) and `'Massachussetts'`; no key contains `%` or `&amp;`; no key ends with `?view=historical`.
  - `urls.test.ts`: `schoolUrl('Yale') === 'https://cycletrack.org/explorer/school/Yale'`;
    `schoolUrl('Arizona - Phoenix')` encodes spaces as `%20`; `schoolUrl('Yale','historical')` ends `?view=historical`;
    `schoolUrl('Texas A&M')` is the spelling Task 1 finding (b) proved works; `normalizeSchoolKey(sitemapKey)` →
    `schoolUrl` → path matches the sitemap's own spelling for all 238 keys.
  - Adapter-boundary type test:
    `expectTypeOf<ReturnType<typeof parseSchoolPage>['counts'][number]>().toEqualTypeOf<NormalizedCount>()`.

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run features/medschools/scrape/adapters/cycletrack` → FAIL.

- [ ] **Step 3: Implement `parseSchoolPage(html, schoolKey)`** with `node-html-parser`. The non-obvious part is table
      location and validation:

  ```ts
  const stamp = root.querySelector('time[data-update-full]')?.getAttribute('datetime') ?? null;
  for (const [program, cls] of [
    ['REG', 'md_info'],
    ['PHD', 'phd_info'],
  ] as const) {
    for (const table of root.querySelectorAll(`details.${cls} table`)) {
      const m = /daily milestone observations, (\d{4}-\d{4})/i.exec(table.querySelector('caption')?.text ?? '');
      if (!m) continue; // the per-status totals tables have a different caption
      const cycleYear = cycleYearFromLabel(m[1]);
      // header: th[scope=col] texts; first must be 'Date'; the other five must map (case-insensitively)
      // to SECONDARY..ACCEPTANCE, in any order; otherwise throw UnexpectedPageError
      // rows: tbody tr -> th[scope=row] = ISO date, td[] = non-negative integers (throw on anything else)
      // emit one NormalizedCount per cell with n > 0
    }
  }
  if (stamp === null && tables.length === 0) throw new UnexpectedPageError('no stamp and no tables');
  ```

  If Task 1 finding (e) shows DO pages use different class names, use those. `parseFirstTable`: select the table with
  `aria-describedby="firsts-note"`; school key from the row link's `href`
  (`normalizeSchoolKey(decodeURIComponent(path tail))`); `MM/DD/YYYY` → ISO, `Not reported` → `null`; `cycleYear` from
  `/for the (\d{4}) entry cycle/`. `parseSitemap`: regex over `<loc>…/explorer/school/(…)</loc>` (the saved file is one
  line), split off `?view=historical`, `normalizeSchoolKey`, de-duplicate preserving order. If `parse-stats.ts` is in
  scope, add `parseStatsJson(json: unknown): {gpaMedian…interviewToAcceptancePct}` validated with zod against the shape
  recorded in Task 1, returning nulls (not throwing) for absent fields.

- [ ] **Step 4: Run** — same command → PASS.

- [ ] **Step 5: Commit** —
      `git add features/medschools && git commit -m "feat(medschools): CycleTrack parsers for school pages, first-dates table and sitemap"`

---

### Task 6: Registry builder, reviewed seed data, seed loader

**Files:**

- Create: `features/medschools/scrape/registry.ts`, `scripts/medschools/build-registry.ts`
- Create: `data/medschools/schools.json`, `data/medschools/cycles.json`, `data/medschools/overrides.json`
- Test: `features/medschools/scrape/registry.test.ts`, `features/medschools/scrape/registry.data.test.ts`

**Interfaces:**

- Consumes: `parseSitemap`, `parseFirstTable` (Task 5), `isCanadianLocation`, `slugify`, `defaultDayZero` (Task 3),
  `MedPrisma` (declared in Task 7; for this task declare the minimal `SeedPrisma` locally in `registry.ts`).
- Produces:

  ```ts
  export interface RegistrySchool {
    slug: string;
    name: string;
    shortName: string;
    degree: 'MD' | 'DO';
    city: string;
    state: string;
    country: 'US';
    website: string | null;
    aliases: Array<{ source: 'CYCLETRACK'; sourceKey: string }>;
  }
  export interface RegistryFile {
    generatedAt: string;
    schools: RegistrySchool[];
  }
  export function parsePageTitle(
    html: string,
  ): { name: string; degree: 'MD' | 'DO' | null; city: string; state: string } | null; // "Yale School of Medicine MD Admissions Data (New Haven, CT) | CycleTrack"
  export function buildRegistry(input: {
    schoolKeys: string[];
    first: FirstRow[];
    titles: Record<string, string /*html*/>;
    overrides: Record<string, Partial<RegistrySchool>>;
  }): {
    schools: RegistrySchool[];
    excluded: Array<{ key: string; reason: 'canadian' | 'no-first-row' | 'no-title' }>;
    review: string[];
  };
  export interface CycleSeed {
    cycleYear: number;
    amcasOpensOn: string | null;
    amcasSubmitOn: string | null;
    aacomasOpensOn: string | null;
    dayZeroOn: string;
    dateEstimated: boolean;
  }
  export function seedRegistryIfEmpty(
    prisma: SeedPrisma,
    file: RegistryFile,
  ): Promise<{ schools: number; aliases: number }>; // no-op when MedSchool count > 0
  export function seedCycles(prisma: SeedPrisma, cycles: CycleSeed[]): Promise<number>; // upsert by cycleYear, idempotent
  ```

  `review` lists keys the builder could not settle (degree disagreement between `/explorer/first` Type and the title, or
  missing location); a human fixes them through `overrides.json`
  (`{ "<sitemap key>": { shortName?, degree?, city?, state?, name? } }`).

- [ ] **Step 1: Write the failing tests**
  - `registry.test.ts`: `parsePageTitle` on the `yale.html` title →
    `{name:'Yale School of Medicine', degree:'MD', city:'New Haven', state:'CT'}`; on `toronto.html` → `state:'ON'`.
    `buildRegistry` with a 4-key synthetic input: Canadian key lands in `excluded` with reason `canadian`; a key with no
    `/explorer/first` row is excluded `no-first-row`; `Massachussetts` keeps its alias key verbatim while an override
    sets `shortName:'Massachusetts'`; `Texas A&M` alias key is `Texas A&M`; two schools producing the same slug get
    distinct slugs (state suffix); degree conflict goes to `review`, not silently resolved. `seedRegistryIfEmpty` with a
    fake prisma: first call returns `{schools: N, aliases: N}`, second call returns `{schools: 0, aliases: 0}`
    (idempotent); never overwrites an admin-edited school. `seedCycles`: for
    `{cycleYear:2027, dayZeroOn:'2026-06-01', dateEstimated:true}` the row is written with `dayZeroOn` as a date-only
    value; two calls leave one row per cycle.
  - `registry.data.test.ts` (the committed, hand-reviewed files): every school `degree ∈ {MD,DO}`, `country === 'US'`,
    `state` matches `/^[A-Z]{2}$/` and is not a Canadian province code; slugs unique; every `(source, sourceKey)`
    unique; contains the alias keys `Yale`, `Texas A&M`, `Massachussetts`; **no school has key `Toronto`/`Alberta`**;
    `180 <= schools.length <= 238`; `cycles.json` covers 2025, 2026, 2027 and each `dateEstimated:true` entry has
    `dayZeroOn === defaultDayZero(cycleYear)`.

- [ ] **Step 2: Run to verify failure** —
      `pnpm exec vitest run features/medschools/scrape/registry.test.ts features/medschools/scrape/registry.data.test.ts`
      → FAIL.

- [ ] **Step 3: Implement `registry.ts`** (pure functions + the two seed functions; seed uses `upsert` by `slug` then
      alias `upsert` by `(source, sourceKey)`).

- [ ] **Step 4: Implement `scripts/medschools/build-registry.ts`** (thin): fetches the live sitemap and
      `/explorer/first`, then the `<title>` of each non-Canadian school page through
      `createPoliteHost(SOURCES.CYCLETRACK)` with the **backfill spacing** (≈4–5 minutes for 238 pages; skip the
      per-page fetch entirely if Task 1 finding (a) says `/explorer` already lists locations), reads
      `data/medschools/overrides.json`, writes `data/medschools/schools.json` (sorted by slug, 2-space JSON) and prints
      `excluded` and `review`. Exits 2 while `review` is non-empty. Run once:
      `pnpm exec tsx scripts/medschools/build-registry.ts`.

- [ ] **Step 5: Review by hand.** Resolve every `review` entry through `overrides.json`, re-run until it exits 0, then
      skim `schools.json` for MD/DO plausibility (about 155 MD + 40 DO US schools; spot-check Osteopathic names, Puerto
      Rico entries, newly accredited schools). Confirm AMCAS/AACOMAS dates for cycles 2025–2027 from the published
      AMCAS/AACOMAS calendars into `cycles.json`; where not confirmable, set `dateEstimated:true`, `dayZeroOn` = June 1
      of the application year, other dates `null`. Admit/SDN aliases are **not** seeded in phase 1 (phase 2 cross-checks
      them against Admit's school list); the registry file format already allows more alias sources.

- [ ] **Step 6: Run** — same test command → PASS.

- [ ] **Step 7: Commit** —
      `git add data/medschools features/medschools scripts/medschools && git commit -m "feat(medschools): reviewed US MD/DO registry with CycleTrack aliases and cycle seeds"`

---

### Task 7: CycleTrack ingest pipeline, fake Prisma, anonymization boundary test

**Files:**

- Create: `features/medschools/scrape/types.ts`, `scrape/test-support.ts`, `scrape/ingest-page.ts`,
  `scrape/run-cycletrack.ts`
- Test: `scrape/ingest-page.test.ts`, `scrape/run-cycletrack.test.ts`, `scrape/anonymization-boundary.test.ts`

**Interfaces:**

- Consumes: `PoliteHost`/`PoliteClient`/`SourceHaltedError` (Task 4), parsers + `UnexpectedPageError` + `schoolUrl`
  (Task 5), `diffCounts`, `normalizeSchoolKey` (Task 3), `seedRegistryIfEmpty`/`seedCycles` shapes (Task 6).
- Produces:
  - `types.ts`: `MedPrisma` — structural interface narrowing the generated client to the calls the pipelines make:
    `medSchool.{count,findMany}`, `medSchoolAlias.findMany({where:{source}, include? })`, `medSchoolAliasMiss.upsert`,
    `medCycleCount.{findMany,createMany,update,deleteMany}`, `medSchoolStats.upsert`,
    `medSourceRun.{create,update,findFirst}`; plus
    `Logger = { info(l:string):void; warn(l:string):void; error(l:string):void }`.
  - `test-support.ts`: `createFakePrisma(): { prisma: MedPrisma; writes: unknown[]; tables: Record<string, unknown[]> }`
    (every create/update/upsert/delete argument is appended to `writes`; the fake enforces the two `@@unique` keys),
    `loadFixture(name: string): string`, `assertNoLeak(writes: unknown[], needles: string[]): void` (throws naming the
    needle if `JSON.stringify(writes)` contains it). Phase 2 adapters reuse all three.
  - `ingest-page.ts`:
    `ingestSchoolPage(prisma: MedPrisma, schoolId: string, page: ParsedSchoolPage): Promise<{ created: number; updated: number; deleted: number }>`.
    For each `ParsedTable` present on the page it loads the existing `CYCLETRACK` rows for
    `(schoolId, program, cycleYear)`, runs `diffCounts`, then `createMany` / per-row `update` / `deleteMany`.
    **Programs/cycles with no table on the page are never touched.** Dates are written as
    `new Date(\`${date}T00:00:00.000Z\`)`for`@db.Date`.
  - `run-cycletrack.ts`:
    ```ts
    export interface CycletrackDeps {
      prisma: MedPrisma;
      host: PoliteHost;
      shouldStop(): boolean;
      log: Logger;
      now?: () => Date;
    }
    export interface RunSummary {
      runId: string;
      status: 'OK' | 'PARTIAL' | 'FAILED';
      schools: number;
      skippedUnchanged: boolean;
      created: number;
      updated: number;
      deleted: number;
      misses: number;
      requests: number;
      durationMs: number;
    }
    export function runCycletrack(
      deps: CycletrackDeps,
      opts: { trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP' },
    ): Promise<RunSummary>;
    ```
    Algorithm: create `MedSourceRun {source:'CYCLETRACK', job:'cycletrack', status:'RUNNING'}`; read `completedStamp`
    from the newest `OK` run's `stats`; list active schools with their CYCLETRACK alias key (ordered by alias key); open
    `host.session()`; fetch the first school page and **if its `sourceStamp` equals `completedStamp`, finish `OK` with
    `skippedUnchanged:true` after that single request**; otherwise fetch `/explorer/first` once, upsert `MedSchoolStats`
    first-dates for matched schools (cycle = the table's `cycleYear`, programs `REG`/`PHD`), record each unmatched row
    in `MedSchoolAliasMiss` (increment `seenCount`, bump `lastSeenAt`; never create a school), then walk the schools
    sequentially: `shouldStop()` → `PARTIAL`; `{ok:false}` page → `noteFailure` (fetch-level failures are already
    counted); `UnexpectedPageError` → `client.noteFailure('unexpected page')` and continue; `SourceHaltedError` →
    `PARTIAL` with `error` set. On a full walk, store `stats.completedStamp` (the first page's stamp). The run never
    throws; `MedSourceRun.stats` holds counters only (no bodies).

- [ ] **Step 1: Write the failing tests**
  - `ingest-page.test.ts`: `first ingest of yale.html creates counts for both programs and both cycles`;
    `second identical ingest performs zero writes` (assert `writes.length` unchanged);
    `a count lowered upstream is overwritten, not added` (mutate one parsed count 20→18);
    `a count that disappears from a present table is deleted`;
    **`does not delete counts for a program/cycle absent from the page`** (seed rows for `PHD 2026`, ingest a page whose
    PHD tables are absent, rows still present); `date round-trips without timezone shift` (stored value
    `.toISOString().slice(0,10)` equals the parsed date for `2026-03-08`, a US DST-change day, and `2026-12-31`);
    uniqueness key `(school, program, cycle, date, type, source)` is never violated.
  - `run-cycletrack.test.ts` (fake host serving fixtures keyed by path; fake prisma seeded with 3 schools from the
    fixtures: Yale, Alabama COM, A.T. Still - Arizona, plus a `/explorer/first` that also contains `Toronto`):
    `walks schools sequentially and records an OK run`;
    `a second run with an unchanged stamp makes exactly one request and records skippedUnchanged`;
    `stores first-dates in MedSchoolStats`; `Toronto lands in MedSchoolAliasMiss and no MedSchool is created`;
    `stops with PARTIAL when shouldStop turns true mid-walk and does not store completedStamp`;
    **`three unexpected pages halt the run`** (host returns the challenge HTML 3×: status `PARTIAL`, the 4th school is
    never requested, no counts written, no throw); `a failing /explorer/first does not abort the walk` (counts still
    ingested, error noted in stats).
  - `anonymization-boundary.test.ts`: build a hostile copy of `yale.html` by injecting `drsmith42`, `jane_doe_md`,
    `https://cdn.example/avatars/jd.png`, `user_id=9931` into an HTML comment, a `data-user` attribute, a
    `<td title="…">`, and a JSON-LD block. Run `runCycletrack` against it with the fake prisma.
    `assertNoLeak(writes, [all four strings, 'csrf', '<html'])` passes; the keys of every object written to
    `medCycleCount` are exactly `schoolId, program, cycleYear, date, eventType, source, count, contributors`;
    `MedSourceRun.stats` contains no string longer than 200 characters (no page bodies); and a negative control proves
    the guard works (`expect(() => assertNoLeak([{x:'drsmith42'}], ['drsmith42'])).toThrow()`).

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run features/medschools/scrape` → FAIL.

- [ ] **Step 3: Implement** `types.ts`, `test-support.ts`, `ingest-page.ts`, `run-cycletrack.ts` per the Interfaces
      block. Counters and status mapping: `OK` = full walk or unchanged-skip; `PARTIAL` = stopped, halted, or any school
      failed; `FAILED` = nothing ingested and the first request failed.

- [ ] **Step 4: Run** — same command → PASS.

- [ ] **Step 5: Commit** —
      `git add features/medschools && git commit -m "feat(medschools): hourly CycleTrack ingest with stamp short-circuit and boundary tests"`

---

### Task 8: CycleTrack historical backfill (resumable)

**Files:**

- Create: `features/medschools/scrape/run-backfill.ts`
- Create (only if Task 1 finding (c) says the historical view differs): `…/cycletrack/parse-historical.ts` + test
- Test: `features/medschools/scrape/run-backfill.test.ts`

**Interfaces:**

- Consumes: `ingestSchoolPage`, `MedPrisma`, `Logger` (Task 7), `schoolUrl(key,'historical')`, `parseSchoolPage` (Task
  5), `PoliteHost` (Task 4; sessions use `spacingMs: SOURCES.CYCLETRACK.backfillSpacingMs`).
- Produces:

  ```ts
  export type BackfillStage = 'cycletrack-historical' | 'mdapplicants' | 'done';
  export interface BackfillCursor {
    stage: BackfillStage;
    index: number;
  } // lives in MedSourceRun.stats.cursor
  export interface BackfillDeps {
    prisma: MedPrisma;
    cycletrack: PoliteHost;
    mdapplicants?: PoliteHost;
    shouldStop(): boolean;
    log: Logger;
  }
  export function runBackfill(
    deps: BackfillDeps,
    opts: { trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP' },
  ): Promise<RunSummary & { cursor: BackfillCursor }>;
  export function needsBackfill(prisma: MedPrisma): Promise<boolean>; // true when no CYCLETRACK MedCycleCount rows exist
  ```

  Resume rule: load the newest `MedSourceRun` with `job:'backfill'`. A `RUNNING` row at start is a crashed predecessor
  (the queue is `exclusive`): mark it `FAILED` with `error:'interrupted'` and continue from its cursor. A
  `PARTIAL`/`FAILED` row resumes from its cursor. An `OK` row whose cursor is `done` makes this run a recorded no-op (so
  the yearly safety-net cron costs nothing). The cursor is written to `stats` after every school, so a kill loses at
  most one page. Failed/404 schools are skipped (404 is "no historical view", not a failure) and listed in
  `stats.skipped`.

- [ ] **Step 1: Write the failing tests** (fake host, fake prisma seeded with 3 schools; `yale-historical.html` served
      for Yale, 404 for the others):
  - `ingests the historical view for schools that have one and skips 404s without counting a failure`.
  - `spaces requests by the backfill spacing`: the host session was opened with `spacingMs: 2000`.
  - **`resumes from the cursor after an interrupted run`**: first run with `shouldStop` true after 1 school → `PARTIAL`,
    `cursor.index === 1`; second run requests only schools 2..n (assert the request log) and finishes `done`.
  - `a stale RUNNING predecessor is marked FAILED(interrupted) and resumed`.
  - `a done backfill is a no-op`: zero requests, run recorded `OK`.
  - `needsBackfill`: true on empty counts, false once any CYCLETRACK count exists.
  - `three consecutive failures stop the stage and leave the cursor on the failing school`.
  - Re-running over already ingested data writes nothing (idempotent via `diffCounts`).

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run features/medschools/scrape/run-backfill.test.ts` → FAIL.

- [ ] **Step 3: Implement `runBackfill`.** Stage `cycletrack-historical` walks the active schools' CYCLETRACK aliases in
      key order; stage `mdapplicants` is a hook the Task 9 module fills (until then it is skipped when
      `deps.mdapplicants` is undefined, advancing the cursor to `done`). If Task 1 finding (c) is "different markup",
      add `parseHistoricalPage(html, schoolKey): ParsedSchoolPage` (same output type, its own fixture test against
      `yale-historical.html`) and call it instead of `parseSchoolPage`.

- [ ] **Step 4: Run** — same command → PASS.

- [ ] **Step 5: Commit** —
      `git add features/medschools && git commit -m "feat(medschools): resumable CycleTrack historical backfill"`

---

### Task 9: MDApplicants archive backfill (gated by Task 1 finding (f))

**Gate:** if Task 1 finding (f) is `SKIP` (per-school archive pages expose no usable per-year counts), do only Step 5
(record the deferral in the commit message and in `features/medschools/scrape/sources.ts` as a comment) and stop; the
archive moves to a later plan. Otherwise:

**Files:**

- Create: `features/medschools/scrape/adapters/mdapplicants/{parse-index,parse-school,index}.ts` (+ fixtures from Task
  1: `mdapplicants-index.html`, `mdapplicants-school.html`)
- Modify: `features/medschools/scrape/sources.ts` (add `SOURCES.MDAPPLICANTS`, same politeness values, origin per the
  fixture), `scrape/run-backfill.ts` (the `mdapplicants` stage)
- Test: `…/mdapplicants/parse-index.test.ts`, `parse-school.test.ts`, extend `run-backfill.test.ts`

**Interfaces:**

- Consumes: `NormalizedCount` (`source:'MDAPPLICANTS'`, `program:'REG'`, `contributors:` the per-year report count where
  the page gives it, else `null`), `normalizeSchoolKey`, `MedPrisma`.
- Produces: `parseArchiveIndex(html: string): Array<{ key: string; url: string }>` (186 schools expected);
  `parseArchiveSchool(html: string, schoolKey: string): NormalizedCount[]`. MDApplicants pages are per-applicant
  timelines that carry usernames: the adapter aggregates them to **daily** counts per (school, cycle, event type) and
  drops every person field at the boundary (the Task 7 leak test runs on these fixtures too). If the finding says the
  pages carry no event dates (only yearly totals), **store nothing in `MedCycleCount`** — a yearly total on a
  placeholder date would corrupt the daily curves §10 fits — and record the gap in the FINDINGS block for phase 5
  instead. School matching: exact `normalizeSchoolKey` match against `MedSchool.name`/`shortName`/CYCLETRACK
  `sourceKey`, otherwise `MedSchoolAliasMiss` (`source:'MDAPPLICANTS'`), never a guess.

- [ ] **Step 1: Write the failing tests** from the fixtures: index yields 186 entries with unique keys; the school page
      yields one count per (year, eventType) with `source:'MDAPPLICANTS'`; years 1998–2024 only; `cycleYear` convention
      matches Task 3 (entry year); no username/author text in the output (reuse `assertNoLeak` with strings taken from
      the fixture's comment/author markup); an unmatched school name is recorded as a miss; backfill stage resumes by
      cursor like Task 8.
- [ ] **Step 2: Run to verify failure** —
      `pnpm exec vitest run features/medschools/scrape/adapters/mdapplicants features/medschools/scrape/run-backfill.test.ts`
      → FAIL.
- [ ] **Step 3: Implement** the two parsers and the `mdapplicants` stage (host session at `backfillSpacingMs`).
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** —
      `git add features/medschools && git commit -m "feat(medschools): MDApplicants archive backfill stage"` (or the
      deferral message).

---

### Task 10: `medschools-worker` process and deploy wiring

**Files:**

- Create: `server/medschools-worker/index.ts`, `server/medschools-worker/wiring.test.ts`
- Modify: `package.json` (`dev` list; new `medschools-worker:dev` after `homes-worker:dev`, line ~34; `build` esbuild
  entry list, line ~27; `start` list, line ~28), `Dockerfile` (esbuild list ~127 and `test -f` ~139; also the comment
  ~117), `docker-compose.yml` (new service after `homes-worker`, ~549; connection-budget comment ~246), `deploy.sh`
  (`WORKER_SERVICES`, line ~1256, and the comment ~1413), `scripts/db-connection-budget.mjs` (`FIXED`, ~line 50 comment
  and constant), `.env.example` (after the homes block, ~754), `server/CLAUDE.md` (service table ~94 and a
  `medschools-worker/` bullet next to `homes-worker/` ~2189), `CLAUDE.md` (repository map `server/` row),
  `docs/architecture.md` (ASCII box ~57, mermaid node ~620 with `MED --> PG` next to `HOM --> PG` ~669, and every other
  `homes-worker` mention ~1375), `docs/_generated/facts.json` (via `pnpm facts:generate`).

**Interfaces:**

- Consumes: `runCycletrack`, `runBackfill`, `needsBackfill` (Tasks 7–8), `createPoliteHost`, `SOURCES` (Tasks 1, 4),
  `seedRegistryIfEmpty`/`seedCycles` (Task 6), `startScheduledConsumer`/`ScheduledConsumer`
  (`lib/jobs/scheduled-consumer.server.ts`), `installProcessGuards`.
- Produces: process `dist-server/server/medschools-worker/index.cjs`. Constants: queues `medschools.cycletrack` (cron
  `process.env.MEDSCHOOLS_CYCLETRACK_CRON?.trim() || '20 * * * *'`, `expireInSeconds` 2 h, `retryLimit` 0) and
  `medschools.backfill` (cron `'0 0 1 1 *'`, a yearly no-op safety net because a cron is mandatory and a finished
  backfill records an `OK` no-op; `expireInSeconds` 6 h; `retryLimit` 0). Env semantics:
  `MEDSCHOOLS_CYCLETRACK_ENABLED !== 'false'`; `MEDSCHOOLS_DEDUPE_SECRET` is read only when a later phase needs it,
  **but the worker logs a warning at start if it is unset or shorter than 16 chars** (phase 2 adapters depend on it;
  phase 1 does not fail); `MEDSCHOOLS_SHUTDOWN_DEADLINE_MS` default 8000.

- [ ] **Step 1: Write the failing wiring test** (`server/medschools-worker/wiring.test.ts`) reading repo files as text:
  - `package.json`: `scripts['medschools-worker:dev']` contains `server/medschools-worker/index.ts` and
    `features/medschools`; `scripts.dev`, `scripts.build` and `scripts.start` each contain `medschools-worker`.
  - `Dockerfile`: contains `server/medschools-worker/index.ts` in the esbuild list and
    `test -f dist-server/server/medschools-worker/index.cjs`.
  - `docker-compose.yml`: parse with the repo's yaml dependency (or regex on the service block): service
    `medschools-worker` exists with `mem_limit: 512m`, `cpus: 0.5`, an environment entry `DATABASE_POOL_SIZE=3`, and
    `command` `['node', 'dist-server/server/medschools-worker/index.cjs']`.
  - `deploy.sh`: the `WORKER_SERVICES=` line contains `medschools-worker`.
  - `scripts/db-connection-budget.mjs` mentions `medschools-worker`; `.env.example` contains each of the four
    `MEDSCHOOLS_*` names.
  - `index.ts` (source text): contains `startScheduledConsumer`, both queue names, `'20 * * * *'`, and does **not**
    contain `setInterval(` or `node-cron`.

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run server/medschools-worker/wiring.test.ts` → FAIL.

- [ ] **Step 3: Implement `server/medschools-worker/index.ts`** as a copy of `server/homes-worker/index.ts` with these
      differences: own `PrismaClient` (`new PrismaPg({ connectionString, max: 3 })`); tag `medschools-worker`; one
      shared `createPoliteHost(SOURCES.CYCLETRACK)` for **both** jobs (this is what makes cycletrack and backfill
      mutually exclusive on the host); `inFlight: Set<Promise<void>>` instead of `running` flags, plus per-job
      re-entrancy guards; `shouldStop: () => stopping`; bootstrap = `seedCycles` + `seedRegistryIfEmpty` (both
      statically `import`ed from `data/medschools/*.json`, which esbuild inlines, so the runtime image needs no data
      lookup) then, if `await needsBackfill(prisma)`, `runNow()` the cycletrack consumer and then the backfill consumer;
      shutdown = `pause()` both consumers, then
      `await Promise.race([Promise.allSettled([...inFlight]), new Promise(r => setTimeout(r, SHUTDOWN_DEADLINE_MS))])`,
      then `stop()` once (the boss is shared) and `$disconnect()`.

- [ ] **Step 4: Apply every wiring edit** in the Files list. Compose block mirrors `homes-worker` (`<<: *common`,
      `container_name: ${COMPOSE_PROJECT_NAME:-rmhstudios}-medschools-worker`, `mem_limit: 512m`,
      `mem_reservation: 128m`, `cpus: 0.5`, `cpu_shares: 256`, `env_file`,
      `environment: [DATABASE_POOL_SIZE=3, NODE_OPTIONS=--max-old-space-size=384]` (the repo's 75% heap rule, per the
      ladder-worker comment), the command above); update the compose connection-budget comment (`… + 3 = 173 < 197`) and
      `FIXED` in `db-connection-budget.mjs` (`+ 3`). `.env.example`: `MEDSCHOOLS_CYCLETRACK_ENABLED=true`,
      `MEDSCHOOLS_CYCLETRACK_CRON=20 * * * *`, `MEDSCHOOLS_DEDUPE_SECRET=` (comment: generate with
      `openssl rand -hex 32`; changing it orphans stored dedupe hashes), `MEDSCHOOLS_SHUTDOWN_DEADLINE_MS=8000`.

- [ ] **Step 5: Verify**

  Run each; expected result in parentheses:
  - `pnpm exec vitest run server/medschools-worker lib/__tests__/scheduler-ratchet.test.ts lib/__tests__/tsconfig-projects.test.ts lib/__tests__/feature-manifests.test.ts`
    (PASS)
  - `pnpm exec esbuild server/medschools-worker/index.ts --bundle --platform=node --target=node26 --outfile=/tmp/claude-0/-home-user-rmhstudios-com/6e7c6389-3db2-5724-b8fa-dc74390d0ab2/scratchpad/medschools-worker.cjs --format=cjs --packages=external --tsconfig=tsconfig.server.json`
    (exit 0)
  - `node scripts/db-connection-budget.mjs` (exits 0, within budget)
  - `docker compose config -q` (exit 0) if Docker is available, else the wiring test stands
  - `pnpm facts:generate && pnpm facts:check` (exit 0)
  - Smoke against a scratch Postgres with the migration applied:
    `DATABASE_URL=… pnpm exec tsx server/medschools-worker/index.ts` seeds the registry (log line `seeded N schools`),
    queues both runs, and `SIGTERM` exits 0 within `MEDSCHOOLS_SHUTDOWN_DEADLINE_MS`. Do not leave it running against
    the live CycleTrack longer than needed (it issues real requests at 1 req/s).

- [ ] **Step 6: Whole-branch gate** — `pnpm check:consistency --base main` then `pnpm test` (expected: both green; no
      new lint/type warnings).

- [ ] **Step 7: Commit** —
      `git add server package.json Dockerfile docker-compose.yml deploy.sh scripts/db-connection-budget.mjs .env.example server/CLAUDE.md CLAUDE.md docs && git commit -m "feat(medschools): medschools-worker process wired for build, compose, deploy and docs"`

---

## Self-Review (run against the spec)

- **Spec coverage (phase 1, §14):** schema + migration (T2, §7 phase-1 models, enums, uniques, `contributors Int?`);
  registry + aliases seed (T6, CycleTrack aliases incl. typos/escapes; Admit/SDN aliases deferred to phase 2, noted);
  worker skeleton and wiring (T10, every §13 item incl. `facts.json`); CycleTrack adapter + historical backfill (T5, T7,
  T8, T9 gated); anonymization tests (T2 schema test, T3 type pin, T7 boundary test); feasibility spike (T1, §8 "Phase 1
  opens with…"); politeness values (T1/T4, §8); cycle seeds with `dateEstimated` (T6, §7); bootstrap = seed then queue
  backfills (T10); `medschools.cycletrack` hourly :20 sequential (T7/T10). Not in phase 1 by design: other queues,
  models after `MedSourceRun`, UI, API, i18n, catalog.
- **Step scan:** code steps carry signatures, spec values and tests; bodies appear only for `parseSchoolPage` table
  location. The two judgement points left to the implementer are explicit and gated by Task 1 findings (historical
  markup, JSON stats, MDApplicants).
- **Type consistency:** `NormalizedCount`/`ParsedSchoolPage` (T3→T5→T7→T8→T9), `MedPrisma` (declared T7; T6 uses a local
  `SeedPrisma` subset, structurally compatible), `PoliteHost`/`PoliteClient` (T4→T7/T8/T10), `RunSummary` (T7→T8),
  `BackfillCursor` (T8), `schoolUrl` (T5→T7/T8), `diffCounts`/`CountRow` (T3→T7). `MedSource` includes `RMH` for events;
  aliases never use it.
- **Review Focus:** all five have named tests (T3, T5, T6, T7, T8).
- **Proportion:** the plan is roughly 1.3x the spec's line count, mostly interface blocks and test lists; the only code
  blocks are the table-location algorithm and type signatures.

## Facts to verify during implementation (unverified when this plan was written)

Endpoint shapes beyond `yale.html`/`alcom.html`/`first.html` (DO page markup, `?view=historical` markup, the
`summary.json`/`*_GPA`/`status_*` JSON, MDApplicants school pages), the `Texas A&M` request spelling, whether
`/explorer` lists locations, and whether CycleTrack ever sends validators are all settled by Task 1, and Tasks 5, 8, 9
branch on its findings.
