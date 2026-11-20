# RMH Med Schools — Phase 2a (Admit.org) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest Admit.org into RMH Med Schools: the 5-minute live feed (with MD vs MD-PhD derived from the applicant flag), daily interview questions/profiles and school stats, the worker wiring, and the small admin page that resolves alias misses, with the deferred phase-1 guards.

**Architecture:** One Admit adapter (`scrape/adapters/admit/`) turns GraphQL responses into anonymous normalized values; the person-linked `user_id` is held in an opaque in-memory token that can only be redeemed for the `md_phd` flag, through a per-run cache owned by the client instance. Two new jobs reuse phase 1's patterns (`MedPrisma`, `createPoliteHost` shared by both jobs, `MedSourceRun`, `startScheduledConsumer`, `guarded()`/`inFlight`). Roll-up of Admit events into `MedCycleCount` runs inline at the end of the live job.

**Tech Stack:** TypeScript strict, Prisma 7, pg-boss, zod, vitest (colocated tests, glob-discovered), TanStack Start admin route, `implement()`/`apiRoute()` registered endpoints, i18next.

**Spec:** `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md` (§14 item 2, Admit half; §4a, §6, §7, §8, §15) and `docs/superpowers/specs/2026-11-20-rmh-medschool-source-endpoints.md`. Phase 1 plan for reference: `docs/superpowers/plans/2026-11-20-rmh-medschool-phase1-foundation.md`.

## Global Constraints

- Stack of record is TanStack Start + Vite + React 19 + Nitro. **Not Next.js.** SDN, forecasts, public pages, AI, `getAllCycleResults` backfill, curriculum and feedback-stats are **out of scope** (2b and later).
- **Anonymization (spec §6):** "no identifier of a person crosses the adapter boundary." Source dedupe keys are stored only as `HMAC-SHA256(MEDSCHOOLS_DEDUPE_SECRET, source + ':' + id)`. Admit `user_id` is used only in memory, per run, to read `md_phd`; never stored, logged, hashed or put in run stats. Queries never request `user_display_name` or `user_profile_image_url`. No `medschools.prisma` column named like `user.*name|author|avatar|display`.
- **MD vs MD-PhD (spec §4a):** every count/stat carries `program` (`REG` = MD/DO, `PHD` = MD-PhD/DO-PhD); an event whose program "cannot be read" stores `program = null`, shown as "program not reported", "never assigned to MD by default and never counted in either program's curves".
- **Sources are never summed;** Admit and CycleTrack stats live in separate rows (`source` column).
- **Politeness (spec §8):** one request at a time per host, ≥1 s spacing (backfill ≥2 s), User-Agent `RMHStudiosMedSchools/1.0 (+https://rmhstudios.com/rmh-medschool)`, honour `Retry-After`/429 with exponential backoff, stop the source for the run after 3 consecutive failures, respect robots.txt. Rates live only in `features/medschools/scrape/sources.ts`.
- **Schedules (spec §8):** `medschools.admit-live` every 5 min; `medschools.interviews` daily. pg-boss only (`lib/__tests__/scheduler-ratchet.test.ts`).
- **Env:** `MEDSCHOOLS_ADMIT_ENABLED`, `MEDSCHOOLS_ADMIT_LIVE_CRON`, `MEDSCHOOLS_INTERVIEWS_CRON`; `MEDSCHOOLS_DEDUPE_SECRET` (≥16 chars) is now REQUIRED by the Admit jobs only.
- **API conventions (CLAUDE.md §3):** contract in a client-safe `*.contract.ts`, `implement()` + `apiRoute()` in `features/medschools/api/*.server.ts`, `pnpm api:routes` regenerates `lib/api/route-table.server.ts`. Never import `.server` from client code. Never create `features/medschools/server/`.
- **Design/i18n for the admin page:** Steel (`design.md`): rules not boxes (R3), one ink primary per view (R4), `t-*` type classes, `--site-*` tokens only, no new CSS; every string through `t()` in a new `medschools` namespace added to `NAMESPACES` (`lib/i18n/config.ts`), then `pnpm i18n:extract`.
- **Migrations additive** (`lib/__tests__/migrations-additive.test.ts`): `ADD VALUE`, `ADD COLUMN … DEFAULT`, `DROP INDEX`, `DROP NOT NULL`, new tables only.
- **Typecheck projects:** new files land in `tsconfig.site.json` automatically. `scripts/**` is excluded from every project: keep logic in `features/medschools/`, scripts thin.
- **Commit gate:** stage first, commit separately; `pnpm check:consistency` must pass; commit messages explain why and end with the session's attribution trailer. No `any`/`@ts-ignore`; no new warnings.

## Decisions made in this plan (owner may override)

- **D1 `md_phd` semantics.** Request `getCycleTrackProfileByUserId(userId){ md_phd }` only (timeline/GPA/MCAT are never requested, so never read). Profile object returned and `md_phd === true` → `PHD`. Profile object returned and `md_phd` is `false` or `null` → `REG`: the inventory shows `null` is how an unflagged applicant is returned, and the owner said Admit's split "comes from whether the user is marked MD/PhD". Profile `null` / user not found with no GraphQL errors → `UNREADABLE` → `program = null`. A transport failure, GraphQL `errors`, schema mismatch or halted source → `FAILED` → the event is **deferred** (not inserted; the 5-min feed overlap retries it), so an outage never permanently nulls a program. **Risk:** an MD-PhD applicant who never ticked the flag is counted as `REG` and cannot be told apart; Task 1 records the real shapes and the single `flagToProgram()` function is the only place to change.
- **D2 WITHDRAWN / HOLD.** Extend `MedEventType` with `WITHDRAWN` and `HOLD` (additive `ADD VALUE`) and store them. Mapping: INTERVIEW→INTERVIEW, ACCEPTED→ACCEPTANCE, REJECTED→REJECTION, WAITLISTED→WAITLIST, WITHDRAWN→WITHDRAWN, HOLD→HOLD. Any other status string is skipped and counted in run stats (`unknownStatus`), never mapped to the nearest type. CycleTrack and forecasts ignore the two new types.
- **D3 Roll-up inline.** `medschools.aggregate` (spec §8, 15 min) is not built in 2a: with one per-event source it would only add up to 15 min of staleness against G2's ~5 min. `rollupEventCounts(prisma, { source, touched })` is source-parametric so 2b promotes it into the aggregate job. Events with `program = null` are never rolled up.
- **D4 Alias collision rule.** `CYCLETRACK` and `ADMIT` are *single-key sources*: a school may hold at most one alias per single-key source, and a source key maps to at most one school. Reason: the CycleTrack diff is per (school, source), so two keys on one school delete each other's rows every hour; Admit stats/profile upserts per (school, source) would flap. `SDN`/`MDAPPLICANTS` may have several keys (several threads). Defence in depth: the CycleTrack walks skip a duplicate key on the same school.
- **D5 Seed stable key.** The registry seed identifies a school by its `CYCLETRACK` alias key (every registry school has exactly one), falling back to slug only when no alias exists, so an admin-edited slug is never recreated. Admit aliases attach through that same key.
- **D6 `cycleYear` from `current_status_date` (controller ruling, overrides the first draft):** the entry year depends on the event type, because a summer acceptance belongs to the class that matriculates that August, not to the next cycle. `cycleYearOf(date: Date, type: MedEventType): number`: for decision events (`ACCEPTED`, `WAITLISTED`, `REJECTED`, `WITHDRAWN`, `HOLD`) the entry year is the UTC year when the UTC month is before September, else UTC year + 1; for `INTERVIEW` the boundary is July 1; for `SECONDARY` (not in Admit's feed) the boundary is June 1, matching `defaultDayZero`. **Risk:** an early-decision acceptance dated before September 1 lands in the outgoing cycle. EDP decisions are released on October 1, so this is rare. The rule is one function to change.
- **D7 `MedSchoolStats`** gains `source` (default `CYCLETRACK`), `residence` (`GLOBAL|IN_STATE|OUT_OF_STATE`, default `GLOBAL`), Admit count/hours columns; `program` becomes nullable (Admit's stats do not say the program; `null`, not `REG`). Unique = (schoolId, program, cycleYear, source, residence); Postgres treats NULL programs as distinct, so the single-writer Admit job does find-then-write for `program = null` rows.
- **D8** `MedSchoolAliasMiss.ignored` (default false) plus an Ignore action: Admit lists schools the registry excludes (Canadian); without it they would sit in the page forever.

## Review Focus

Failure modes the spec implies but a straightforward build misses. Each is pinned by a test in the owning task.

1. **Overlapping 5-minute windows.** The newest-100 feed repeats rows every run; a re-run must write nothing and request zero profiles for stored events. → Task 5 (`second identical run`).
2. **Lookup failure ≠ unreadable flag.** A 429/GraphQL-error/outage must defer the event, not store `program = null` forever; a `null` profile stores `null`. → Task 3, Task 5.
3. **HTTP 200 with `errors` or a reshaped payload** must count as a failure (3-strike halt), never as "zero events". → Task 3.
4. **User-entered dates.** Unparseable or future-dated (> now + 1 day) `current_status_date` rows are skipped and counted; a back-dated one keeps its hash and buckets on its own UTC day. → Task 3, Task 5.
5. **Alias hazards:** admin-renamed slug re-seeded, two keys on one school, Canadian Admit slugs recurring as misses. → Tasks 4, 8.

---

## File Structure

```
scripts/medschools/capture-admit.ts          spike: ≤25 polite requests, sanitised fixtures (Task 1)
scripts/medschools/build-admit-aliases.ts    thin: fetch overview, call matcher, write JSON (Task 4)
features/medschools/scrape/sources.ts        + SOURCES.ADMIT, SourceConfig.headers (Task 1)
features/medschools/scrape/http.ts           + PoliteClient.post (Task 3)
features/medschools/scrape/adapters/admit/
  queries.ts  schemas.ts(private)  statuses.ts  types.ts  client.ts  match-schools.ts  index.ts
  __fixtures__/*.json                        sanitised captures + one hostile synthetic (Task 1)
features/medschools/engine/alias-rules.ts    planAliasMapping, SINGLE_KEY_SOURCES (Task 4)
features/medschools/engine/cycle.ts          + cycleYearOf (Task 2)
features/medschools/scrape/run-admit-live.ts  rollup-events.ts  run-admit-interviews.ts (Tasks 5, 6)
features/medschools/medschools.contract.ts   admin endpoints (Task 8)
features/medschools/api/                     3 admin endpoint modules + alias-admin.server.ts (Task 8)
features/medschools/ui/AliasMissesPanel.tsx  AdminMedSchoolsLink.tsx (Task 9)
app/routes/_site/admin/medschools.tsx        thin route (Task 9)
data/medschools/admit-aliases.json  admit-overrides.json   reviewed data (Task 4)
server/medschools-worker/index.ts            + two queues, shared ADMIT host, secret gate (Task 7)
prisma/schema/medschools.prisma + migration  (Task 2)
```

---

### Task 1: Fixture-capture spike for every Admit op used

**Files:**
- Modify: `features/medschools/scrape/sources.ts`, `features/medschools/scrape/sources.test.ts`
- Create: `features/medschools/scrape/adapters/admit/queries.ts`, `scripts/medschools/capture-admit.ts`, `features/medschools/scrape/adapters/admit/__fixtures__/*.json`, `features/medschools/scrape/adapters/admit/fixtures.test.ts`

**Interfaces:**
- Produces (`sources.ts`): `SourceConfig.headers?: Record<string,string>` (extra request headers); `SOURCES.ADMIT = { origin: 'https://api.admit.org', userAgent: MEDSCHOOLS_USER_AGENT, spacingMs: 1000, backfillSpacingMs: 2000, maxConsecutiveFailures: 3, maxRetries: 3, retryAfterCapMs: 120_000, timeoutMs: 15_000, headers: { origin: 'https://med.admit.org' } }`; `export const ADMIT_GRAPHQL_PATH = '/graphql'`; `SOURCES` type becomes `{ CYCLETRACK: SourceConfig; ADMIT: SourceConfig }`.
- Produces (`queries.ts`): `{ operationName, query, variables? }` documents, exactly the shapes the Admit web client sends (captured 2026-11-20; `$limit`/`$offset` are `Int!` on the overview, `Float!` on `getAllCycleResults`), **requesting only what the adapter needs**: `RECENT_UPDATES` (`cycle_update_id school{slug} user_id current_status current_status_date` — no display name/avatar/reactions), `PROFILE_FLAG` (`getCycleTrackProfileByUserId(userId:$userId){ md_phd }`), `INTERVIEW_SCHOOLS` (`GetMedicalInterviewSchoolsOverview`: `totalCount schools{avg_interview_difficulty interview_count total_interview_count school{slug name shorthand_name city state}}`), `INTERVIEW_OVERVIEW`, `INTERVIEW_QUESTIONS` (`id body votes`, no `user_vote`), `INTERVIEW_FEEDBACK`, `SCHOOL_STATS` (`id school{slug} application_number application_to_interview_pct interview_number interview_to_admitted_pct admitted_number mcat gpa residence_type research_hours clinical_hours non_clinical_hours`; variables `filterOwnSchools:false, filterBy, sortOrder:"ASC", sortBy:"RANK", page, pageSize`).
- Produces: fixtures (names below) and a dated **FINDINGS block** in the script header consulted by Tasks 3, 5, 6.

- [ ] **Step 1: Write the failing tests.**
  - `sources.test.ts`: `ADMIT politeness matches spec §8` → `spacingMs 1000`, `backfillSpacingMs 2000`, `maxConsecutiveFailures 3`, `userAgent === MEDSCHOOLS_USER_AGENT`, `headers.origin === 'https://med.admit.org'`; `CYCLETRACK has no extra headers`.
  - `fixtures.test.ts`: `every fixture parses as JSON`; `non-hostile fixtures contain no uuid-shaped string` (regex `/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/`) **except** `cycle_update_id` values; `only recent-updates-hostile.json contains the NEEDLES` (`'drsmith42'`, `'jane_doe_md'`, `'https://cdn.example/avatars/jd.png'`, `'user-hostile-9931'`) ; `required fixtures exist` for the list in Step 3.
- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run features/medschools/scrape/sources.test.ts features/medschools/scrape/adapters/admit/fixtures.test.ts` → FAIL (`SOURCES.ADMIT` undefined; fixtures missing).
- [ ] **Step 3: Implement the config, `queries.ts` and `capture-admit.ts`.** Sequential requests, `await sleep(1600)` between each (≥1.5 s), UA from `sources.ts`, `Origin` header, **hard cap 25 requests** (abort with a message if exceeded), refuses to overwrite fixtures without `--force`. Request plan (≤ 21): `robots.txt` (1); `recent-updates-all` (1); `recent-updates-harvard` (1, slug `harvard-medical-school`); `profile-flag-*` (up to 8: walk distinct feed `user_id`s until one returns `md_phd: true`, keeping one `true` and one `null` response; plus 1 syntactically valid, nonexistent id); `school-stats-{global,in-state,out-of-state}` (3, `pageSize: 999`, saved truncated to the first 5 rows with the real `totalRows` in FINDINGS); `interview-schools-0` (limit 100, offset 0) and `interview-schools-200` (2); `interview-overview-harvard`, `interview-questions-harvard`, `interview-feedback-harvard` (3). Sanitiser applied before every write: replace each `user_id`/`userId` with `user-001…`, `user-002…` (same real id → same placeholder), delete any key matching `/display_name|profile_image|avatar|username/i`. Then hand-write `recent-updates-hostile.json`: a feed response whose rows carry the NEEDLES as `user_display_name`, `user_profile_image_url`, `user_id`, plus a profile response `profile-flag-hostile.json` with extra `gpa: 3.987`, `mcat: 527`, `display_name: 'drsmith42'`.
- [ ] **Step 4: Run the capture once** — `pnpm exec tsx scripts/medschools/capture-admit.ts` → prints `N requests` with N ≤ 25 and the fixture list.
- [ ] **Step 5: Write the FINDINGS block** (dated header comment) answering, from the files: (a) `api.admit.org/robots.txt` and whether `POST /graphql` is allowed; (b) does a feed row carry `school.slug`; `current_status_date` format (observed `2026-11-20T04:00:05.573Z`, apparently midnight Eastern) and whether a date-only value ever occurs; (c) exact `md_phd` shapes for flagged / unflagged / unknown user (`true`, `null`, `false`, profile `null`, GraphQL `errors` and their codes) — this confirms or revises D1; (d) whether `getSchoolStats` is current-cycle or cumulative, the percent scale (0–1 or 0–100), row count and null slugs; (e) `interview_type` and `interview_format` enum values, `avg_interview_difficulty` scale; (f) question id type and whether bodies contain markup; (g) the overview's `limit` cap (≤100) and rate-limit/`Retry-After` headers seen; (h) how many overview schools are Canadian/non-registry.
- [ ] **Step 6: Run tests** — same command as Step 2 → PASS. Commit: `feat(medschools): Admit.org feasibility spike, fixtures and politeness config`.

---

### Task 2: Schema, migration, engine types, test-support

**Files:**
- Modify: `prisma/schema/medschools.prisma`, `features/medschools/engine/types.ts`, `features/medschools/engine/cycle.ts`, `features/medschools/scrape/types.ts`, `features/medschools/scrape/test-support.ts`, `features/medschools/scrape/run-cycletrack.ts` (stats upsert key), `docs/_generated/facts.json`
- Create: `prisma/migrations/20261120140000_medschools_admit/migration.sql` (confirm it sorts after the newest migration)
- Test: `features/medschools/engine/schema.test.ts`, `types.test.ts`, `cycle.test.ts`, `scrape/test-support.test.ts`, `scrape/run-cycletrack.test.ts`

**Interfaces:**
- Produces schema: enum `MedEventType` + `WITHDRAWN`, `HOLD`; enum `MedResidence { GLOBAL IN_STATE OUT_OF_STATE }`; `MedSchoolAliasMiss.ignored Boolean @default(false)`; `MedSchoolStats` + `source MedSource @default(CYCLETRACK)`, `residence MedResidence @default(GLOBAL)`, `program MedProgram?`, `applicationCount Int?`, `interviewCount Int?`, `admittedCount Int?`, `applicationToInterviewPct Float?`, `researchHours Float?`, `clinicalHours Float?`, `nonClinicalHours Float?`, `@@unique([schoolId, program, cycleYear, source, residence])` (replaces the old unique; the Prisma selector becomes `schoolId_program_cycleYear_source_residence`), `@@index([schoolId, cycleYear, source])`. New models per spec §7: `MedInterviewQuestion { id, schoolId, text, source MedSource, votes Int?, cycleYear Int?, dedupeHash String @unique, ingestedAt, updatedAt; @@index([schoolId, source]) }` and `MedInterviewProfile { id, schoolId, source, format String?, fileType String?, avgDifficulty Float?, interviewCount Int?, feedbackPositive String[], feedbackNegative String[], feedbackBefore String[], fetchedAt DateTime; @@unique([schoolId, source]) }`, both cascading from `MedSchool` (add the back-relations). `MedInterviewDate` is **not** added (Admit has no dates).
- Produces (`engine/types.ts`): `MedEventType` gains the two members; `export type MedResidence = 'GLOBAL' | 'IN_STATE' | 'OUT_OF_STATE'`. (`engine/cycle.ts`): `cycleYearOf(date: Date, type: MedEventType): number` (D6).
- Produces (`MedPrisma`): `medCycleEvent { findMany, createMany }`; `medInterviewQuestion { findMany, createMany, update, deleteMany }`; `medInterviewProfile { findFirst, upsert }`; `medSchoolStats { findFirst, create, update, upsert }`; `medSchoolAliasMiss { findMany, findFirst, update }` (+ existing `upsert`); `medSchoolAlias { create }`; `medSchool { findUnique }`.
- Produces (fake): `createFakePrisma` knows the new tables; `UNIQUE_KEYS` adds `medCycleEvent: ['dedupeHash']`, `medInterviewQuestion: ['dedupeHash']`, `medInterviewProfile: ['schoolId','source']`, `medSchoolAliasMiss: ['source','sourceKey']`; `matches` supports `{ gte, lt }` on Dates/numbers; delegates gain `findUnique`.

- [ ] **Step 1: Write the failing tests.**
  - `schema.test.ts`: `new Admit columns pass the person-like check` (existing `forbiddenColumns` stays `[]`); `MedSchoolStats unique includes source and residence` (regex on the schema text); `MedEventType has WITHDRAWN and HOLD`; `MedInterviewQuestion.dedupeHash is unique`; `no MedInterviewDate model exists`.
  - `types.test.ts`: `MedEventType accepts WITHDRAWN and HOLD` (`expectTypeOf<'HOLD'>().toExtend<MedEventType>()`).
  - `cycle.test.ts`: `cycleYearOf` — ACCEPTED `2026-07-10 → 2026`, ACCEPTED `2026-08-31T23:59:59Z → 2026`, ACCEPTED `2026-09-01 → 2027`, WAITLISTED `2026-06-15 → 2026`, INTERVIEW `2026-06-30 → 2026`, INTERVIEW `2026-07-01 → 2027`, INTERVIEW `2026-11-20 → 2027`, REJECTED `2027-01-10 → 2027`, SECONDARY `2026-06-01 → 2027`, SECONDARY `2026-05-31 → 2026`.
  - `test-support.test.ts`: `fake enforces dedupeHash uniqueness on medCycleEvent (createMany skipDuplicates skips, create throws)`; `gte/lt filters on occurredAt`.
  - `run-cycletrack.test.ts`: existing stats-upsert assertions updated to the new selector with `source: 'CYCLETRACK', residence: 'GLOBAL'`.
- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run features/medschools` → FAIL on the new assertions.
- [ ] **Step 3: Edit the schema; generate the migration** — `pnpm exec prisma migrate dev --create-only --name medschools_admit` against local Postgres (`pnpm db:push` first if the local DB is fresh), move the folder to the timestamp above, then read the SQL: expect `ALTER TYPE "MedEventType" ADD VALUE` ×2, `CREATE TYPE "MedResidence"`, `ADD COLUMN … DEFAULT`, `ALTER COLUMN "program" DROP NOT NULL`, `DROP INDEX` of the old stats unique + `CREATE UNIQUE INDEX` of the new one, two `CREATE TABLE`s. Fix anything destructive by hand.
- [ ] **Step 4: Implement types, `cycleYearOf`, `MedPrisma`, fake, and the `run-cycletrack.ts` selector;** run `pnpm exec prisma generate`, then `pnpm typecheck` and fix every exhaustive switch over `MedEventType` the compiler flags (phase-1 parsers map only the original five; do not widen them). `pnpm facts:generate`.
- [ ] **Step 5: Verify** — `pnpm exec vitest run features/medschools lib/__tests__/migrations-additive.test.ts lib/__tests__/migration-safety.test.ts` → PASS; `pnpm typecheck` → clean.
- [ ] **Step 6: Commit** — `feat(medschools): Admit schema — interview models, stats source/residence, WITHDRAWN/HOLD`.

---

### Task 3: Admit adapter and POST support in the polite host

**Files:**
- Modify: `features/medschools/scrape/http.ts`, `http.test.ts`, `test-support.ts` (`createFakeHost` POST)
- Create: `features/medschools/scrape/adapters/admit/{schemas.ts,statuses.ts,types.ts,client.ts,index.ts}`, `client.test.ts`, `statuses.test.ts`

**Interfaces:**
- Consumes: Task 1 `queries.ts`, `SOURCES.ADMIT`; `dedupeHash` (`engine/dedupe.ts`); `cycleYearOf`; `PoliteClient`.
- Produces (`http.ts`): `PoliteClient.post(path: string, body: string, opts?: { headers?: Record<string,string> }): Promise<PoliteResult>`. Shares the host serializer, spacing, robots check, retry/backoff and failure counting with `get`; sends `content-type: application/json`, `accept: application/json`, the UA, and `config.headers`. Retrying a POST is safe because every Admit operation is a read-only query (comment says so). `createFakeHost` serves POSTs by key `gqlKey(operationName, variables)` (exported from `test-support.ts`: `` `POST ${path} ${op} ${JSON.stringify(variables)}` `` with sorted keys) and records `requestedPosts: Array<{ op: string; variables: unknown }>`.
- Produces (`adapters/admit/types.ts`, public, anonymous): `type LookupToken` (opaque, frozen object; the `user_id` lives in a module-private `WeakMap`); `type ProgramFlag = 'PHD' | 'REG' | 'UNREADABLE'`; `interface FeedItem { event: NormalizedEvent; lookup: LookupToken }` (event has `source: 'ADMIT'`, `schoolKey` = Admit slug, `program: null`, `inState: null`, `dedupeHash` of `cycle_update_id`); `interface AdmitSchoolRef { slug; name; shortName; city; state; avgDifficulty: number|null; interviewCount: number; totalInterviewCount: number }`; `interface NormalizedAdmitProfile { schoolKey; format: string|null; fileType: string|null; avgDifficulty: number|null; interviewCount: number|null; positive: string[]; negative: string[]; before: string[] }`; `interface NormalizedAdmitQuestion { schoolKey; text: string; votes: number|null; dedupeHash: string }`; `interface NormalizedAdmitStats { schoolKey; residence: MedResidence; applicationCount; interviewCount; admittedCount: number|null; applicationToInterviewPct; interviewToAdmittedPct; gpaMedian; mcatMedian; researchHours; clinicalHours; nonClinicalHours: number|null }`.
- Produces (`client.ts`):
  ```ts
  export class AdmitResponseError extends Error {}   // GraphQL errors, non-JSON, zod mismatch (after noteFailure)
  export function createAdmitClient(session: PoliteClient, opts: { secret: string; now?: () => Date }): AdmitClient;
  interface AdmitClient {
    fetchFeed(slug?: string): Promise<{ items: FeedItem[]; skipped: { unknownStatus: number; badDate: number } }>; // default 'allSchools'
    programOf(token: LookupToken): Promise<ProgramFlag | 'FAILED'>;   // one request per distinct user per client; cached for the client's life
    readonly lookups: number;
    listInterviewSchools(): Promise<AdmitSchoolRef[]>;                // pages limit 100 until totalCount
    fetchInterviewProfile(slug: string): Promise<NormalizedAdmitProfile>;  // overview + feedback (2 requests)
    fetchQuestions(slug: string): Promise<NormalizedAdmitQuestion[]>;
    fetchSchoolStats(filter: MedResidence): Promise<NormalizedAdmitStats[]>; // pages pageSize 999 until a short page
  }
  export function mapStatus(raw: string): MedEventType | null;      // statuses.ts, D2
  export function flagToProgram(flag: ProgramFlag): MedProgram | null; // PHD→PHD, REG→REG, UNREADABLE→null
  ```
  The raw zod schemas in `schemas.ts` are not exported from `index.ts`. `createAdmitClient` requests at most the documents in `queries.ts`. Responses that parse are followed by `session.noteSuccess()`; a 200 with a non-empty `errors` array, invalid JSON or a zod mismatch calls `session.noteFailure(...)` and throws `AdmitResponseError`; a non-OK HTTP result (already counted by the host) also throws `AdmitResponseError`.

- [ ] **Step 1: Write the failing tests.**
  - `http.test.ts`: `post sends POST, the body, content-type, the Origin header from config and the UA`; `post and get are serialized and spaced on one host`; `post 429 with Retry-After retries the same body`; `post to a robots-disallowed path resolves { ok:false, status:0 } without fetching`; `post counts toward the 3-strike halt`.
  - `statuses.test.ts`: the six mappings of D2 (`ACCEPTED → 'ACCEPTANCE'`, `WITHDRAWN → 'WITHDRAWN'`, `HOLD → 'HOLD'`, …); `'SECONDARY' → null`; `'' → null`.
  - `client.test.ts` (fake host + Task 1 fixtures): `feed rows become NormalizedEvents with program null and a keyed hash` (`dedupeHash === dedupeHash(secret,'ADMIT',updateId)`, `source 'ADMIT'`, `schoolKey` = slug, `cycleYear === cycleYearOf(occurredAt, eventType)`); `a feed item exposes only event and lookup` (`Object.keys(item)` equals `['event','lookup']`, `JSON.stringify(item)` contains none of the NEEDLES nor any user id); `hostile feed fixture: extra person fields never surface anywhere in the returned values`; `unknown status is skipped and counted`; `unparseable and future (> now+1 day) dates are skipped and counted as badDate; a back-dated row is kept`; `programOf: true → PHD, null → REG, false → REG, profile null → UNREADABLE`; `programOf: GraphQL errors or HTTP failure → FAILED and the failure counts toward the halt`; `programOf asks once per distinct user (lookups === 1 for two tokens of one user)`; `hostile profile fixture: gpa/mcat/display_name are never read (the request document selects only md_phd)`; `200 with errors array throws AdmitResponseError and notes a failure`; `three such responses halt (SourceHaltedError on the fourth call)`; `reshaped payload (data null) is a failure, not an empty list`; `stats: pageSize 999, loops until a short page, skips rows with a null slug, keeps in-state/out-of-state counts as published`; `questions: trims, collapses whitespace, drops empty bodies, hash is dedupeHash(secret,'ADMIT','question:'+id)`; `listInterviewSchools pages 100 until totalCount`.
- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run features/medschools/scrape/http.test.ts features/medschools/scrape/adapters/admit` → FAIL.
- [ ] **Step 3: Implement `PoliteClient.post`** by folding `get` and `post` into one internal `request(method, path, body?, headers?)`; extend `createFakeHost`.
- [ ] **Step 4: Implement the adapter.** `LookupToken` creation and the `user_id` map are the only places a `user_id` exists after parsing; `programOf` caches `Map<userId, Promise<ProgramFlag | 'FAILED'>>` inside the client closure. Field-name mapping and D1 shapes follow the Task 1 FINDINGS; where FINDINGS contradicts D1, stop and report instead of improvising.
- [ ] **Step 5: Run** — same command → PASS; `pnpm typecheck`.
- [ ] **Step 6: Commit** — `feat(medschools): Admit GraphQL adapter behind the polite host, user_id kept in an opaque token`.

---

### Task 4: Alias seeding by stable key, Admit aliases, mapping rule

**Files:**
- Modify: `features/medschools/scrape/registry.ts`, `registry.test.ts`, `run-support.ts`, `run-cycletrack.ts`, `run-backfill.ts` (walk targets), their tests
- Create: `features/medschools/engine/alias-rules.ts`, `alias-rules.test.ts`, `features/medschools/scrape/adapters/admit/match-schools.ts`, `match-schools.test.ts`, `scripts/medschools/build-admit-aliases.ts`, `data/medschools/admit-aliases.json`, `data/medschools/admit-overrides.json`, `features/medschools/scrape/admit-aliases.data.test.ts`

**Interfaces:**
- Produces (`alias-rules.ts`): `export const SINGLE_KEY_SOURCES: readonly MedSource[] = ['CYCLETRACK','ADMIT']`; `planAliasMapping(input: { source: MedSource; sourceKey: string; schoolId: string; schoolAliases: Array<{ source: MedSource; sourceKey: string }>; keyOwner: { schoolId: string } | null }): { ok: true } | { ok: false; code: 'KEY_MAPPED_ELSEWHERE' | 'SCHOOL_ALREADY_HAS_KEY'; message: string }` (D4; a key already mapped to the same school is `ok`, idempotent).
- Produces (`run-support.ts`): `pickWalkTargets<T extends { schoolId: string; sourceKey: string }>(aliases: T[], activeIds: Set<string>): { targets: T[]; duplicates: string[] }` — active schools only, sorted by `sourceKey`, **first key per school wins**, the rest returned in `duplicates`. Both CycleTrack walks use it and put `duplicates` in `stats.duplicateAliases` with a `log.warn`.
- Produces (`registry.ts`): `seedRegistryIfEmpty` resolves each school as `aliasOwner(CYCLETRACK, its key) ?? idBySlug(slug) ?? create` (D5); new `seedAdmitAliases(prisma: SeedPrisma, file: AdmitAliasFile): Promise<{ created: number; unmatched: string[] }>` where `AdmitAliasFile = { generatedAt: string; aliases: Array<{ cycletrackKey: string; admitSlug: string }> }`: resolves the school by its CYCLETRACK alias, skips pairs that would violate `planAliasMapping`, converges, never moves an existing alias; `SeedPrisma` gains `medSchoolAlias.findMany`.
- Produces (`match-schools.ts`, pure): `matchAdmitSchools(input: { admit: AdmitSchoolRef[]; registry: RegistrySchool[]; overrides: Record<string, string | null> }): { matched: Array<{ cycletrackKey; admitSlug }>; review: string[]; excluded: string[] }`. Algorithm: normalise names (lowercase, `&`→`and`, strip punctuation, drop `the|of|at`); candidates = registry schools in the same state; match when exactly one candidate shares the normalised name, or the normalised Admit `shortName`/`name` equals the candidate's `shortName`/`name`; zero or several candidates → `review`; an override value `null` → `excluded`, a string → forced match to that CycleTrack key.

- [ ] **Step 1: Write the failing tests.**
  - `alias-rules.test.ts`: `second CYCLETRACK key for a school is refused (SCHOOL_ALREADY_HAS_KEY)`; `second ADMIT key refused`; `second SDN key allowed`; `key mapped to another school refused (KEY_MAPPED_ELSEWHERE)`; `same key to same school is ok`.
  - `registry.test.ts`: `a school whose slug an admin changed is not recreated (alias found by CYCLETRACK key)`; `no-alias school falls back to slug`; `seedAdmitAliases attaches by CYCLETRACK key, reports unmatched, never adds a second ADMIT alias, second call creates nothing`.
  - `run-support`/`run-cycletrack` tests: `pickWalkTargets keeps the first key per school and lists duplicates`; `two CYCLETRACK aliases on one school: only the first is fetched and stats.duplicateAliases = [second]` (and the same for the backfill).
  - `match-schools.test.ts`: exact match, two same-state candidates → review, override null → excluded, override string → matched, a Canadian slug (`state: 'ON'`) → review/excluded, never matched.
  - `admit-aliases.data.test.ts`: every `cycletrackKey` exists in `schools.json`; no duplicate `admitSlug`; no duplicate `cycletrackKey`; `aliases.length` ≥ the floor recorded after review (set to the reviewed count rounded down to the nearest 10).
- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run features/medschools` → FAIL.
- [ ] **Step 3: Implement** the rule, `pickWalkTargets` (replace the inline target building in both walks), the seed changes and the matcher.
- [ ] **Step 4: Build and review the data.** `build-admit-aliases.ts` is thin: ≤ 4 polite requests (overview pages via the adapter client over `createPoliteHost(SOURCES.ADMIT)`), reads `data/medschools/{schools,admit-overrides}.json`, prints `matched/review/excluded` counts and writes `admit-aliases.json`. Run `pnpm exec tsx scripts/medschools/build-admit-aliases.ts`; for each `review` slug decide by hand into `admit-overrides.json` (CycleTrack key, or `null` for non-registry/Canadian), rerun until `review` is empty.
- [ ] **Step 5: Run** — `pnpm exec vitest run features/medschools` → PASS; `pnpm typecheck`.
- [ ] **Step 6: Commit** — `feat(medschools): Admit aliases, stable-key registry seed and one-key-per-source rule`.

---

### Task 5: `medschools.admit-live` run (feed, program lookup, inline roll-up)

**Files:**
- Create: `features/medschools/scrape/run-admit-live.ts`, `rollup-events.ts`, `run-admit-live.test.ts`, `rollup-events.test.ts`, `admit-anonymization-boundary.test.ts`

**Interfaces:**
- Consumes: Task 3 client (`createAdmitClient`, `flagToProgram`), Task 2 `MedPrisma`, `brief` (`run-support.ts`), `diffCounts`.
- Produces:
  ```ts
  export interface AdmitLiveDeps { prisma: MedPrisma; host: PoliteHost; secret: string; shouldStop(): boolean; log: Logger; now?: () => Date; maxLookups?: number /* default 120 */ }
  export interface AdmitLiveSummary { runId: string; status: 'OK'|'PARTIAL'|'FAILED'; fetched: number; created: number; alreadyStored: number; deferred: number; programNull: number; misses: number; unknownStatus: number; badDate: number; lookups: number; rolledUp: number; requests: number; durationMs: number }
  export async function runAdmitLive(deps: AdmitLiveDeps, opts: { trigger: 'CRON'|'MANUAL'|'BOOTSTRAP' }): Promise<AdmitLiveSummary>   // never throws; job 'admit-live', source 'ADMIT'
  // rollup-events.ts
  export async function rollupEventCounts(prisma: MedPrisma, args: { source: MedSource; touched: Array<{ schoolId: string; program: MedProgram; cycleYear: number; date: string /* YYYY-MM-DD UTC */ }> }): Promise<number /* rows created+updated */>;
  ```
- Algorithm for `runAdmitLive` (not determined by the signature):
  1. `secret.length < 16` → return `FAILED` with `runId: ''`, no request, `log.error`.
  2. Close stale `RUNNING` rows for (`ADMIT`, `admit-live`) as phase 1 does; open a run; one `host.session()`; one `createAdmitClient` (its cache is the per-run cache and dies with the function).
  3. `fetchFeed()`; resolve each item's `schoolKey` through ADMIT aliases of active schools. Unknown slug: skip it, upsert one `MedSchoolAliasMiss` per slug per run (D8: not at all when that miss row is `ignored`).
  4. One `medCycleEvent.findMany({ where: { dedupeHash: { in: hashes } }, select: { dedupeHash: true } })`; stored items are `alreadyStored` and never reach a profile lookup.
  5. For each unseen item in feed order: `programOf` until `maxLookups` distinct lookups are used; `FAILED` or beyond the cap or the source halted → `deferred` (not inserted, run `PARTIAL` when anything was deferred by failure); otherwise `program = flagToProgram(flag)` (`null` counts `programNull`).
  6. `createMany({ data, skipDuplicates: true })` with exactly the keys `schoolId, cycleYear, program, eventType, occurredAt, source, dedupeHash, inState`; then `rollupEventCounts` for the touched (school, program, cycleYear, UTC date) cells of `program !== null` events only.
  7. `MedSourceRun.stats` holds the counters above and nothing else (no ids, hashes or slugs lists longer than counters).
- `rollupEventCounts`: for the touched cells, load the stored events (`findMany` by `schoolId in`, `source`, `occurredAt` `gte` the earliest touched date and `lt` the day after the latest, `program` non-null), count per (school, program, cycleYear, UTC date, eventType) in memory, read existing `MedCycleCount` rows for those exact cells, `diffCounts`, `createMany`/`update` (expect zero deletes), `contributors: null`.

- [ ] **Step 1: Write the failing tests** (fake prisma/host, Task 1 fixtures, known aliases for `harvard-medical-school` etc.).
  - `run-admit-live.test.ts`: `flagged user → PHD, unflagged → REG, unknown user → null, all stored with the keyed hash`; `one lookup per distinct user when a user posts three updates`; `second identical run: zero writes and zero profile requests` (Review Focus 1); `profile cache does not persist across runs (a new event from the same user in the next run costs one lookup)`; `transient lookup failure defers the event; the next run inserts it with the right program` (RF 2); `lookup cap defers the remainder and the run is PARTIAL`; `GraphQL errors on the feed fail the run and insert nothing` (RF 3); `source halted mid-run → PARTIAL, nothing inserted for unlooked rows`; `unknown status counted, nothing mislabeled`; `future-dated row skipped, back-dated row kept on its own UTC day` (RF 4); `unknown slug records one miss per slug per run; an ignored miss is not recorded`; `inactive school skipped`; `withdrawn and hold rows are stored as WITHDRAWN and HOLD`; `missing or short secret: FAILED, zero requests`; `run record is OK with counters only`.
  - `rollup-events.test.ts`: `counts events per UTC day and type`; `program-null events are never counted`; `re-running writes nothing`; `a new event updates the day's count instead of adding a row`; `ADMIT rows never touch CYCLETRACK rows for the same cell` (sources are not summed).
  - `admit-anonymization-boundary.test.ts`: feed the hostile fixture and hostile profile through `runAdmitLive`; `assertNoLeak(writes, [...NEEDLES, '3.987', '527'])`; `no write contains dedupeHash(secret,'ADMIT',userId) or the user id`; created event rows have exactly `CREATED_KEYS = ['cycleYear','dedupeHash','eventType','inState','occurredAt','program','schoolId','source']`; log lines (captured) and run stats contain no needle; negative control throws on a planted needle.
- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run features/medschools/scrape/run-admit-live.test.ts features/medschools/scrape/rollup-events.test.ts features/medschools/scrape/admit-anonymization-boundary.test.ts` → FAIL.
- [ ] **Step 3: Implement** per the algorithm; **Step 4: re-run** → PASS; `pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(medschools): Admit live feed job with MD/MD-PhD lookup and inline roll-up`.

---

### Task 6: `medschools.interviews` run (profiles, questions, stats)

**Files:**
- Create: `features/medschools/scrape/run-admit-interviews.ts`, `run-admit-interviews.test.ts`

**Interfaces:**
- Consumes: Task 3 client, Task 2 models, `currentCycleYear = cycleYearOf(now(), 'INTERVIEW')` (the interview season decides which cycle interview data belongs to).
- Produces: `interface AdmitInterviewsDeps` (same shape as `AdmitLiveDeps`, no `maxLookups`), `interface AdmitInterviewsSummary { runId; status; stats: number; schoolsFetched: number; schoolsSkipped: number; questionsCreated: number; questionsUpdated: number; questionsDeleted: number; misses: number; requests: number; durationMs: number }`, `async function runAdmitInterviews(deps, opts: { trigger }): Promise<AdmitInterviewsSummary>` (job `'interviews'`, source `'ADMIT'`, never throws).
- Algorithm: (1) secret guard as Task 5. (2) `fetchSchoolStats` for `GLOBAL`, `IN_STATE`, `OUT_OF_STATE`; per row with a known active school write one `MedSchoolStats` row: `source 'ADMIT'`, `program null`, `residence`, `cycleYear = currentCycleYear`, `sourceUpdatedAt = now`, the Admit count/hours/pct fields, `gpaMedian`/`mcatMedian`/`interviewToAcceptancePct` from the accepted medians and `interview_to_admitted_pct`; write by `findFirst` then `update`/`create` (D7); unknown slug → one miss per slug per run. (3) `listInterviewSchools()`; per known active school ordered by slug: **skip** when `totalInterviewCount === 0`, or when the stored `MedInterviewProfile.interviewCount` equals the listed `interviewCount` and `fetchedAt` is < 6 days old (politeness: no refetch of unchanged data); otherwise `fetchInterviewProfile` → `medInterviewProfile.upsert` by `schoolId_source`, `fetchQuestions` → create unseen hashes, update changed `votes`, and delete stored ADMIT questions of that school absent from a **successfully parsed** response (mirrors upstream moderation; a failed fetch deletes nothing). (4) A failed school is counted and skipped; halted source → `PARTIAL`; `shouldStop()` ends the walk `PARTIAL`.

- [ ] **Step 1: Write the failing tests:** `writes one stats row per school per residence with source ADMIT and program null`; `admit stats and cycletrack stats for the same school/cycle coexist as separate rows`; `second run updates the same rows (no duplicates for program null)`; `in-state and out-of-state counts are stored as published so the read-time k>=3 floor can apply`; `stats row with unknown slug is not written and records one miss`; `profile upsert stores format, fileType, avgDifficulty, interviewCount and the three feedback arrays`; `questions are stored with the keyed hash and no raw id`; `unchanged interview count within 6 days: no questions/feedback requests`; `a question dropped upstream is deleted; a failed fetch deletes nothing`; `votes change updates in place`; `school with zero interviews is skipped`; `halt mid-walk is PARTIAL and keeps what was written`; `missing secret: FAILED, zero requests`; `leak: written data contains no NEEDLES and no raw question id`.
- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run features/medschools/scrape/run-admit-interviews.test.ts` → FAIL.
- [ ] **Step 3: Implement; Step 4: run → PASS; `pnpm typecheck`.**
- [ ] **Step 5: Commit** — `feat(medschools): daily Admit interview profiles, questions and school stats`.

---

### Task 7: Worker wiring

**Files:**
- Modify: `server/medschools-worker/index.ts`, `server/medschools-worker/wiring.test.ts`, `.env.example`

**Interfaces:**
- Consumes: `runAdmitLive`, `runAdmitInterviews`, `seedAdmitAliases`, `admit-aliases.json`.
- Produces: queues `medschools.admit-live` (cron env `MEDSCHOOLS_ADMIT_LIVE_CRON`, default `*/5 * * * *`, `expireInSeconds` 20 min) and `medschools.interviews` (`MEDSCHOOLS_INTERVIEWS_CRON`, default `35 4 * * *`, `expireInSeconds` 3 h), both `retryLimit: 0`; `ADMIT_ENABLED = process.env.MEDSCHOOLS_ADMIT_ENABLED !== 'false'`; one shared `admitHost = createPoliteHost(SOURCES.ADMIT)` for both jobs; `const secretOk = () => (process.env.MEDSCHOOLS_DEDUPE_SECRET ?? '').length >= 16`.

- [ ] **Step 1: Extend `wiring.test.ts`:** `registers medschools.admit-live and medschools.interviews through startScheduledConsumer with their default crons ('*/5 * * * *', '35 4 * * *')`; `both Admit ticks are guarded() and check ADMIT_ENABLED, then the secret, before running` (source-slice assertions like the existing R12 tests; only `data.manual === true` bypasses `ADMIT_ENABLED`, never the secret); `a missing secret logs an error and the CycleTrack tick still runs` (the CycleTrack tick source contains no `secretOk`); `one admitHost serves both ticks`; `bootstrap calls seedAdmitAliases`; `shutdown pauses all four consumers`; `.env.example documents MEDSCHOOLS_ADMIT_ENABLED, MEDSCHOOLS_ADMIT_LIVE_CRON, MEDSCHOOLS_INTERVIEWS_CRON`; `no setInterval/node-cron`. Replace the phase-1 "only warns" secret text: startup logs an **error** (not exit) when the secret is unset/short, saying the Admit jobs are disabled and CycleTrack is unaffected.
- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run server/medschools-worker/wiring.test.ts` → FAIL.
- [ ] **Step 3: Implement** in `index.ts`, following the existing structure exactly (`guarded(name, run)` per job, `inFlight`, `stopping`). The Admit tick logs `admit-live run complete …` with summary counters only. Both jobs share one host, so while the daily interviews walk runs (≈600 requests at 1 s) live requests interleave one-for-one; that is accepted and noted in the docs.
- [ ] **Step 4: Run** — wiring test + `pnpm exec vitest run lib/__tests__/scheduler-ratchet.test.ts` → PASS; `pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(medschools): wire Admit live and interviews queues into the worker`.

---

### Task 8: Alias-miss admin endpoints

**Files:**
- Create: `features/medschools/medschools.contract.ts`, `features/medschools/api/alias-admin.server.ts`, `features/medschools/api/medschools.admin.alias-misses.server.ts`, `…alias-misses.map.server.ts`, `…alias-misses.ignore.server.ts`, `features/medschools/api/alias-admin.server.test.ts`
- Modify: `lib/api/route-table.server.ts` (generated by `pnpm api:routes`)

**Interfaces:**
- Consumes: `planAliasMapping`, `MedPrisma` (cast of the site `prisma`, as the homes endpoints do).
- Produces (contract, client-safe): `listAliasMissesApi = endpoint<{ res: { misses: AliasMissDto[]; schools: SchoolOptionDto[] } }>()({ method: 'GET', path: '/api/admin/medschools/alias-misses' })`; `mapAliasMissApi = endpoint<{ body: { missId: string; schoolId: string }; res: { aliasId: string } }>()({ method: 'POST', path: '/api/admin/medschools/alias-misses/map' })`; `ignoreAliasMissApi = endpoint<{ body: { missId: string }; res: { ok: true } }>()({ method: 'POST', path: '/api/admin/medschools/alias-misses/ignore' })`. `AliasMissDto = { id; source; sourceKey; seenCount; firstSeenAt: string; lastSeenAt: string }` (unresolved and not ignored, by `seenCount` desc); `SchoolOptionDto = { id; name; shortName; state; degree }` (active schools by name). Handlers: `auth: 'admin'`, `rateLimit: 'write'` on POSTs, zod `body`.
- Produces (`alias-admin.server.ts`): `listAliasMisses(prisma)`, `mapAliasMiss(prisma, { missId, schoolId }): Promise<{ ok: true; aliasId: string } | { ok: false; status: 404 | 409; code: string; message: string }>`, `ignoreAliasMiss(prisma, missId)`. `mapAliasMiss`: load miss + school (404 each), run `planAliasMapping` with the school's aliases and the key's current owner (409 with its `code`), `medSchoolAlias.create` (a unique-violation is a 409 `KEY_MAPPED_ELSEWHERE`; the create is the atomic step, no transaction needed), then set `resolvedSchoolId` on the miss (idempotent). The next hourly/5-min run picks up the new alias.

- [ ] **Step 1: Write the failing tests** (`alias-admin.server.test.ts`, fake prisma): `lists unresolved non-ignored misses by seenCount desc`; `maps a miss: alias created and resolvedSchoolId set`; `second CYCLETRACK key for a school with one → 409 SCHOOL_ALREADY_HAS_KEY and nothing written` (guard (a)); `second ADMIT key → 409; second SDN key → ok`; `key already owned by another school → 409 KEY_MAPPED_ELSEWHERE`; `unknown miss or school → 404`; `ignore sets ignored and the miss leaves the list`; `module sources declare auth: 'admin'` (text assertion over the three route modules); `route registrations use the contract paths`.
- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run features/medschools/api` → FAIL.
- [ ] **Step 3: Implement** the logic and the three `apiRoute(path, { METHOD: implement(contract, options, handler) })` modules (worked example: `lib/playtime/api/games.playtime.server.ts`; confirm the allowed `rateLimit` names in `lib/api/handler.server.ts`). Then `pnpm api:routes`.
- [ ] **Step 4: Run** — `pnpm exec vitest run features/medschools/api lib/api/__tests__/route-table.test.ts lib/__tests__/raw-api-fetch-ratchet.test.ts` → PASS; `pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(medschools): admin endpoints to map or ignore alias misses, one key per single-key source`.

---

### Task 9: Admin page, i18n, bundle budget

**Files:**
- Create: `app/routes/_site/admin/medschools.tsx`, `features/medschools/ui/AliasMissesPanel.tsx`, `features/medschools/ui/AdminMedSchoolsLink.tsx`, `locales/en/medschools.json` (generated)
- Modify: `lib/i18n/config.ts` (`'medschools'` in `NAMESPACES`), `features/medschools/feature.ts` (`namespaces: ['medschools']`), `app/routes/_site/admin/index.tsx` (one `AdminMedSchoolsLink`), `lib/sitemap.ts` (`'/admin/medschools': 'admin'` in the exclusions), `scripts/check-bundle-budget.ts` only if over budget (below)

**Interfaces:**
- Consumes: Task 8 contracts via `api(contract, input)` (`@/lib/contract/client`) and React Query; `PageLayout`, `AdminBody`, `AdminHubCard`, `components/ui/{select,button,empty-state,RelativeTime}`, sonner.
- Produces: route `/_site/admin/medschools` (thin: `head` title `Med Schools aliases | Admin | RMH Studios`, component `AliasMissesPanel`; the `/admin` layout already gates admins). The panel: rows on 1px rules (R3) with source (`t-meta`), key (`t-body`), seen count and `RelativeTime` last seen (`t-meta`), a school `Select`, **secondary** Map and Ignore buttons (R4: no ink primary per row, none needed), empty state, error toast showing the server message on 409. No new CSS and no class that does not already exist elsewhere in `app/` (reuse `AdminBody`'s grammar).

- [ ] **Step 1: Write the failing tests:** `lib/__tests__/sitemap-coverage.test.ts` (existing) must pass with the exclusion; add to `features/medschools/schema` or a new `features/medschools/ui/admin-page.test.ts` text assertions: `route file registers /_site/admin/medschools`; `panel strings all go through t() with the medschools namespace` (no JSX text literals outside `t(`); `no raw palette colours or hardcoded radii` (the repo's `design-consistency.test.ts` and eslint own this). The repo has no component-test harness (`@testing-library` is absent), so behaviour lives in Task 8's tests and is checked by hand in Step 5.
- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run lib/__tests__/sitemap-coverage.test.ts features/medschools/ui` → FAIL.
- [ ] **Step 3: Implement** the files; add the namespace; `pnpm i18n:extract` and confirm every key is in `locales/en/medschools.json` (a `{/* */}` comment directly before a `t()` call silently drops it); then `pnpm typecheck && pnpm lint`.
- [ ] **Step 4: Run** — the Step 2 command plus `pnpm exec vitest run lib/__tests__/design-consistency.test.ts lib/__tests__/steel-tokens.test.ts lib/__tests__/steel-flat.test.ts lib/__tests__/og-page-coverage.test.ts` → PASS.
- [ ] **Step 5: Manual check** — `pnpm dev`, sign in as admin, open `/admin/medschools` at 390 px and 1280 px, Day and Night; seed one miss with `psql` (`insert into med_school_alias_miss …`), map it, ignore another, trigger a 409 by mapping a second CYCLETRACK key.
- [ ] **Step 6: Bundle budget.** `pnpm build` (≈8 GB heap, long), then `pnpm -s exec tsx scripts/check-bundle-budget.ts`. The site CSS is within 0.1 KB of its limit and a new route adds a route record to the entry chunk, so expect pass only if the delta is nil. If it exits non-zero: raise only the failing limit by the measured delta plus ≈1 KB headroom in `scripts/check-bundle-budget.ts` with a dated comment naming "RMH Med Schools alias admin page" (same style as the "RMH Research" entry), re-run until it passes, and **the PR body must carry an `OPT-01:` line naming RMH Med Schools (Admit phase 2a alias admin page) with the measured before/after bytes**. If the CSS (not JS) line fails, remove classes instead of raising it.
- [ ] **Step 7: Commit** — `feat(medschools): admin page to map or ignore alias misses`.

---

### Task 10: Docs and whole-branch verification

**Files:**
- Modify: `server/CLAUDE.md` (medschools-worker table row ~line 95 → "CycleTrack + Admit"; section ~line 2246: four queues and crons, `MEDSCHOOLS_ADMIT_ENABLED`, the Admit jobs requiring `MEDSCHOOLS_DEDUPE_SECRET` while CycleTrack does not, shared `api.admit.org` host, the opaque-token/per-run-cache rule for `user_id`, D1/D2/D6 summarised in one line each), `.env.example` (confirm the three vars and the "required for Admit jobs" wording on `MEDSCHOOLS_DEDUPE_SECRET`), `features/CLAUDE.md` only if it lists feature capabilities, `docs/_generated/facts.json`

- [ ] **Step 1:** edit the docs; `pnpm facts:generate`.
- [ ] **Step 2: Whole-branch gates** — `pnpm check:consistency --base main` and `pnpm check:consistency:full` → pass; `pnpm test:integration` is not affected.
- [ ] **Step 3: Commit** — `docs(medschools): worker docs and env for the Admit jobs`.

---

## Self-review

- **Spec coverage:** §14.2 Admit half → Tasks 3–7; §4a → D1, Tasks 3, 5; §6 → Tasks 3, 5, 6 boundary tests; §7 `MedInterviewQuestion`/`MedInterviewProfile`/stats → Task 2 (`MedInterviewDate` skipped, Admit has no dates); §8 queues/politeness/secret → Tasks 1, 7; §13 wiring already done in phase 1, only Admit vars added; §15 alias-miss page → Tasks 8, 9; deferred guards (a) → D4/Tasks 4, 8, (b) → D5/Task 4; docs → Task 10.
- **Types:** `FeedItem`, `LookupToken`, `ProgramFlag`, `flagToProgram`, `NormalizedAdmit*`, `rollupEventCounts`, `planAliasMapping`, `pickWalkTargets`, `cycleYearOf`, `gqlKey` are defined once (Tasks 2–5) and used with the same names later.
- **Proportion:** bodies appear only for the two non-obvious algorithms (live run, matcher); everything else is signatures plus test names.
