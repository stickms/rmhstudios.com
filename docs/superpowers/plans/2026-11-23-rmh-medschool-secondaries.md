# RMH Med Schools — Secondaries tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Secondaries** tab on every school page that lists the school's secondary-application prompts, split into
regular (MD/DO) and additional or different MD-PhD/DO-PhD prompts, each with its word or character limit, whether it is
optional, the cycle years it was observed in ("2023–2025, 2027"), and a year-over-year mark (same as last cycle /
reworded / new / not seen this cycle); plus a **pre-write overlap** view that groups the prompts of a member's list or
tracker schools by theme, so one essay can be drafted for several schools.

**Architecture:** Three additive tables: `MedSecondaryPrompt` (one row per school x program x normalised wording, with its
theme tags), `MedSecondaryObservation` (one row per prompt x cycle x source: limit, optional flag, source URL,
first-seen and **last-checked**) and `MedSecondaryCheck` (when each school x source page was last read and what it gave).
The `cycles` a prompt shows are computed from the distinct `cycleYear`s of its observations, so two sources seeing the same
prompt in the same cycle count once. Sources: Admit's public secondary-essays page and SDN's essay-questions page (both
deterministic HTML parsers, no model), SDN forum posts (a second, off-peak model call on posts the existing SDN live job
already reads, own budget share), and an admin-entered record from a school's own published page (never scraped). A
new exclusive worker queue `medschools.secondaries` reads the two page sources politely. Year-over-year marks, the
similarity link between reworded prompts and the school view are **computed at read time** by pure functions in
`engine/secondaries/` (nothing derived is stored except theme tags). Themes are tagged by **keyword rules** at ingest
(deterministic, free, testable). The public endpoint is user-independent and cached; the overlap endpoint is under
`me/**` so a member's list never appears in a URL or a shared cache.

**Tech Stack:** TanStack Start, React 19, React Query, TypeScript strict, Prisma 7, zod 4, pg-boss (via
`lib/jobs/scheduled-consumer.server.ts`), node-html-parser (already used by the SDN adapters), vitest, Playwright for
the visual pass. No similarity or NLP library: pure TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md` (§4a programs, §6 anonymization, §7 data model and
"school websites are not scraped", §8 worker and politeness, §9 SDN extraction, §9a Admit forums, §11 web). Roadmap:
`docs/superpowers/plans/2026-11-23-rmh-medschool-roadmap.md` (item 2). Earlier plans whose rules carry over: phase 5
`docs/superpowers/plans/2026-11-23-rmh-medschool-phase5-forecast.md`, phase 4 `…phase4-tracker-lists.md`. Endpoint facts:
`docs/superpowers/specs/2026-11-20-rmh-medschool-source-endpoints.md` (Admit `/secondary-essays/<slug>`: "prompts
2019-2025 with word limits and 'Chance %'"; SDN `…/medical-school/essay-questions/<CODE>/<slug>`: "Secondary prompts by
cycle"; CycleTrack `?view=secondary`). Read `features/medschools/CLAUDE.md` first.

**Precedents cited (read before the task that uses them):**

- _A polite HTML job with ledger, walk order, min interval:_ `scrape/run-sdn-interviews.ts` (+ test), `closeStaleRuns`,
  `pickWalkTargets`, `lastRealRunWithin`, `recordAliasMiss` in `scrape/run-support.ts`; wiring in
  `server/medschools-worker/index.ts` (`sdnInterviewsTick`, `hostBudget`, `startScheduledConsumer`, `pause()`) and
  `wiring.test.ts`.
- _An HTML adapter with hostile fixtures:_ `adapters/sdn/parse-summary.ts`, `adapters/sdn/guard.ts` (`assertPage`),
  `adapters/sdn/__fixtures__/summary-hostile.html`, `adapters/sdn/fixtures.test.ts`, `scrape/sdn-anonymization-boundary.test.ts`,
  `scrape/test-support.ts` (`createFakePrisma`, `createFakeHost`, `loadFixture`, `assertNoLeak`).
- _Scrubbing text from forums:_ `engine/sdn-rules.ts` (`scrubQuestion`, `normalizeQuestion`, `redactForModel`, `containsHandle`,
  `passesPrefilter`), `scrape/sdn/process-thread.ts` (the chunk loop), `scrape/sdn/extract.ts` (`SdnAi`, `extractBatch`).
- _An AI sub-share:_ `scrape/admit-forums-budget.ts` (+ test), `isDeepseekPeak` in `lib/ai/deepseek-peak.ts`.
- _A public registered endpoint:_ `api/medschools.schools.$slug.history.server.ts`; _a private one:_ `api/medschools.me.lists.server.ts`
  with `api/me-http.server.ts`; _an admin one:_ `api/admin.medschools.alias-misses.map.server.ts`.
- _A tab and its loader:_ `ui/ForecastTab.tsx`, `ui/SchoolPage.tsx`, `loadSchoolHead` in `medschools.queries.ts`,
  `engine/search.ts`, `engine/public-read.ts` (`SCHOOL_TABS`).

## Global Constraints

- Stack of record is TanStack Start + Vite + React 19 + Nitro. **Not Next.js.** Out of scope: private essay drafts
  (**none are stored, anywhere**: no draft field, no notes on a prompt), the cost estimator, turnaround statistics
  (deferred, see Rulings R9), AI Q&A, any change to the tracker or its sharing, any crawler of a school's own website.
- **Anonymization (spec §6).** Prompts are institutional text, not personal data, but a forum post is a person's text:
  forum-sourced prompts pass a reject-not-redact scrub (Task 3) and carry **no author, user id, handle, post id, post hash
  or post permalink**; `sourceRef` is a school page or a **thread** URL (`canonicalThreadUrl`), never a post. The adapters'
  outputs are the one type `NormalizedPrompt` with no field that could hold a person. Hostile-fixture tests hunt for
  needles in every write, log line and model input (Tasks 6, 7, 9, 10).
- **Politeness (spec §8, owner 2026-11-23).** A new host config `SOURCES.ADMIT_WEB` (`https://med.admit.org`): 3000 ms
  spacing plus 0-1000 ms jitter, three-strike halt, `Retry-After` and 429 backoff, robots.txt honoured, the one static
  `MEDSCHOOLS_USER_AGENT`, a persisted per-UTC-day budget (`MedRequestBudget`, retries and robots counted, shared by every
  job on the host); SDN's existing `SDN_WWW` host (1500 ms spacing; budget 1500/day) for its page. Every page goes
  through `assertPage` (Cloudflare and error pages are failures on the session). The job has `maxRuntimeMs` equal to the
  queue expiry, a persisted minimum interval (`lastRealRunWithin`), `retryLimit: 0`, cron owned by the `jobs` timekeeper
  through `startScheduledConsumer`, paused on shutdown. Missing data is not zero: a page that gives nothing recognisable
  leaves the stored rows untouched.
- **AI.** The page sources and the school entry use **no model**. The only model call is the SDN forum extraction (Task
  10): off-peak only (`isDeepseekPeak`), inside the scrape share of `MEDSCHOOLS_AI_MONTHLY_USD`, labelled
  `medschools-extract:secondaries`, default 10% of that cap, fails closed on a ledger error. Public requests make no
  model call.
- **Dates are UTC calendar days; cycle years are entry years** (`cycleYear` 2027 is the 2026–2027 application cycle,
  CycleTrack's convention, `engine/cycle.ts`). The current cycle is `siteCycle` (`api/read.server.ts`).
- **Public endpoints stay user-independent and publicly cacheable**; everything that reads a list or the tracker is under
  `me/**`, `auth: 'required'`, no `cache` option.
- **API (CLAUDE.md §3):** contract in `medschools.contract.ts` (`endpoint<…>()`), `implement()` in a registered `apiRoute`
  module under `features/medschools/api/`, `pnpm api:routes`, clients through `contractQuery` / `api()`, no raw
  `fetch('/api/…')`. The admin endpoint is `auth: 'admin'`.
- **Steel (until the owner-approved redesign, roadmap item 11).** Flat (R1), rows on rules (R3), one ink primary per view
  (R4), nothing moves at rest (R5), content arriving after paint fades 160 ms through `components/ui/arrive.tsx`
  (M9), `t-*` type classes, `--site-*` tokens only, `components/ui` primitives, 44 px controls on touch, a notice is a
  `t-meta` line (§18 D8 is open: no tinted box). **Components are presentational and token-driven** (data in props, no
  fetching inside a row component, no inline colours or sizes) because the redesign will restyle them. Do not resolve
  Steel §18 items by assumption.
- **i18n:** every string through `t()` in namespace `medschools`, keys prefixed `secondaries-` / `overlap-` /
  `school-tab-secondaries`; a reworded shipped string is a new key; no `{/* … */}` immediately before a `t()` call; check
  `locales/en/medschools.json` after `pnpm i18n:extract`. Dates and numbers through `Intl` (`formatUtcDay`,
  `useLocaleFormat`). Test Day and Night at 390 px and 1280 px, and once in `ar`.
- **Bundle (OPT-01):** `engine/secondaries/` is shared. The client may import only `cycle-ranges.ts` and `theme-ids.ts`
  from it (pure, tiny); everything else (similarity, view building, scrub, normalisation) is server and worker code.
  Task 5's boundary test pins both rules. No route file imports the tab (it lives in the lazy page chunk).
- **Commands:** typecheck with `GOMEMLIMIT=2GiB GOGC=10 GOMAXPROCS=1 node node_modules/typescript-native/bin/tsc -b
  --singleThreaded` (the plain `pnpm typecheck` OOMs in this container); unit tests `pnpm exec vitest run <paths>`. **Commit
  gate:** stage first, commit separately, `pnpm check:consistency` before every commit, never `--no-verify`, no
  `RMH_SKIP_COMMIT_GATE`. Messages explain why and end with the trailer lines the session was given. No `any`,
  `@ts-ignore`, new lint or type warnings. The migration is additive (`lib/__tests__/migrations-additive.test.ts`).
- **Ordering with phase 6.** Phase 6 (AI Q&A) is in the same checkout and edits `medschools.contract.ts`, `ai-budget.ts`
  and `lib/api/handler.server.ts`. Start this branch from `main` **after phase 6 has merged** (or rebase onto it before
  Task 11); the migration timestamp below must sort after phase 6's last one (`ls prisma/migrations | tail`).

## Review Focus

Inputs the spec implies but no obvious task test reaches; each line has its test in the named task.

1. **Before a school publishes this cycle's prompts (June to August) nothing is "gone".** Last cycle's list is shown as
   last cycle's (`state: 'not-yet'`, status `last-cycle`), with its own line; a school with only some of this cycle's
   prompts seen is compared only on the sources that have seen something this cycle. Task 5, Task 12.
2. **A school's first year of data has no year-over-year marks.** No previous cycle observation means status `null`, never
   "new". Task 5.
3. **A prompt that returns after a gap** (2023, 2024, then 2026) reads "2023–2024, 2026"; the same prompt seen by Admit and
   SDN in one cycle is one cycle, not two; Dec 31 / leap-day dates play no part (cycles are integers). Task 5, Task 8.
4. **Wording noise must not fork a prompt.** The same prompt with "(250 words)", "in 250 words or fewer", "(Optional)",
   numbering ("1."), curly quotes, double spaces or different case is one prompt; a changed limit is the same prompt with a
   changed limit, not a new one. Task 2, Task 8.
5. **A forum post that quotes a person.** A prompt containing a handle, an email, a URL, "Dr. Name", a phone number, a
   first-person narrative ("I wrote…"), or a quoted reply is rejected and never stored or sent to the model's output path;
   nothing person-shaped is in any write, log or thrown error. Task 3, Task 10.
6. **A page whose markup changed.** Zero prompts parsed from a page that gave prompts last time (or more than 40 for a
   section) is `UNAVAILABLE`: stored rows untouched, nothing marked gone, the check row says so, the run is not failed.
   Task 6, Task 7, Task 9.
7. **MD-PhD is not a filter on regular prompts.** The PHD list shows only prompts the source attributes to the combined
   program; an MD-only DO school can have both lists; a school with no PHD prompts shows no empty PHD heading; the overlap
   for a PHD list item includes the regular prompts too and labels each by program. Task 2, Task 5, Task 12.
8. **Overlap edge cases.** An empty list, a list of 200 items (the cap), a school with no prompts (listed under "no prompts
   found", not silently dropped), an inactive school, the same school twice (REG and PHD items), another member's list id
   (404, never an empty 200), the tracker with no application this cycle. Task 12.
9. **Caching and identity.** The school endpoint is byte-identical for any viewer; the overlap response has no cache header
   and never contains another member's data; the tab is server-rendered with scripting off. Task 11, Task 12, Task 15.
10. **`ar` and 390 px.** A cycle range ("2023–2025, 2027") keeps its order and en dashes in a right-to-left page (isolated
    with `<bdi>` / `dir="ltr"`), prompt text wraps, no sideways scroll, 44 px controls. Task 13, Task 15.

## Decisions made in this plan (technical; owner-overridable ones are "Rulings" at the end)

- **D1 One prompt, many observations.** `MedSecondaryPrompt` is unique on `(schoolId, program, key)`;
  `MedSecondaryObservation` is unique on `(promptId, cycleYear, source)`. Dedupe across sources is by the normalised key,
  so Admit and SDN seeing one prompt share a row and, in one cycle, one *cycle*. A prompt's `cycles` is
  `sorted(distinct cycleYear)`; nothing is ever a sum of sources.
- **D2 The key.** `secondaryKey(text)` (pure): NFKC, lower-case, curly to straight quotes, strip a leading list marker
  (`1.`, `(a)`, `Q2:`), strip bracketed or trailing limit and optional markers, strip **any** number-plus-unit limit phrase
  (`\d[\d,]*\s*(words?|characters?|chars?)` with a surrounding "in", "no more than", "up to", "maximum of", "or fewer", "or
  less", "limit", "max", "with spaces"), drop punctuation except in-word apostrophes, collapse whitespace, cap at 500
  chars. Two wordings with equal keys are one prompt.
- **D3 Limit and optional are parsed, then stored on the observation.** `parsePromptText(raw)` returns the display `text`
  (markers removed), `limit` (`WORDS` or `CHARS` and a positive integer, 1 to 20000), `optional`
  (`\boptional\b`, case-insensitive, in a bracket or leading or trailing position only). A source's own structured limit
  wins over the text. Display values for a prompt come from its newest cycle's observations, source priority
  `SCHOOL > ADMIT > SDN_PAGE > SDN_FORUM`.
- **D4 Reworded = similar, computed at read.** `similarity(a, b)` is the Dice coefficient over the set of content-word
  unigrams plus adjacent content-word bigrams (lower-case, stop words removed, a light suffix stem: `ing ed es s ly`). A pair
  is **reworded** when it scores `>= SIM_REWORDED = 0.5` and both sides have at least 3 content words. Calibrated on a
  prototype (the pairs are in Task 4's tests): the same challenge prompt reworded 1.00, the diversity prompt reworded 0.67,
  the research prompt with a tail 0.75, a "why us" reworded 0.20, an ethics reworded 0.38, unrelated 0.00. The threshold is
  deliberately conservative: a missed link shows one "new" and one "not seen", a false link would claim a school kept a
  prompt it dropped. Matching is a greedy one-to-one assignment by descending score.
- **D5 Year-over-year is computed per school x program at read** (`buildSchoolView`), against `currentCycle - 1`
  only. Statuses: `same` (observed in both), `reworded` (matched by D4; `previousText` carried), `new` (current, no match,
  and last cycle has observations), `gone` (last cycle only, no current match, and comparable: see Review Focus 1),
  `last-cycle` (current cycle has no observations for this program yet; the list shown is the newest earlier cycle's),
  `null` (no previous-cycle observations at all).
- **D6 Themes by keyword rules at ingest** (Task 4). Twelve fixed themes plus `other`, multi-label, stored as `String[]`
  with `themesVersion`; a rule change bumps `THEMES_VERSION` and the job re-tags older rows. Rationale in Ruling R1.
- **D7 Programs.** A page prompt is `PHD` when its text or its section heading matches
  `/\b(md[\s/-]*ph\.?d|do[\s/-]*ph\.?d|mstp|combined (?:degree|program)|dual[\s-]degree|physician[\s-]scientist program)\b/i`,
  otherwise `REG` (`classifyProgram`). The school view keeps programs in separate groups; a wording identical in both is
  two rows (one per program).
- **D8 The overlap is computed from the member's own schools server-side** (`me/**`), over the *same* `SchoolView` the
  public endpoint builds, so a member sees exactly what the tab shows.
- **D9 Never deleted.** Observations are history; a prompt a school stops asking is not removed, it simply has no
  observation in the new cycle (which is what "not seen this cycle" means). A school page removed upstream changes nothing.

## File Structure

| Path | Responsibility |
| --- | --- |
| `prisma/schema/medschools.prisma`, `prisma/migrations/20261204090000_medschools_secondaries/` | `MedSecondaryPrompt`, `MedSecondaryObservation`, `MedSecondaryCheck`, enums `MedPromptSource`, `MedLimitKind`, `MedCheckStatus` |
| `features/medschools/engine/secondaries/{types,text,scrub,similarity,themes,theme-ids,cycle-ranges,view,overlap}.ts` (+tests, `fixtures.ts`) | The pure engine |
| `features/medschools/scrape/adapters/admit/secondaries.ts` (+test, `__fixtures__/secondary-essays-*.html`) | Admit page URL and parser |
| `features/medschools/scrape/adapters/sdn/parse-essays.ts` (+test, `__fixtures__/essay-questions-*.html`), `sdn/urls.ts`, `sdn/index.ts` | SDN page URL and parser |
| `features/medschools/scrape/sources.ts` | `SOURCES.ADMIT_WEB`, `DAILY_REQUEST_BUDGETS.ADMIT_WEB`, `ADMIT_SECONDARY_URL` |
| `features/medschools/scrape/secondaries-store.ts` (+test) | `recordPrompts`, `recordCheck`, `retagThemes` |
| `features/medschools/scrape/run-secondaries.ts` (+test) | The job |
| `features/medschools/scrape/sdn/secondaries.ts` (+test), `sdn/process-thread.ts`, `scrape/secondaries-budget.ts` (+test) | The forum extractor, its seam, its AI share |
| `features/medschools/scrape/types.ts`, `scrape/test-support.ts` | `MedPrisma` and the in-memory fake gain the three delegates |
| `server/medschools-worker/index.ts`, `wiring.test.ts`, `.env.example`, `server/CLAUDE.md` | Queue `medschools.secondaries`, cron, hosts, flags |
| `features/medschools/medschools.contract.ts` | `MedSchoolSecondariesRes`, `MedSecondaryOverlapRes`, `getMedSchoolSecondariesApi`, `getMedSecondaryOverlapApi`, `postMedSecondariesAdminApi` |
| `features/medschools/api/{secondaries.server.ts,secondaries-admin.server.ts,secondaries-overlap.server.ts}` + `medschools.schools.$slug.secondaries.server.ts`, `medschools.me.secondaries.overlap.server.ts`, `admin.medschools.secondaries.server.ts`, `read-schemas.ts`, `me-schemas.ts` | Services and registered endpoints |
| `features/medschools/engine/{public-read,search}.ts`, `medschools.queries.ts` | `'secondaries'` tab, `secondariesQuery`, `overlapQuery` |
| `features/medschools/ui/SecondariesTab.tsx`, `ui/secondaries/{SecondaryPromptRow,CycleRange,labels}.tsx`, `ui/secondaries/OverlapView.tsx`, `ui/SchoolPage.tsx`, `ui/lists/ListSection.tsx`, `ui/tracker/TrackerPage.tsx` | UI |
| `testing/integration/medschools-public.test.ts`, `medschools-private.test.ts`, `lib/medschools-fixture.ts`, `scripts/medschools/{seed-visual.ts,visual-check.mjs}` | Verification |
| `features/medschools/CLAUDE.md`, `server/CLAUDE.md`, spec §14, roadmap, `locales/en/medschools.json`, `.env.example` | Docs |

---

### Task 1: Schema and migration

**Files:**

- Modify: `prisma/schema/medschools.prisma` (back-relations `secondaryPrompts MedSecondaryPrompt[]` and
  `secondaryChecks MedSecondaryCheck[]` on `MedSchool`; the three models below), `features/medschools/engine/schema.test.ts`
- Create: `prisma/migrations/20261204090000_medschools_secondaries/migration.sql` (re-check `ls prisma/migrations | tail`; it
  must sort after phase 6's last migration)

**Interfaces:** produces (house style, `@@map` snake_case):

```prisma
enum MedPromptSource { ADMIT SDN_PAGE SDN_FORUM SCHOOL }   // a new enum, NOT a value on MedSource (every MedSource map is exhaustive)
enum MedLimitKind { WORDS CHARS }
enum MedCheckStatus { OK EMPTY UNAVAILABLE }
model MedSecondaryPrompt {
  id String @id @default(cuid()); schoolId String; program MedProgram; key String; text String
  themes String[]; themesVersion Int; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  school MedSchool (Cascade); observations MedSecondaryObservation[]
  @@unique([schoolId, program, key]); @@index([schoolId]); @@map("med_secondary_prompt") }
model MedSecondaryObservation {
  id String @id @default(cuid()); promptId String; cycleYear Int; source MedPromptSource
  limitKind MedLimitKind?; limitValue Int?; optional Boolean @default(false); sourceRef String?
  firstSeenAt DateTime @default(now()); lastCheckedAt DateTime
  prompt MedSecondaryPrompt (Cascade)
  @@unique([promptId, cycleYear, source]); @@index([cycleYear]); @@map("med_secondary_observation") }
model MedSecondaryCheck {
  id String @id @default(cuid()); schoolId String; source MedPromptSource; checkedAt DateTime
  status MedCheckStatus; promptCount Int; school MedSchool (Cascade)
  @@unique([schoolId, source]); @@map("med_secondary_check") }
```

- [ ] **Step 1: Write the failing tests** in `schema.test.ts`: the three models and three enums exist; none of the three has a
      column matching the existing `PERSON_LIKE` rule or named `userId` (do not add them to `USER_OWNED`); the uniques
      `[schoolId, program, key]`, `[promptId, cycleYear, source]`, `[schoolId, source]` are pinned (the store upserts on
      them); `MedSecondaryObservation` has exactly the columns `id promptId cycleYear source limitKind limitValue optional
      sourceRef firstSeenAt lastCheckedAt` (nothing person-shaped can be added silently; there is no draft or note column
      on any of the three, which is the "no private drafts" rule); `MedPromptSource` has exactly `ADMIT SDN_PAGE SDN_FORUM
      SCHOOL`; the migration text creates the three tables and enums and contains no `DROP`.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the schema; generate the SQL with `pnpm exec prisma migrate dev --create-only --name
      medschools_secondaries` against a scratch DB and rename the directory to the timestamp above (as phase 5 Task 1 did). No
      account-erasure entry (no `User` relation).
- [ ] **Step 4: Verify:** `pnpm exec prisma validate && pnpm exec prisma generate && pnpm exec prisma migrate diff
      --from-migrations prisma/migrations --to-schema prisma/schema --exit-code`, then Step 2's command plus
      `lib/__tests__/migrations-additive.test.ts lib/account/__tests__/erasure-coverage.test.ts`. Expected: PASS, "No
      difference detected".
- [ ] **Step 5: Commit** — `feat(medschools): secondary prompt, observation and check tables (additive, no person column)`.

---

### Task 2: Prompt text rules (key, limit, optional, program)

**Files:**

- Create: `features/medschools/engine/secondaries/{types,text}.ts`, `text.test.ts`

**Interfaces:** produces (pure, client-safe: no `node:`, no zod, no I/O):

```ts
// types.ts
export const PROMPT_SOURCES = ['ADMIT', 'SDN_PAGE', 'SDN_FORUM', 'SCHOOL'] as const;
export type PromptSource = (typeof PROMPT_SOURCES)[number];
export const SOURCE_PRIORITY: readonly PromptSource[] = ['SCHOOL', 'ADMIT', 'SDN_PAGE', 'SDN_FORUM'];
export type LimitKind = 'WORDS' | 'CHARS';
export interface PromptLimit { kind: LimitKind; value: number }
/** What every adapter emits. No field can hold a person. */
export interface NormalizedPrompt {
  cycleYear: number; program: MedProgram; text: string; limit: PromptLimit | null; optional: boolean; sourceRef: string | null;
}
// text.ts
export const MAX_TEXT = 1500; export const MAX_KEY = 500; export const MAX_LIMIT = 20000;
export function parsePromptText(raw: string): { text: string; limit: PromptLimit | null; optional: boolean };
export function secondaryKey(text: string): string;              // D2
export const PHD_RE: RegExp;                                      // D7
export function classifyProgram(text: string, heading?: string): MedProgram;
```

- [ ] **Step 1: Write the failing tests** (`text.test.ts`):
  - `parsePromptText('1. Describe a challenge you faced. (250 words)')` is `{ text: 'Describe a challenge you faced.', limit:
    { kind: 'WORDS', value: 250 }, optional: false }`; `'… in 250 words or fewer.'` and `'… (max 250 words)'` and `'… 250-word
    limit'` give `250 WORDS`; `'(Optional) Is there anything else? 1,500 characters with spaces'` gives `optional: true`, `1500 CHARS`;
    `'Why us?'` gives `limit: null, optional: false`; `'Describe your optional courses'` is **not** optional (only a bracketed,
    leading or trailing marker counts); a limit of `0` or `30000` is dropped to `null`; text over `MAX_TEXT` is cut at a
    word boundary; control characters and zero-width characters are removed.
  - Review Focus 4: these all have equal `secondaryKey`: `'Describe a challenge you faced. (250 words)'`,
    `'1. DESCRIBE a challenge you faced.  (Optional)'`, `'Describe a challenge you faced, in 300 words or fewer.'`, with curly quotes
    and double spaces; and these differ: `'Describe a challenge you faced.'` vs `'Describe a challenge you overcame.'`. A key never
    exceeds `MAX_KEY`; the key of `''` is `''` (the store rejects empty keys).
  - `classifyProgram('Why are you applying to the MD-PhD program?')`, `('Describe your research', 'MD/PhD Applicants')`,
    `'MSTP applicants only: …'`, `'DO/PhD …'` are `PHD`; `'Why this school?'` is `REG`; `'a PhD in economics'` alone is `REG`
    (no combined-degree phrase).
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/secondaries/text.test.ts`.
- [ ] **Step 3: Implement** the signatures. The limit and optional extractors work on the raw text and the key on the cleaned
      text from `parsePromptText` followed by D2's further stripping, so the key never depends on a marker.
- [ ] **Step 4: Run to pass,** plus the `tsc` command. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): secondary prompt text rules (key, limit, optional, program)`.

---

### Task 3: Scrubbing forum-sourced prompts

**Files:**

- Create: `features/medschools/engine/secondaries/scrub.ts`, `scrub.test.ts`

**Interfaces:** consumes `scrubQuestion`, `HandleSource`, `containsHandle` from `../sdn-rules`; produces:

```ts
export const PROMPT_MIN = 20;        // shorter is a fragment, not a prompt
export const PROMPT_MAX = 600;
/** Null = rejected. Rejects, never redacts. For SDN_FORUM text only; page and school sources are institutional. */
export function scrubForumPrompt(text: string, handles: HandleSource): string | null;
```

- [ ] **Step 1: Write the failing tests** (Review Focus 5, one hostile string each, all `=== null`): an email; an `https://`
      URL and a `www.` URL; `@name`; a phone number; `Dr. Smith`; a string containing a page handle from `handles`; a
      first-person narrative (`'I wrote about my grandmother and they asked why.'`, `"I'm still waiting on this one"`,
      `'my answer was 250 words'`); a quote artefact (`'> Why us? '`, `'John said: Why us?'`, `'[quote="Name"]…'`); shorter
      than `PROMPT_MIN`; longer than `PROMPT_MAX`; all-caps shouting over 60% capitals. Accepted (returned trimmed, single
      spaces): `'Describe a time you faced adversity and how you responded.'`, `'Why are you interested in our school? (250 words)'`,
      `'Please describe your activities since graduation.'`, and a prompt containing "you" and "your" (second person is the
      normal case; only first-person singular is a rejection).
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/secondaries/scrub.test.ts`.
- [ ] **Step 3: Implement.** Compose `scrubQuestion` (its length bounds are a question's, so apply this file's bounds first and
      call `scrubQuestion` for the person-shaped patterns only after widening nothing: if `scrubQuestion`'s own bounds reject
      a valid prompt, factor its pattern checks into an exported `hasPersonShape(text, handles)` in `sdn-rules.ts` and call that;
      do not weaken `scrubQuestion`). Add the first-person, quote-marker and shouting checks here.
- [ ] **Step 4: Run to pass,** plus `pnpm exec vitest run features/medschools/engine/sdn-rules.test.ts` (unchanged) and the
      `tsc` command.
- [ ] **Step 5: Commit** — `feat(medschools): reject-not-redact scrub for forum-sourced secondary prompts`.

---

### Task 4: Similarity and themes

**Files:**

- Create: `features/medschools/engine/secondaries/{similarity,themes,theme-ids}.ts`, `similarity.test.ts`, `themes.test.ts`

**Interfaces:** produces (pure):

```ts
// similarity.ts
export const SIM_REWORDED = 0.5; export const SIM_MIN_WORDS = 3;
export function contentWords(text: string): string[];              // lower-case, stop words out, light stem
export function similarity(a: string, b: string): number;          // Dice over unigram + bigram sets, 0..1; 0 if either has < SIM_MIN_WORDS words
export function isReworded(a: string, b: string): boolean;         // similarity >= SIM_REWORDED
export function matchPrompts(older: readonly { id: string; text: string }[], newer: readonly { id: string; text: string }[]):
  { newerId: string; olderId: string; score: number }[];            // greedy one-to-one by descending score, only >= SIM_REWORDED; ties broken by id
// theme-ids.ts   (client-safe, imported by the UI)
export const THEME_IDS = ['why-school','why-medicine','diversity','adversity','challenge','gap-year','service','research',
  'leadership','growth','additional-info','future-goals','other'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
// themes.ts
export const THEMES_VERSION = 1;
export function tagThemes(text: string): ThemeId[];                 // sorted in THEME_IDS order; ['other'] only when nothing else matches
```

- [ ] **Step 1: Write the failing tests.**
  - `similarity.test.ts`: identical text is `1`; text with nothing in common is `0`; symmetric; a prompt with fewer than 3 content
    words (`'Why medicine?'`) scores 0 against anything. Pairs that **must** be reworded (`isReworded` true): `'Describe a challenge
    you have faced and how you overcame it.'` / `'Tell us about a challenge you faced and how you overcame it.'`; `'Describe how
    your background and experiences would contribute to the diversity of our class.'` / `'How would your experiences contribute to
    diversity in our entering class?'`; `'Describe your research experience.'` / `'Describe your research experience and what you
    learned.'`. Pairs that **must not** (false): `'Why are you interested in our medical school?'` / `'Please describe a challenge you
    have faced and how you overcame it.'`; `'Describe your research experience.'` / `'Why are you interested in our school?'`;
    `'Describe how your background … diversity of our class.'` / `'Describe a time you faced adversity.'`. Two documented
    near-misses stay below the line on purpose (`'Discuss a significant ethical dilemma you encountered.'` / `'Describe an ethical
    dilemma you have faced and how you resolved it.'`, `'Why are you interested in our medical school?'` / `'Why do you want to attend
    our school?'`) so the threshold is not retuned silently. `matchPrompts`: two newer prompts that both resemble one older prompt
    pair only the better one (one-to-one), the other is unmatched; empty inputs give `[]`.
  - `themes.test.ts` (a fixture list in `fixtures.ts` of at least 40 realistic prompts with their exact expected sets; the test
    iterates it): `'Why are you interested in our school?'` is `['why-school']`; `'Why do you want to be a physician?'`
    `['why-medicine']`; `'Describe how your background would contribute to the diversity of our class.'` `['diversity']`;
    `'Describe a time you faced adversity or overcame an obstacle.'` `['adversity']`; `'Describe a challenge or conflict you faced.'`
    `['challenge']`; `'Please describe your activities since graduating.'` `['gap-year']`; `'Describe your community service and volunteer
    experience.'` `['service']`; `'Describe your research experience.'` `['research']`; `'Describe a leadership role and what you learned
    from it.'` `['growth','leadership']`; `'Is there anything else you would like us to know? Explain any COVID-19 impact.'`
    `['additional-info']`; `'Where do you see yourself in ten years?'` `['future-goals']`; `'Describe your most meaningful experience and
    how it affected you.'` `['growth']`; an unmatched string is `['other']`; the output is always sorted, de-duplicated and never mixes
    `other` with another theme; the whole fixture list tags in under 50 ms; `THEMES_VERSION` is pinned to 1.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/secondaries/similarity.test.ts
      features/medschools/engine/secondaries/themes.test.ts`.
- [ ] **Step 3: Implement.** `similarity` per D4 (set of content-word unigrams plus adjacent bigrams; Dice = `2|A∩B| / (|A|+|B|)`); the stop-word list is a
      const array in the file, tuned until the pairs above hold (do not tune the threshold). `tagThemes` is an ordered
      table of `{ id, re }` rules over the lower-cased text (case-insensitive word-boundary keywords: school/mission/fit,
      physician/medicine motivation, diversity/underrepresented/lived experience, adversity/hardship/disadvantage/obstacle/overcome,
      challenge/conflict/failure/mistake/ethical dilemma, gap year/time off/since graduat*/activities since, service/volunteer/
      underserved/community, research/scholarly/physician-scientist, leader/team, growth/meaningful/reflect/learned, anything
      else/additional information/explain/circumstances/COVID/irregularit*, future/ten years/career goals); keep the table in
      one place so a rule change is one edit plus a `THEMES_VERSION` bump.
- [ ] **Step 4: Run to pass,** plus the `tsc` command. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): prompt similarity (Dice, pure TS) and keyword theme tags`.

---

### Task 5: Cycle ranges, the school view and the overlap (pure)

**Files:**

- Create: `features/medschools/engine/secondaries/{cycle-ranges,view,overlap}.ts`, `cycle-ranges.test.ts`, `view.test.ts`,
  `overlap.test.ts`, `boundary.test.ts`

**Interfaces:** consumes `isReworded`/`matchPrompts`, `SOURCE_PRIORITY`, `ThemeId`; produces:

```ts
// cycle-ranges.ts   (client-safe, imported by the UI)
export function cycleRanges(years: readonly number[]): { from: number; to: number }[];   // sorted, de-duplicated, consecutive runs merged
export function formatCycleRanges(years: readonly number[], dash?: string): string;      // "2023–2025, 2027"; one year "2027"; [] ""
// view.ts
export interface StoredObservation { cycleYear: number; source: PromptSource; limit: PromptLimit | null; optional: boolean; sourceRef: string | null; lastCheckedAt: Date }
export interface StoredPrompt { id: string; program: MedProgram; text: string; themes: string[]; observations: StoredObservation[] }
export type YoyStatus = 'same' | 'reworded' | 'new' | 'gone' | 'last-cycle';
export interface PromptView {
  id: string; program: MedProgram; text: string; limit: PromptLimit | null; optional: boolean; themes: ThemeId[];
  status: YoyStatus | null; previousText: string | null; cycles: number[]; sources: PromptSource[]; lastCheckedAt: Date;
}
export interface ProgramView { program: MedProgram; state: 'current' | 'not-yet' | 'none'; shownCycle: number | null; comparedWith: number | null; prompts: PromptView[] }
export function buildSchoolView(prompts: readonly StoredPrompt[], currentCycle: number): ProgramView[];   // REG then PHD; only programs that have any prompt
// overlap.ts
export interface OverlapSchool { slug: string; name: string; programs: readonly MedProgram[]; view: readonly ProgramView[] }
export interface OverlapEntry { slug: string; schoolName: string; program: MedProgram; promptId: string; text: string; limit: PromptLimit | null; optional: boolean; basis: 'current' | 'last-cycle' }
export interface OverlapGroup { theme: ThemeId; schools: number; entries: OverlapEntry[]; shortestWords: number | null; longestWords: number | null }
export function buildOverlap(schools: readonly OverlapSchool[], currentCycle: number):
  { groups: OverlapGroup[]; withoutPrompts: { slug: string; name: string }[] };
```

- [ ] **Step 1: Write the failing tests.**
  - `cycle-ranges.test.ts`: `formatCycleRanges([2027, 2023, 2024, 2025, 2025])` is `'2023–2025, 2027'` (en dash); `[2023,2025]` is
    `'2023, 2025'`; `[2027]` `'2027'`; `[]` `''`; a custom `dash` is used; unsorted and duplicate input is normalised (Review Focus 3).
  - `view.test.ts` (fixtures built inline, `currentCycle = 2027`):
    - **same:** observed 2026 and 2027 → `same`, `cycles [2026, 2027]`. A prompt seen by ADMIT and SDN_PAGE in 2027 has `cycles [2027]` (counted
      once) and `sources ['ADMIT', 'SDN_PAGE']` (priority order).
    - **reworded:** 2026 text A, 2027 text A' with `isReworded(A, A')` and different keys → the 2027 prompt is `reworded` with
      `previousText` A, and A is **not** also listed as `gone`; a 2027 prompt that matches nothing is `new`; a 2026-only prompt with no
      match is `gone` (kept after the current ones).
    - **gap:** observed 2023, 2024, 2027 → `cycles [2023, 2024, 2027]`, status `new` or `same` per 2026 (not observed 2026 → `new`
      unless matched), and `formatCycleRanges` on it reads `2023–2024, 2027`.
    - **not-yet (Review Focus 1):** no 2027 observation for REG but 2026 ones → `state 'not-yet'`, `shownCycle 2026`, every prompt
      `status 'last-cycle'`, none `gone`.
    - **comparable sources:** 2026 prompts seen by ADMIT and SDN_PAGE; 2027 seen only by SDN_PAGE (Admit not yet checked) → an ADMIT-only
      2026 prompt is **not** `gone` (and not shown as current); it is omitted from the list; an SDN_PAGE 2026 prompt missing in
      2027 is `gone`.
    - **first year (Review Focus 2):** only 2027 observations → every status `null`; `comparedWith null`.
    - **PHD (Review Focus 7):** REG and PHD programs build independently; a school with only REG prompts returns one `ProgramView`;
      the same wording in both programs is two prompts; PHD-only school returns only PHD.
    - **display values:** the limit shown is from the newest cycle, source priority `SCHOOL > ADMIT > SDN_PAGE > SDN_FORUM` (a 250-word
      Admit limit beats a 300-word SDN one for the same cycle); `lastCheckedAt` is the newest across the shown cycle's observations;
      a prompt with an `optional` observation from any source in the shown cycle is optional.
    - **purity:** the function does not mutate its input (deep-freeze the fixture).
  - `overlap.test.ts`: three schools: two share a `diversity` prompt, one has `why-school` only → groups ordered by `schools` desc
    then `THEME_IDS` order with `other` last; a prompt tagged `['growth','leadership']` appears in both groups; `shortestWords` and
    `longestWords` consider `WORDS` limits only (a `CHARS` limit is ignored; all-null limits give `null`); a school in `'not-yet'` state
    contributes its last-cycle prompts with `basis 'last-cycle'`; a school with no prompts lands in `withoutPrompts`; an item with
    programs `['PHD']` includes that school's REG **and** PHD prompts (R7), `['REG']` only REG; the same school given twice
    (REG then PHD) is one school in the group count, not two (Review Focus 8).
  - `boundary.test.ts`: no file under `ui/`, `app/routes/_site/rmh-medschool/` imports anything from `engine/secondaries/` except
    `cycle-ranges` and `theme-ids`; non-test files in `engine/secondaries/` import none of `d3-*`, `node:*`, `@prisma/*`, `zod`, `@/`.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/secondaries`.
- [ ] **Step 3: Implement** per D5. `buildSchoolView` per program: group observations by cycle; `current` = prompts with a 2027
      observation; `prev` = prompts with a `currentCycle - 1` observation restricted to the comparable sources (those with at least
      one current observation for this program); run `matchPrompts(prevOnly, currentNotInPrev)` once; assemble. Order prompts by
      the position of their first theme in `THEME_IDS`, then by text, with `gone` prompts last (the source's own order is not stored); the order is stable and the UI shows no rank.
- [ ] **Step 4: Run to pass,** plus the `tsc` command. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): secondary school view, year-over-year marks, cycle ranges and theme overlap (pure)`.

---

### Task 6: The Admit secondary-essays adapter and its host

**Files:**

- Create: `features/medschools/scrape/adapters/admit/secondaries.ts`, `secondaries.test.ts`,
  `__fixtures__/secondary-essays-harvard.html`, `secondary-essays-hostile.html`, `secondary-essays-empty.html`,
  `secondary-essays-changed.html`
- Modify: `features/medschools/scrape/sources.ts` (+ `sources.test.ts`)

**Interfaces:** produces:

```ts
// sources.ts
SOURCES.ADMIT_WEB: SourceConfig = { origin: 'https://med.admit.org', userAgent: MEDSCHOOLS_USER_AGENT, spacingMs: 3000, jitterMs: 1000,
  backfillSpacingMs: 3000, backfillJitterMs: 1000, maxConsecutiveFailures: 3, maxRetries: 3, retryAfterCapMs: 120_000, timeoutMs: 20_000 };
DAILY_REQUEST_BUDGETS.ADMIT_WEB = 700;                    // two runs a week of ~240 pages, plus robots and retries
export const ADMIT_SECONDARY_URL = (slug: string): string => `${SOURCES.ADMIT_WEB.origin}/secondary-essays/${slug}`;
// secondaries.ts
export class AdmitPageError extends Error {}               // shape not recognised
export const MAX_PER_SECTION = 40;
export function parseSecondaryEssaysPage(html: string, ctx: { currentCycle: number }): NormalizedPrompt[];   // sourceRef = the page URL is set by the caller
export function cycleLabelToEntryYear(label: string): number | null;   // "2024-2025" and "2024–25" -> 2025; a bare "2025" -> see Facts 2
```

- [ ] **Step 1: Write the failing tests** (fixtures are hand-built to the shape the endpoint inventory describes: one section per
      cycle headed by its label, one element per prompt, a word limit sometimes a separate element and sometimes inside the
      text, a "Chance %" element, MD-PhD prompts under their own heading; **replace the markup with a real capture before the
      adapter is relied on, see Facts 1**; keep the tests' assertions, change the fixture):
  - `secondary-essays-harvard.html` parses to the exact list of `{ cycleYear, program, text, limit, optional }` (assert the whole array
    with `toEqual`): several cycles, a REG prompt with `(250 words)` in the text, one with a separate limit element (the element wins),
    an optional prompt, an MD-PhD section giving `program 'PHD'`; the "Chance %" values appear nowhere in the output.
  - `cycleLabelToEntryYear`: `'2024-2025'`, `'2024–2025'`, `'2024-25'` → `2025`; `'2025'` → the value the Facts-2 check settles (the test
    pins whichever is verified, default entry year as written); `'Spring 2025'`, `''`, `'1999-2000'`, a label beyond `currentCycle + 0` → `null`
    (a section with a null cycle is skipped and counted).
  - `secondary-essays-hostile.html` (usernames, emails, avatar URLs, `@handles`, a comment block with a name and "I got this
    prompt in 2023" inside the page): the output's key set per element is exactly `cycleYear program text limit optional sourceRef`;
    `JSON.stringify(output)` contains none of the needles (`ADMIT_HOSTILE_NEEDLES` plus this fixture's); comment and discussion blocks
    are never read (only the prompt elements are selected).
  - `secondary-essays-empty.html` (page says no prompts on file) → `[]`; `secondary-essays-changed.html` (no recognisable section) and a
    section with more than `MAX_PER_SECTION` prompts both **throw `AdmitPageError`** (Review Focus 6); a page with a Cloudflare title is rejected
    earlier by `assertPage` (assert the guard is called by the caller, Task 9).
  - `sources.test.ts`: `ADMIT_WEB` spacing 3000 and jitter 1000, the budget is present, the origin differs from `ADMIT`'s API origin,
    `ADMIT_SECONDARY_URL('harvard-medical-school')` is `https://med.admit.org/secondary-essays/harvard-medical-school`.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/scrape/adapters/admit/secondaries.test.ts
      features/medschools/scrape/sources.test.ts`.
- [ ] **Step 3: Implement** with `node-html-parser` and the engine's `parsePromptText` / `classifyProgram`. Select prompt elements by
      structure, never by "everything under main"; run every text through `parsePromptText`; a structured limit element overrides the text
      limit. Extend `DAILY_REQUEST_BUDGETS`' key type (and the `hostBudget` call sites in Task 9).
- [ ] **Step 4: Run to pass,** plus `pnpm exec vitest run features/medschools/scrape/sources.test.ts` and the `tsc` command.
- [ ] **Step 5: Commit** — `feat(medschools): Admit secondary-essays page adapter and a polite med.admit.org host`.

---

### Task 7: The SDN essay-questions adapter

**Files:**

- Create: `features/medschools/scrape/adapters/sdn/parse-essays.ts`, `parse-essays.test.ts`,
  `__fixtures__/essays-columbia.html`, `essays-hostile.html`, `essays-empty.html`, `essays-changed.html`
- Modify: `features/medschools/scrape/adapters/sdn/urls.ts` (+ `urls.test.ts`), `sdn/index.ts`

**Interfaces:** produces:

```ts
export function essayQuestionsUrl(code: string, slug: string): string;   // https://www.studentdoctor.net/schools-database/medical-school/essay-questions/<code>/<slug>
export function parseEssayQuestionsPage(html: string, ctx: { currentCycle: number }): NormalizedPrompt[];   // throws SdnPageError on an unrecognised shape
```

- [ ] **Step 1: Write the failing tests** (same pattern as Task 6; the page is "Secondary prompts by cycle"; the SDN school
      database pages embed JSON in a script tag some of the time (`schools-database-data`, which the guard already treats as a
      site marker): the parser reads an inline JSON array when present and the visible list otherwise; **both paths are tested**; the
      fixtures are hand-built, replace with captures, Facts 1): `essays-columbia.html` gives the exact `NormalizedPrompt[]`; cycle
      labels map to entry years the same way as Task 6 (share one `cycleLabelToEntryYear`: move it to `engine/secondaries/text.ts`
      with its Task 6 test and import it from both adapters); hostile fixture (usernames, comments, avatar, an email in a prompt's
      footnote) leaves no needle (`SDN_HOSTILE_NEEDLES`) and the same key set; empty → `[]`; changed or over `MAX_PER_SECTION` → `SdnPageError`;
      `essayQuestionsUrl('123', 'columbia-university')` is exactly the URL above and uses `SOURCES.SDN_WWW.origin`.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/scrape/adapters/sdn`.
- [ ] **Step 3: Implement** (move `cycleLabelToEntryYear` and `MAX_PER_SECTION` to `engine/secondaries/text.ts`, re-export for Task 6).
- [ ] **Step 4: Run to pass,** plus `pnpm exec vitest run features/medschools/scrape/adapters features/medschools/engine/secondaries`
      and the `tsc` command.
- [ ] **Step 5: Commit** — `feat(medschools): SDN essay-questions page adapter`.

---

### Task 8: The store (dedupe, observations, checks, theme tags)

**Files:**

- Create: `features/medschools/scrape/secondaries-store.ts`, `secondaries-store.test.ts`
- Modify: `features/medschools/scrape/types.ts` (`MedPrisma` gains `medSecondaryPrompt.{findMany,create,update}`,
  `medSecondaryObservation.{findMany,create,update}`, `medSecondaryCheck.{findMany,upsert}`), `scrape/test-support.ts`
  (`createFakePrisma` implements them in memory: extend the fake, do not cast around the type)

**Interfaces:** consumes `NormalizedPrompt`, `secondaryKey`, `tagThemes`, `THEMES_VERSION`; produces:

```ts
export interface RecordResult { prompts: number; created: number; observed: number; unchanged: number; rejected: number }
export function recordPrompts(prisma: MedPrisma, input: { schoolId: string; source: PromptSource; now: Date; prompts: readonly NormalizedPrompt[]; siteCycle: number }): Promise<RecordResult>;
export function recordCheck(prisma: MedPrisma, input: { schoolId: string; source: PromptSource; now: Date; status: 'OK' | 'EMPTY' | 'UNAVAILABLE'; promptCount: number }): Promise<void>;
export function retagThemes(prisma: MedPrisma): Promise<number>;       // re-tags prompts whose themesVersion < THEMES_VERSION; returns the count
```

- [ ] **Step 1: Write the failing tests:**
  - A new prompt creates one `MedSecondaryPrompt` (key from `secondaryKey`, `themes` from `tagThemes`, `themesVersion` current) and one
    observation (`firstSeenAt` = `lastCheckedAt` = now, limit and optional stored). Recording the same input again is `unchanged`, writes no
    new rows and moves `lastCheckedAt` only (D1: **never double counts**). The same prompt from `ADMIT` then `SDN_PAGE` in one cycle gives one
    prompt row and two observations; reading its cycles (via `buildSchoolView`) gives one cycle.
  - Review Focus 4: the same prompt with a different limit/marker wording maps to one prompt; a changed limit updates the observation's limit
    (no new prompt). A newer cycle's wording replaces `text` (display); an older cycle's wording never overwrites a newer one.
  - Two inputs in one batch with the same key, cycle and source collapse to one observation (first wins). An empty key, an empty text, a
    `cycleYear` above `siteCycle` or below 2005, a text over `MAX_TEXT` after parsing: counted `rejected`, never written.
  - Idempotence across sources, programs and schools: the same text in `REG` and `PHD` is two prompts; in two schools two prompts.
  - **Observations are never deleted** (D9): after a second run with fewer prompts the missing prompt's observation row and its
    `lastCheckedAt` are unchanged.
  - Anonymization: the fake's recorded writes for a hostile batch (needles in `sourceRef` such as a post permalink, a `?user=` query) —
    `recordPrompts` accepts `sourceRef` only if it is `https:` and has no query string, no fragment and no userinfo, else stores `null`
    (so a post permalink can never ride in); no write contains a needle.
  - `recordCheck` upserts on `(schoolId, source)`; `retagThemes` re-tags only older versions and is idempotent.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/scrape/secondaries-store.test.ts`.
- [ ] **Step 3: Implement.** Load the school's prompts once per call (`findMany where schoolId`), key them in a `Map`, write sequentially (no
      transaction needed: every write is an idempotent upsert-shaped create/update).
- [ ] **Step 4: Run to pass,** plus `pnpm exec vitest run features/medschools/scrape` and the `tsc` command.
- [ ] **Step 5: Commit** — `feat(medschools): secondary prompt store (dedupe by key, observation per cycle and source, never double counted)`.

---

### Task 9: The `medschools.secondaries` job and its wiring

**Files:**

- Create: `features/medschools/scrape/run-secondaries.ts`, `run-secondaries.test.ts`
- Modify: `server/medschools-worker/index.ts`, `server/medschools-worker/wiring.test.ts`, `.env.example`, `server/CLAUDE.md`

**Interfaces:** consumes the adapters, the store, `closeStaleRuns`, `lastRealRunWithin`, `recordAliasMiss`, `pickWalkTargets`, `assertPage`,
`siteCycle`-equivalent (`resolveCycleYear` / `cycleYearOf(now, 'SECONDARY')`; use what `run-forecast.ts` uses); produces:

```ts
export const SECONDARIES_CRON = '35 5 * * 0,3';                 // Sunday and Wednesday, 05:35 UTC (no model is used, so peak does not matter)
export const SECONDARIES_MIN_INTERVAL_MS = 60 * 3_600_000;       // a non-manual run inside 60 h of a real one is skipped
export const SECONDARIES_FRESH_MS = 3 * 86_400_000;              // a school x source checked inside 3 days is skipped
export interface SecondariesDeps { prisma: MedPrisma; admitHost: PoliteHost; sdnHost: PoliteHost; shouldStop(): boolean; log: Logger; now?: () => Date; maxRequestsPerPass?: number; deadlineMs?: number }
export interface PassCounters { schools: number; fetched: number; fresh: number; unavailable: number; empty: number; failed: number; prompts: number; created: number; rejected: number; misses: number; requests: number }
export interface SecondariesSummary { status: 'OK' | 'PARTIAL' | 'FAILED'; outcome: 'ran' | 'skipped-min-interval'; admit: PassCounters; sdn: PassCounters; durationMs: number }
export function runSecondaries(deps: SecondariesDeps, opts: { trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP' }): Promise<SecondariesSummary>;
```

Two passes in one run (Admit then SDN), each with its own `MedSourceRun` row (`source 'ADMIT'` and `'SDN'`, `job 'secondaries'`) so
`lastRealRunWithin` is per source. Targets are each pass's aliases (Admit: `ADMIT` aliases by slug; SDN: the `summary:<CODE>/<slug>` keys
`run-sdn-interviews.ts` walks, via `parseSummaryKey`) for active schools, **stalest check first** (never-checked first), skipping those
fresher than `SECONDARIES_FRESH_MS`.

- [ ] **Step 1: Write the failing tests** (in-memory fake, `createFakeHost`, fixtures from Tasks 6-7):
  - A first run on an empty database fetches each target once, writes prompts and observations, writes one `MedSecondaryCheck` per school x
    source (`OK`), ends `OK`; a **second `MANUAL` run the same day** is all `fresh` (zero requests); with `now` three days later it refetches.
  - Order and politeness: targets are walked stalest-first; the fake host records **one request at a time**, the host config used is
    `SOURCES.ADMIT_WEB` for Admit and `SOURCES.SDN_WWW` for SDN (assert the config objects passed in `wiring.test.ts`), every response goes through `assertPage` (a
    Cloudflare 200 page counts a failure on the session and three halt the pass; the run is `PARTIAL`, the other pass still runs).
  - Review Focus 6: a school with stored Admit observations whose page now parses to zero prompts or throws `AdmitPageError` gets check status
    `UNAVAILABLE`, its stored rows are byte-identical afterwards, and the run is `OK`; a school with no stored observations and an empty page is `EMPTY`.
  - `404` on a page is `EMPTY`/unavailable, not a failure; a 429 with `Retry-After` is honoured by the host (covered by `http.test.ts`; here only that the
    job treats `SourceHaltedError` and `BudgetExhaustedError` as `PARTIAL` and stops the pass).
  - An unknown Admit slug is one alias miss per slug per run (`recordAliasMiss`); an inactive school is skipped.
  - Min interval: a `CRON` run inside 60 h of an OK run is `skipped-min-interval` with zero requests; `MANUAL` bypasses it; a ledger read error fails closed (skipped).
  - `shouldStop` true after the first school ends `PARTIAL` and leaves the rest; `maxRequestsPerPass` is a hard cap; the deadline is honoured.
  - Anonymization: with hostile fixtures served for every page, no write, `log.*` argument or `MedSourceRun.stats` contains a needle; `stats` holds counters only.
  - Text pins: `run-secondaries.ts` imports no `lib/ai`, contains no `fetch(` (all I/O is through the hosts) and no `dedupeHash` (no secret is needed).
  - `wiring.test.ts` (same style as the sdn-interviews pins): `const SECONDARIES_QUEUE = 'medschools.secondaries'`, an expiry constant of `75 * 60`,
    `secondariesTick = guarded('secondaries', …, SECONDARIES_EXPIRY_S * 1000)`, `queue: SECONDARIES_QUEUE, cron: secondariesCron`, `expireInSeconds`,
    `retryLimit: 0`, `handler: secondariesTick`, `secondariesConsumer?.pause()`, `process.env.MEDSCHOOLS_SECONDARIES_CRON?.trim() || SECONDARIES_CRON`,
    the `ADMIT_WEB` host built with `createPoliteHost(SOURCES.ADMIT_WEB, { budget: hostBudget('ADMIT_WEB') })`, a switch `MEDSCHOOLS_SECONDARIES_ENABLED` (also behind
    the Admit and SDN source flags for their pass), and `.env.example` names `MEDSCHOOLS_SECONDARIES_CRON`, `MEDSCHOOLS_SECONDARIES_ENABLED`,
    `MEDSCHOOLS_ADMIT_WEB_DAILY_REQUESTS`.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/scrape/run-secondaries.test.ts server/medschools-worker`.
- [ ] **Step 3: Implement** the job, the worker tick (next to `sdnInterviewsTick`; `shouldStop: stopAfter(SECONDARIES_EXPIRY_S * 1000 - 60_000)`; it runs `retagThemes`
      first, a no-op when current), the new host with its daily budget, the "Started" log line and the shutdown `pause()`. `server/CLAUDE.md`: a paragraph beside the
      interviews one (queue, cron, expiry, hosts and budgets, min interval, no model).
- [ ] **Step 4: Run to pass,** plus the `tsc` command. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): medschools.secondaries job (Admit and SDN pages, polite, persisted interval, no model)`.

---

### Task 10: SDN forum prompts (off-peak model call, own budget share)

**Files:**

- Create: `features/medschools/scrape/sdn/secondaries.ts`, `secondaries.test.ts`, `features/medschools/scrape/secondaries-budget.ts`,
  `secondaries-budget.test.ts`, `__fixtures__` additions under `scrape/sdn/` as needed (reuse `thread-challenge.html` and `thread-hostile.html`; add `thread-secondary-prompts.html`)
- Modify: `features/medschools/scrape/sdn/process-thread.ts` (+ test), `server/medschools-worker/index.ts`, `wiring.test.ts`, `.env.example`

**Interfaces:** consumes `SdnAi`, `ExtractPost`, `BudgetGate`, `scrubForumPrompt`, `parsePromptText`, `classifyProgram`, `recordPrompts`; produces:

```ts
// sdn/secondaries.ts
export const SECONDARY_POST_PREFILTER: RegExp;          // /secondar|2ndary|essay prompt|prompts?\b|word limit|characters/i, applied to the already-redacted post text
export const promptsSchema: z.ZodType<{ prompts: { postRef: number; text: string; program?: 'REG'|'PHD'; }[] }>;   // strict; text 20..600; at most 8 per post
export interface PromptSink {
  wants(post: ExtractPost): boolean;                                       // the prefilter
  extract(posts: ExtractPost[], ctx: { cycleYear: number; schoolId: string; threadUrl: string; containsHandle(t: string): boolean }): Promise<{ stored: number; rejected: number; llmCalls: number }>;
}
export function createPromptSink(deps: { ai: SdnAi; budget: BudgetGate; prisma: MedPrisma; now(): Date; siteCycle: number }): PromptSink;
// secondaries-budget.ts
export const SECONDARIES_PROMPT_ID = 'medschools-extract:secondaries';
export const DEFAULT_SECONDARIES_AI_SHARE = 0.1;
export function secondariesAiShare(env: string | undefined, warn?: (l: string) => void): number;   // blank 0.1; invalid fails closed to 0 with a warning
export function createSecondariesBudgetGate(prisma: MedPrisma, now: () => Date, capUsd: number, share: number): BudgetGate;
// process-thread.ts: ThreadDeps gains `prompts?: PromptSink`; absent = behaviour byte-identical to today
```

The sink is a **second call on the same chunk** the event extractor just read (so no extra request to SDN), at the same off-peak moment (the live job
already reads only off-peak: `isDeepseekPeak`), counted in the run's `maxLlmCalls`. Quotes are already stripped and text already redacted
(`redactForModel`) when the chunk reaches it. The model is told to return only prompts that are **the school's secondary-application essay questions quoted
as text**, never an applicant's answer or commentary. Every returned string goes through `scrubForumPrompt` then `parsePromptText`; `sourceRef` is
`threadUrl` (`canonicalThreadUrl`); the observation's `cycleYear` is the thread's, `source` is `SDN_FORUM`.

- [ ] **Step 1: Write the failing tests:**
  - `promptsSchema` accepts a valid answer and rejects (strict) an extra key, a `text` under 20 or over 600 chars, more than 8 per post, a non-integer `postRef`.
  - `createPromptSink` against a faked `SdnAi`: posts that fail the prefilter are not sent; a good model answer stores prompts as `SDN_FORUM` observations with
    `sourceRef` equal to the thread URL; a model answer containing an email, a URL, a handle, "Dr. Smith", a first-person narrative or a quote is **rejected**
    (`rejected` counted, nothing stored) — one hostile string each (Review Focus 5); a malformed JSON answer is one retry then a counted drop, never a throw;
    the user turn sent to the model contains no author, id or post hash (assert on the captured `ai.run` argument with the hostile fixture's needles).
  - Budget: `secondariesAiShare(undefined)` is `0.1`, `'0.2'` is `0.2`, `'x'`, `'2'`, `'-1'` are `0` with a warning; the gate allows a call only while the month's total
    `medschools-extract` spend is under the cap **and** `medschools-extract:secondaries` spend is under `cap * share`, and returns `false` on a ledger read error
    (copy `admit-forums-budget.test.ts`).
  - `process-thread.test.ts`: with `prompts` absent every existing assertion is unchanged; with it present and a `thread-secondary-prompts.html` page, prompts are stored
    once, the event extraction's counters are unchanged, `state.llmCalls` includes the sink's calls, a `paused-cap` / `paused-budget` outcome stops the sink too, and at
    DeepSeek peak the sink makes **no** model call (use the injected clock at a peak hour; the thread still advances only as the existing code does).
  - `wiring.test.ts`: `createSdnAi(SECONDARIES_PROMPT_ID)` is called once, the sink is only created when `MEDSCHOOLS_SECONDARIES_FORUM_ENABLED !== 'false'`, the gate is built
    with `secondariesAiShare(process.env.MEDSCHOOLS_SECONDARIES_AI_SHARE, …)` and the **same** `capUsd` the other scrape gates get (the scrape share, so phase 6's Q&A reservation
    is respected), and `.env.example` names both variables.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/scrape/sdn features/medschools/scrape/secondaries-budget.test.ts server/medschools-worker`.
- [ ] **Step 3: Implement.** Find the chunk loop in `process-thread.ts` (around the `for (const chunk of chunkPosts(survivors))` call, and the per-post retry path) and call the sink
      **after** the event extraction of a chunk succeeded and its results were committed, so a sink failure can never lose events or move the cursor. The sink prompt is a
      new registry prompt (copy how `MEDSCHOOLS_EXTRACT` is declared; version it). `createSdnAi(SECONDARIES_PROMPT_ID)` meters the calls under the label.
- [ ] **Step 4: Run to pass,** plus `pnpm exec vitest run features/medschools/scrape server/medschools-worker` (the existing SDN suites unchanged) and the `tsc` command.
- [ ] **Step 5: Commit** — `feat(medschools): SDN forum secondary prompts (off-peak, own 10% AI share, reject-not-redact)`.

---

### Task 11: The public endpoint and the admin entry

**Files:**

- Modify: `features/medschools/medschools.contract.ts`, `api/read-schemas.ts`, `engine/public-read.ts` (`SchoolTab`, `SCHOOL_TABS`), `engine/search.ts`
  (+ tests), `api/read.server.test.ts`, `api/read-routes.server.test.ts`
- Create: `features/medschools/api/secondaries.server.ts`, `secondaries.server.test.ts`, `medschools.schools.$slug.secondaries.server.ts`,
  `secondaries-admin.server.ts`, `admin.medschools.secondaries.server.ts`; regenerate `lib/api/route-table.server.ts` (`pnpm api:routes`)

**Interfaces:** produces (client-safe, in the contract file):

```ts
export type MedPromptSourceId = 'ADMIT' | 'SDN_PAGE' | 'SDN_FORUM' | 'SCHOOL';
export interface MedSecondaryPromptDto {
  id: string; text: string; limit: { kind: 'WORDS' | 'CHARS'; value: number } | null; optional: boolean; themes: string[];
  status: 'same' | 'reworded' | 'new' | 'gone' | 'last-cycle' | null; previousText: string | null;
  cycles: number[];                         // entry years, ascending: the UI formats them (formatCycleRanges)
  sources: MedPromptSourceId[]; lastCheckedAt: string;     // ISO instant
}
export interface MedSchoolSecondariesRes {
  cycleYear: number;                         // siteCycle
  groups: { program: 'REG' | 'PHD'; state: 'current' | 'not-yet'; shownCycle: number; comparedWith: number | null; prompts: MedSecondaryPromptDto[] }[];
  sources: { source: MedPromptSourceId; url: string | null; checkedAt: string | null }[];   // school-level attribution, newest check per source
}
export const getMedSchoolSecondariesApi = endpoint<{ query: { program?: MedProgramFilter | undefined }; res: MedSchoolSecondariesRes }>()(
  { method: 'GET', path: '/api/medschools/schools/$slug/secondaries' });
export const postMedSecondariesAdminApi = endpoint<{ body: { schoolId: string; program: 'REG' | 'PHD'; cycleYear: number; sourceUrl: string;
  prompts: { text: string; limitKind?: 'WORDS' | 'CHARS'; limitValue?: number; optional?: boolean }[] }; res: { prompts: number; created: number; rejected: number } }>()(
  { method: 'POST', path: '/api/admin/medschools/secondaries' });
// secondaries.server.ts
export function getSchoolSecondaries(slug: string, q: { program: MedProgramFilter }, now?: Date): Promise<MedSchoolSecondariesRes | null>;   // null -> 404
// secondaries-admin.server.ts
export function recordSchoolPrompts(prisma: MedPrisma, body: AdminBody, now: Date): Promise<{ prompts: number; created: number; rejected: number }>;
// engine: SCHOOL_TABS = ['activity','history','forecast','interviews','secondaries']
```

- [ ] **Step 1: Write the failing tests.**
  - `secondaries.server.test.ts` (fake Prisma): a school with REG prompts in 2026 and 2027 returns one `current` group with `cycles`, `status`, `sources`, limit and
    optional as built by `buildSchoolView`; `program=PHD` returns only the PHD group; `program=ALL` and absent return both (REG first); a school with PHD prompts and no
    REG prompts returns only the PHD group (no empty heading); a not-yet cycle returns `state 'not-yet'` with `shownCycle` last cycle's and every status `last-cycle`; a
    school with no prompts at all returns `groups: []` and still the `sources` rows that exist (a `MedSecondaryCheck` with `EMPTY` shows "checked, nothing found");
    `sources[].url` is `ADMIT_SECONDARY_URL(slug)` for `ADMIT` (from the school's Admit alias), `essayQuestionsUrl` for `SDN_PAGE`, a thread URL for `SDN_FORUM`, the stored
    `sourceRef` of the newest observation for `SCHOOL`; an unknown or inactive slug is `null`. Explicit `select` everywhere; the response contains none of `key`,
    `themesVersion`, `dedupeHash`, `userId` and each DTO's key set is pinned.
  - `read-routes.server.test.ts`: two requests with different cookies return identical bodies; `Cache-Control: public, max-age=300, s-maxage=900, stale-while-revalidate=3600`;
    404 for a bad slug; 400 for `program=BOGUS`; the registered module resolves to exactly one wrapped handler (`lib/api/__tests__/route-table.test.ts` stays green).
  - Admin: unauthenticated and non-admin are 401/403; a valid body writes `SCHOOL` observations for that school and program with `sourceRef = sourceUrl`; `sourceUrl` must be
    `https:`, at most 500 chars, no userinfo (a `javascript:` or `http:` URL is 400); `prompts` max 40; text over 1500 is rejected, a limit parsed from the text is used when none is
    given; an unknown `schoolId` is 404; the endpoint **never fetches** the URL (assert no `fetch`/host call; it is stored text).
  - `search.test.ts`: `?tab=secondaries` parses and an unknown tab falls back to `activity`; `SCHOOL_TABS` order pinned.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/api features/medschools/engine/search.test.ts`.
- [ ] **Step 3: Implement.** `getSchoolSecondaries` reads the school, its prompts and observations (one `findMany` with a nested `select`; or two flat reads if the fake needs them),
      the three `MedSecondaryCheck` rows and `siteCycle`; shapes through `buildSchoolView`; filters programs. Module cache as above. Run `pnpm api:routes`.
- [ ] **Step 4: Run to pass,** plus `pnpm api:routes:check` and the `tsc` command. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): public school secondaries endpoint (user-independent, cached) and admin entry for a school's own prompts`.

---

### Task 12: The overlap endpoint (me/**)

**Files:**

- Modify: `features/medschools/medschools.contract.ts`, `api/me-schemas.ts`, `api/medschools.queries` consumers as needed
- Create: `features/medschools/api/secondaries-overlap.server.ts`, `secondaries-overlap.server.test.ts`, `medschools.me.secondaries.overlap.server.ts`;
  regenerate `lib/api/route-table.server.ts`

**Interfaces:** produces:

```ts
export interface MedSecondaryOverlapRes {
  cycleYear: number; source: 'list' | 'tracker';
  groups: { theme: string; schools: number; shortestWords: number | null; longestWords: number | null;
    entries: { slug: string; schoolName: string; program: 'REG' | 'PHD'; promptId: string; text: string;
      limit: { kind: 'WORDS' | 'CHARS'; value: number } | null; optional: boolean; basis: 'current' | 'last-cycle' }[] }[];
  withoutPrompts: { slug: string; name: string }[];
  schoolCount: number;
}
export const getMedSecondaryOverlapApi = endpoint<{ query: { source: 'list' | 'tracker'; list?: string | undefined }; res: MedSecondaryOverlapRes }>()(
  { method: 'GET', path: '/api/medschools/me/secondaries/overlap' });
// secondaries-overlap.server.ts
export function getOverlap(userId: string, q: { source: 'list'; list: string } | { source: 'tracker' }, now?: Date): Promise<MedSecondaryOverlapRes | 'not-found'>;
```

`source=list` reads the caller's own list items (`schoolId`, `program ANY|REG|PHD`); `source=tracker` reads the caller's applications of the **current tracker
cycle** (`cycleYearOf(now, 'SECONDARY')`). Item program mapping: `ANY` and `REG` → `['REG']`, `PHD` → `['PHD']` (the view adds REG for a PHD item, R7). Reads are flat (the
phase 4 note: no nested relation filter in the tracker service). Inactive schools are dropped (not listed).

- [ ] **Step 1: Write the failing tests** (Review Focus 8 and 9):
  - A list with three schools gives the grouped result of `buildOverlap` for exactly those schools; `schoolCount` counts distinct schools; a school with no prompts is in
    `withoutPrompts`; an inactive school appears nowhere; an empty list returns empty `groups` (200, not an error); a 200-item list works (cap) and makes **one** read of
    prompts for the school set, not one per school (count calls on the fake).
  - **Ownership:** another member's list id is `'not-found'` → 404 (identical to a nonexistent id: no oracle); the tracker source reads only the caller's cycle rows; a member with
    no application this cycle gets an empty 200.
  - The same school as REG and PHD items is one school; a PHD item includes REG and PHD prompts, each labelled by `program`.
  - Route: unauthenticated is 401; **no `Cache-Control: public`** and no `cache` option on the handler; `source=list` without `list` is 400; the response key set is pinned and contains no
    `userId`, list name, note, item id or position (it carries only schools the member sent, by slug and name).
  - It never reads another member's rows: the fake records every `where`; every one that touches `medSchoolList*` or `medTracker*` carries the caller's `userId` (directly or through the
    list owner check).
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/api/secondaries-overlap.server.test.ts`.
- [ ] **Step 3: Implement** with `READ_LIMIT` and `auth: 'required'`; reuse `getSchoolViews(schoolIds, now)` factored out of Task 11's service so the public tab and the overlap build the same
      `SchoolView` (D8). Run `pnpm api:routes`.
- [ ] **Step 4: Run to pass,** plus `pnpm api:routes:check` and the `tsc` command.
- [ ] **Step 5: Commit** — `feat(medschools): pre-write essay overlap endpoint for a member's list or tracker (private, uncached)`.

---

### Task 13: The Secondaries tab

**Files:**

- Modify: `medschools.queries.ts` (`secondariesQuery(slug, { program })`, loader prefetch for `tab === 'secondaries'`), `ui/SchoolPage.tsx` (label, one switch
  branch, same controls row as the Forecast tab), `ui/school-page.test.tsx`
- Create: `ui/SecondariesTab.tsx`, `ui/secondaries/{SecondaryPromptRow,CycleRange,labels}.tsx`, `ui/secondaries/secondaries.test.tsx`

**Interfaces:**

```ts
// CycleRange.tsx: <bdi dir="ltr">{formatCycleRanges(cycles)}</bdi>
export function CycleRange(p: { cycles: readonly number[] }): JSX.Element;
// SecondaryPromptRow.tsx: presentational; takes a MedSecondaryPromptDto plus pre-formatted strings; fetches nothing
export function SecondaryPromptRow(p: { prompt: MedSecondaryPromptDto; labels: SecondaryLabels; checkedOn: string; showStatus: boolean }): JSX.Element;
// SecondariesTab.tsx
export function SecondariesTab(p: { slug: string; detail: MedSchoolDetailDto; search: SchoolSearch; programControl: ReactNode }): JSX.Element;
// labels.tsx: one switch per label family so i18next-parser finds literal keys
export function useSecondaryLabels(): SecondaryLabels;     // status, theme(id), limit(kind,value), optional, cycles
```

Layout (Steel): per program a `t-heading` ("Regular prompts" / "MD-PhD prompts") and, for PHD, a `t-meta` line ("These are in addition to or instead of the regular prompts. Check
the school's instructions."); each prompt is a **row on a rule** (R3): the text in `t-body`; beneath it one `t-meta` line: limit ("250 words", mono), "Optional" when true, the
status word when `showStatus`, "Seen in <CycleRange>", themes joined with " · "; a reworded prompt adds a `t-meta` line "Last cycle: {{text}}"; sources as "Source: Admit.org · Student
Doctor Network" and "Checked {{date}}" (`formatUtcDay`). School-level attribution lines (one per `sources` entry, linked where `url` is not null) sit under the list. A `not-yet` group shows
one `t-meta` line ("This cycle's prompts are not out yet. These are from the {{cycle}} cycle.") and hides status words; a first-year school (all statuses `null`) shows no status words; a
`comparedWith` line ("Compared with the {{cycle}} cycle.") sits under the group heading. The cycle convention note ("Cycles are named by the year of entry: 2027 is the 2026–2027
application cycle.") is one `t-meta` line under the list. Empty: `EmptyState` ("No secondary prompts on file for this school yet."). `SkeletonSwap` while loading, fades through `arrive.tsx`.
The program control is the existing `ProgramToggles` passed as `programControl`. Nothing here stores a draft; there is no text input anywhere on the tab.

- [ ] **Step 1: Write the failing tests** (SSR-string and testing-library, the style of `school-page.test.tsx` and `charts.test.tsx`):
  - `SecondaryPromptRow` renders the text, the limit "250 words" (and "1,500 characters" via `Intl`), "Optional" only when true, the cycle range inside `<bdi dir="ltr">` with an en dash, the
    status word per status and **none** for `null`, "Last cycle:" only for `reworded`; no `<input>`, `<textarea>` or `contenteditable` anywhere in the tab (the no-drafts rule is a test).
  - Steel: the markup has no `rounded-*` box around a row, no raw palette class, no `shadow`, no `bg-gradient`; the file passes `ui-rules.test.ts`, `steel-flat.test.ts` and
    `design-consistency.test.ts` unchanged (run them).
  - `school-page.test.tsx`: the tab strip has five tabs in the new order; selecting Secondaries writes `?tab=secondaries`; the server render of the loaded page contains the first prompt text
    with scripting off (the loader prefetch ran); `program=PHD` shows the PHD heading and its note; a `not-yet` response shows the note and no status words; an empty response shows the empty state;
    the tab makes no request for a signed-out viewer beyond the public one.
  - `labels`: every theme id in `THEME_IDS` has a label (iterate, assert non-empty and distinct); `secondaries-status-gone` reads "Not seen this cycle" (R5).
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/ui`.
- [ ] **Step 3: Implement.** Keys: `school-tab-secondaries`, `secondaries-title`, `secondaries-group-reg|phd`, `secondaries-phd-note`, `secondaries-status-same|reworded|new|gone|last-cycle`,
      `secondaries-previous`, `secondaries-limit-words|chars` (`_one`/`_other`), `secondaries-optional`, `secondaries-seen`, `secondaries-sources`, `secondaries-checked`,
      `secondaries-not-yet`, `secondaries-compared`, `secondaries-cycle-note`, `secondaries-empty`, `secondaries-load-failed`, `secondaries-theme-<id>` for each of the thirteen themes. Run `pnpm i18n:extract`
      and read `locales/en/medschools.json`.
- [ ] **Step 4: Run to pass,** plus the `tsc` command and `pnpm exec vitest run features/medschools/ui/ui-rules.test.ts lib/__tests__/steel-flat.test.ts lib/__tests__/design-consistency.test.ts`.
      Rough look: `pnpm dev`, `/rmh-medschool/<slug>?tab=secondaries` at 390 and 1280, Day and Night.
- [ ] **Step 5: Commit** — `feat(medschools): Secondaries tab (prompts by program, limits, cycles seen, year-over-year marks)`.

---

### Task 14: The overlap view on lists and tracker

**Files:**

- Modify: `medschools.queries.ts` (`overlapQuery({ source, list })`), `ui/lists/ListSection.tsx`, `ui/tracker/TrackerPage.tsx`, `ui/lists/lists-page.test.tsx`,
  `ui/tracker/tracker-page.test.tsx`
- Create: `ui/secondaries/OverlapView.tsx`, `overlap-view.test.tsx`

**Interfaces:**

```ts
// OverlapView.tsx: presentational. The caller owns the query and the open state.
export function OverlapView(p: { data: MedSecondaryOverlapRes; labels: SecondaryLabels; schoolHref(slug: string): string }): JSX.Element;
```

Placement: each list in the lists page gets a native `<details>` "Essay overlap" (opened by the member; the query is enabled only when open, so a closed disclosure costs no request); the tracker page
gets the same section for the current cycle. No new route (so no Open Graph card is added: `lib/__tests__/og-page-coverage.test.ts` is unaffected, verify). Layout: per theme a `t-heading` ("Diversity ·
4 schools"), then rows on rules: school name (link to its `?tab=secondaries&program=…`), the prompt text, limit/optional `t-meta`, and "From last cycle" when `basis 'last-cycle'`; a `t-meta` line "Shortest
limit: 250 words. Writing to that limit covers all {{n}}." when `shortestWords` is set and the group has two or more schools; groups with one school are collapsed under "Asked by one school" (a
`<details>`); `withoutPrompts` is one `t-meta` list "No prompts found yet: …". No text field anywhere.

- [ ] **Step 1: Write the failing tests:** groups render in the response order with their school counts via `Intl.PluralRules` keys (`overlap-schools_one|_other`); a two-school group shows the shortest
      limit line and a one-school group is inside the collapsed "Asked by one school"; `last-cycle` entries say so; `withoutPrompts` renders the names; an empty response shows
      `overlap-empty`; the lists page makes **no** overlap request until the disclosure opens (assert on the fake client) and one when it does, with `list=<id>`; the tracker section uses
      `source=tracker`; no `<input>`, `<textarea>`; Steel greps stay green; the `ar` render keeps the school names and limits in order with `dir="ltr"` islands for numbers and cycle text.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/ui/secondaries features/medschools/ui/lists features/medschools/ui/tracker`.
- [ ] **Step 3: Implement.** Keys `overlap-title`, `overlap-open`, `overlap-theme-<id>` reuse `secondaries-theme-*`, `overlap-schools` (`_one|_other`), `overlap-shortest`, `overlap-single`, `overlap-last-cycle`,
      `overlap-none-found`, `overlap-empty`, `overlap-load-failed`. `pnpm i18n:extract`.
- [ ] **Step 4: Run to pass,** plus the `tsc` command and the Steel suites from Task 13.
- [ ] **Step 5: Commit** — `feat(medschools): essay overlap view on lists and tracker (groups prompts by theme across a member's schools)`.

---

### Task 15: Black-box tests and the seeded visual pass

**Files:**

- Modify: `testing/integration/medschools-public.test.ts`, `testing/integration/medschools-private.test.ts`, `testing/integration/lib/medschools-fixture.ts`,
  `scripts/medschools/seed-visual.ts`, `scripts/medschools/visual-check.mjs`

- [ ] **Step 1: Public black box** (the test writes its own fixture school and prompts through `recordPrompts`; CI's database is empty): `GET …/secondaries` has the pinned key set; a fixture with
      2026 and 2027 observations shows `same`/`reworded`/`new`/`gone` as built, `cycles` as integers; before any 2027 observation it is `not-yet` with `last-cycle`; the same URL with and without a
      session cookie is byte-identical; unknown and inactive slugs are 404; the body contains none of `key`, `themesVersion`, `userId`; `?tab=secondaries` server HTML contains a prompt's text and "Source:"
      with scripting off; the admin endpoint is 401 for anonymous, 403 for a normal user, and works for the fixture admin (then the prompt appears in the public response).
- [ ] **Step 2: Private black box** (alice, bob): alice's list with two fixture schools returns the overlap with a shared `diversity` group of 2; bob asking for alice's list id is 404 (same body as an unknown
      id); anonymous is 401; no response has a public cache header; bob's response never contains alice's list name or notes; the tracker source returns alice's current-cycle schools only.
- [ ] **Step 3: Seed and visual:** `seed-visual.ts` writes a school with two cycles of REG and PHD prompts (same, reworded, new, gone, an optional one, a CHARS limit, a gap in the years), a not-yet school, a
      first-year school, and a three-school list for alice (scratch DB only; the script's refusal rule stays). `visual-check.mjs` adds the Secondaries tab (current, not-yet, empty, PHD) and the overlap disclosure
      on lists and tracker at 320x568, 390x844, 844x390, 768x1024, 1024x600, 1280x800, 1920x1080, 2560x1080 in Day and Night plus `ar` at 390 and 1280; it asserts no sideways scroll, text at least 11 px below 1024,
      44 px controls on touch, `dir=rtl` in `ar` with the cycle ranges still reading left to right, no `<textarea>` on any of these pages. Set the appearance through `PUT /api/preferences/appearance`
      before the Night pass (the note in `features/medschools/CLAUDE.md`).
- [ ] **Step 4: Run:** `pnpm exec vitest run features/medschools server/medschools-worker`, then the integration suite as phase 5 Task 15 did (`pnpm test:integration` against a throwaway Postgres with
      `MEDSCHOOLS_DEDUPE_SECRET` set), then the visual script against `pnpm dev` with the scratch seed. Expected: PASS; screenshots read by eye in both editions (a green gate is not "looks right").
- [ ] **Step 5: Commit** — `test(medschools): secondaries black-box tests and seeded visual pass`.

---

### Task 16: Budget, docs, final gate

**Files:**

- Modify: `scripts/check-bundle-budget.ts` (only as measured), `features/medschools/CLAUDE.md`, `server/CLAUDE.md` (confirm Task 9 and 10 paragraphs), `docs/plans/2026-11-11-steel-design-implementation.md`
  §18 (the D13 row: one sentence naming the Secondaries tab; **not answered**), `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md` (§7 model list, §14 a status line),
  `docs/superpowers/plans/2026-11-23-rmh-medschool-roadmap.md` (item 2 plan status), `docs/_generated/facts.json`, `locales/en/medschools.json`, `.env.example`

- [ ] **Step 1: Measure** as phase 5 Task 16: baseline on `main` in a second worktree, then the branch (`pnpm build:frontend`, `pnpm exec tsx scripts/check-bundle-budget.ts --json`,
      `pnpm build:frontend:sourcemap`, `pnpm exec tsx scripts/check-entry-composition.ts --strict`). Record `siteCssBrotli`, `entryRaw`, `criticalPathRaw`, `criticalPathBrotli` and the delta. Expect no entry growth
      (the tab is in the lazy page chunk; `engine/secondaries/boundary.test.ts` holds the client import rule).
- [ ] **Step 2:** Replace arbitrary-value utilities with existing classes if the site CSS grew; raise a budget line only by the measured remainder with a dated comment; change nothing if nothing exceeds.
- [ ] **Step 3: Docs.** `features/medschools/CLAUDE.md`: a "Secondaries (owner 2026-11-23)" section: the tab and its endpoint (the public endpoint count is now eight plus `secondaries`), the model (D1-D9
      with the constants: key rules, `SIM_REWORDED` 0.5, the five statuses and why "gone" is worded "Not seen this cycle", themes by rules and `THEMES_VERSION`), the sources and what each exposes (Admit
      secondary-essays page, SDN essay-questions page, SDN forum posts via the sink, the school's own page by admin entry only), politeness and budgets (`ADMIT_WEB`, the job, the interval), the AI share
      (`medschools-extract:secondaries`, 10%, off-peak), **no drafts are stored**, the overlap endpoint under `me/**`, and that turnaround is deferred and why (R9). Spec §7 model list and §14 status
      line; roadmap table. `pnpm i18n:extract`, check every `secondaries-` and `overlap-` key landed and the earlier ones stayed; `pnpm facts:generate`.
- [ ] **Step 4: Final gate.** `pnpm check:consistency --base main`, `pnpm test`, the `tsc` command above, `pnpm lint`, `pnpm exec tsx scripts/check-bundle-budget.ts`,
      `pnpm exec tsx scripts/check-entry-composition.ts --strict`, `pnpm api:routes:check`, `pnpm images:variants:check`. Expected: all green, no new warnings.
- [ ] **Step 5: PR lines:** the migration (three tables and three enums, additive), the new queue and cron (`medschools.secondaries`, Sun and Wed 05:35 UTC), the new host `med.admit.org` with its daily
      budget, the new env variables (`MEDSCHOOLS_SECONDARIES_ENABLED`, `…_CRON`, `…_FORUM_ENABLED`, `…_AI_SHARE`, `MEDSCHOOLS_ADMIT_WEB_DAILY_REQUESTS`), "one extra off-peak model call on SDN posts that pass a
      prefilter, capped at 10% of the scrape share", "no private drafts stored", the first run's request count (about 240 Admit pages and 240 SDN pages at 3-3.5 s), "merge only on green CI".
- [ ] **Step 6: Commit** — `docs(medschools): secondaries documentation, budget record and the Steel gap note`.

---

## Self-review (against the brief and the spec; fixes applied above)

- **Brief coverage:** prompts per school split by program (D7, Tasks 2, 5, 11, 13); limit, optional, cycle years as ranges computed from per-cycle observations (D1, D3, Task 5 `formatCycleRanges`, Task 13);
  no private drafts (Task 1 column pin, Task 13 no-input test, Global Constraints); year-over-year same / reworded / new / gone with a pure-TS similarity (D4, D5, Task 4, 5); pre-write overlap by theme with the
  theme method justified (D6, R1, Tasks 4, 5, 12, 14); turnaround checked against the tracker and deferred (R9); sources Admit, SDN pages, SDN forum posts, school page by admin entry (Tasks 6, 7, 9, 10, 11, R2, R3);
  source and last-checked per observation (Task 1, 8); dedupe by normalised text, never double count (D1, D2, Task 8); the existing scraper infrastructure (polite host, budgets, robots, UA, guard, `maxRuntimeMs`,
  timekeeper cron, persisted interval, off-peak AI only: Tasks 9, 10); additive migration (1); public cached contract endpoint and a `me/**` overlap endpoint (11, 12); UI under Steel with presentational components (13,
  14); i18n, tests at all levels, docs, final gate (13-16).
- **Spec checks:** §6 (no person field, thread-level attribution, reject-not-redact), §7 ("school websites are not scraped": R2), §8 (politeness numbers), §9 (SDN prefilter and extraction reuse), §11 (a new tab on the
  school page). The spec's §7 model list gains three tables (Task 16 updates it).
- **Step scan:** code appears as signatures, enum/model shapes and the algorithm constants the tests cannot determine (D2, D4); bodies are left to the implementer; every threshold lives in one named constant.
- **Type consistency:** `NormalizedPrompt` (Task 2) is what Tasks 6, 7, 8, 10 produce and consume; `StoredPrompt`/`StoredObservation` (Task 5) match what Task 11's service builds from Prisma rows;
  `ProgramView` (Task 5) is what Tasks 11 and 12 shape into `MedSchoolSecondariesRes` and `OverlapSchool.view`; `MedSecondaryPromptDto` (Task 11) is what `SecondaryPromptRow` (Task 13) takes;
  `MedSecondaryOverlapRes` (Task 12) is what `OverlapView` (Task 14) takes; `PromptSource` ids equal the Prisma `MedPromptSource` values.
- **Proportion:** the plan is longer than the spec's one sentence for this feature because it adds a data model, two parsers, a job, a model sink and two endpoints; tests carry the exact assertions, bodies are not written.
- **Gaps found and flagged, not resolved:** see "Facts" and "For the owner".

## Facts an implementer must verify (do not assume)

1. **The two page layouts are unverified.** Nothing in the repo records the real markup of `med.admit.org/secondary-essays/<slug>` or SDN's `…/essay-questions/<CODE>/<slug>`; the fixtures in Tasks 6 and 7 are
   hand-built from the endpoint inventory's one-line descriptions. **Verify against a live fetch** (one school per source, through the polite host path, static UA) and replace the fixtures and selectors before the
   job is enabled in production; the tests' assertions stay. Also verify: robots.txt of `med.admit.org` allows `/secondary-essays/` for the `MarlonJack` group or `*`; whether the Admit slug equals the Admit
   alias key (`MedSchoolAlias source ADMIT`); whether SDN's page uses an inline JSON array (guard marker `schools-database-data`) or only markup; whether SDN's `<CODE>/<slug>` is the same pair the `summary:` alias key
   holds; whether the Admit page separates MD-PhD prompts under their own heading.
2. **What a bare year means.** If a source writes "2025" for a cycle, is that the application year or the entry year? The inventory says Admit shows "2019-2025" (a range of cycles); confirm the label form on the real
   page, pin `cycleLabelToEntryYear` accordingly, and keep the sanity guard (`cycleYear` between 2005 and `siteCycle`).
3. **`process-thread.ts` seams** (Task 10): the exact point after a chunk's events are committed, how `state.llmCalls` and `limits.maxLlmCalls` are checked (`beforeCall`), and that quotes and handles are already
   stripped when the chunk is formed; adapt the call site, not the sink.
4. **`MedPrisma` and its fake** can express the reads and writes (`findMany` with `where`/`select`/`orderBy`, `create`, `update`, `upsert`); extend `types.ts` and `createFakePrisma`, do not cast around them.
5. **`createPoliteHost` robots check path matching** for `med.admit.org` and `SOURCES` key typing (`DAILY_REQUEST_BUDGETS` is a `Record` over a union; adding `ADMIT_WEB` widens it; `hostBudget('ADMIT_WEB')` in
   the worker); `request-budget.ts` keys by name in `MedRequestBudget`.
6. **`lib/api/route-table.server.ts` is regenerated** (`pnpm api:routes`) and the static `…/secondaries` path does not shadow or get shadowed by `schools/$slug` siblings (`route-table.test.ts` holds it).
7. **Phase 6's contract and `ai-budget.ts` edits** (the Q&A share, `scrapeCapUsd`): rebase onto them, and pass the sink's gate the same `capUsd` the other scrape gates get.
8. **The tracker has no secondary-submitted milestone** (checked: `MilestoneType` is `SUBMITTED COMPLETE SECONDARY INTERVIEW WAITLIST REJECTION ACCEPTANCE WITHDRAWN HOLD`, and `SECONDARY` is the one shareable
   secondary event); re-check before writing R9's follow-up.
9. **`og-page-coverage.test.ts`** is unaffected (no new route); `ui-rules.test.ts` greps apply to the new UI files automatically.

## Rulings (facilitator, 2026-11-23, owner-overridable; these override task text)

- **R1 Themes by keyword rules, not a model.** Why: (a) the themes are a short fixed list and prompts are short and formulaic ("Describe a challenge…"), which rules tag well and testably against a
  labelled fixture; (b) rules run at ingest in the same write, instantly, free, deterministic, and need no peak-hour wait, ledger or share; (c) a model on public text has a failure mode the rules lack
  (a hallucinated tag shown to every viewer), and the rule table is auditable by the owner; (d) it keeps the forum extractor the only model call in this feature. The cost of the alternative is small
  (a few hundred leftover prompts per cycle in batches of 40 would be cents off-peak), so the door stays open: tags carry `themesVersion`, `other` is a first-class bucket, and **if more than 25% of
  stored prompts tag `other` after a full cycle of data, add an off-peak DeepSeek pass for the `other` rows only** (own label, own small share, same scrub), no migration needed.
- **R2 A school's own page is an admin entry, not a scrape.** Spec §7 says school websites are not scraped (a fourth, unpermitted source), the pages are 238 different layouts, and nothing here is permitted
  yet. "The school's own published secondary page where it exists" is therefore a source an RMH admin enters with the page URL (`SCHOOL`, top display priority, `sourceRef` the URL, shown as a link). No server
  ever fetches that URL.
- **R3 SDN forum prompts ride the live SDN read.** A separate crawler would double the requests on a host already at 2000/day; a second model call on the posts the live job already fetched costs no request.
  It is on by default behind `MEDSCHOOLS_SECONDARIES_FORUM_ENABLED`, capped at 10% of the scrape share, off-peak only, reject-not-redact.
- **R4 Cycle labels are entry years**, as everywhere else on the site, with one explanatory line ("2027 is the 2026–2027 application cycle"). The owner's "2023–2025, 2027" format is kept exactly.
- **R5 "Gone" is worded "Not seen this cycle."** A prompt we did not observe is not proof the school dropped it (a source may lag or a page may be partial); the status id stays `gone`, the word is honest.
- **R6 The reworded threshold is conservative (0.5).** A missed link costs one extra "new" and one "not seen"; a false link would say a school kept a prompt it replaced.
- **R7 A PHD list item brings the school's regular prompts too** in the overlap (a combined-degree applicant normally also answers the regular secondary). This is an assumption; the owner confirms (question 4).
- **R8 Marks and links are computed, not stored.** No `supersedesId`, no status column: a stored link goes stale the moment a source adds an observation, and a school has about 100 observations in total.
- **R9 Turnaround is deferred.** Turnaround is the time from "secondary received" to "secondary submitted". The tracker records `SUBMITTED` (primary), `COMPLETE`, and one `SECONDARY` milestone; **there is no
  secondary-submitted date**, so it cannot be computed. A future change would add a private `SECONDARY_SUBMITTED` milestone (never shareable, like `SUBMITTED`/`COMPLETE`), relabel `SECONDARY` as "Secondary
  received", and aggregate in the phase 5 style: a worker precompute, >= 20 distinct members per school x program, weekly bins, an at-risk floor, delta-k refresh (phase 5 R13). Not in this plan.
- **R10 Page prompts are attributed to PHD by a text rule** (D7), not guessed from position; a prompt the rule cannot place is REG. A mislabel is fixable by the admin entry (which carries an explicit program).
- **R11 Admit's "Chance %" is ignored.** It describes how often a prompt is asked, not a fact about the prompt, and it is Admit's own statistic.
- **R12 Observations are never deleted** (D9): the history is the product (cycle ranges, rewording); a school dropping a prompt is shown by absence, not by deletion.
- **R13 CycleTrack's `?view=secondary` is not used** (the owner named Admit, SDN and the school's page). It reaches back to 2013–2014 with "Reported cycle" lists and would fill the early years; the adapter shape
  (Task 6) fits it exactly if the owner wants it (question 1).
- **R14 Cache 300 s max-age, 900 s shared, 3600 s stale-while-revalidate** for the school endpoint: the data changes at most twice a week, and users wait seconds, not hours, for a new prompt.

## For the owner (short; the plan does the listed thing meanwhile)

1. **CycleTrack's `?view=secondary` page** carries prompts back to 2013–2014. Add it as a fourth source (same adapter shape, existing CycleTrack permission and host)? Meanwhile: not used (R13).
2. **Cycle labels:** entry year ("2027" is the 2026–2027 cycle) as everywhere else, or application year? Meanwhile: entry year with a one-line note (R4).
3. **SDN forum extraction** on by default at 10% of the scrape share, or off until you have seen the first month's prompts? Meanwhile: on (R3), switchable.
4. **Combined-degree applicants:** do MD-PhD / DO-PhD applicants answer the regular prompts as well as the extra ones? Meanwhile: yes, in the overlap (R7); the tab itself shows only what each source attributes to each program.
5. **A school's own page:** admin entry only (R2). Do you want a curated import (a reviewed JSON per cycle) as well, or approval to scrape published secondary pages (needs a spec §7 change and permission)?
6. **Turnaround:** add a private "secondary submitted" milestone and relabel "secondary" as "secondary received", then ship the turnaround median under the phase 5 floors (R9)? Meanwhile: deferred.
7. **"Not seen this cycle" vs "gone"** wording (R5), and whether a prompt unseen for two cycles should drop off the tab (today it stays as history with its cycle list).
8. **AI themes for the leftover:** the trigger is "more than 25% `other`" after a cycle of data (R1); is that the right bar, or do you want the model pass regardless?
9. **Steel §18 D13** (the RMH Med Schools gap) is touched by a fifth tab, not answered; the redesign (roadmap item 11) answers it.

## Owner answers (2026-11-23) — these override the rulings and defaults above

1. **Sources: three, not four.** Admit.org, SDN and the school's own page. CycleTrack's `?view=secondary` is **not** used (R13 stands).
2. **School pages: a one-time curated research import, not a scraper.** The owner: "You can do it yourself now as they're unlikely to change that much." So R2 changes:
   - Each school's own secondary page and admissions page (rolling admissions, MD vs MD-PhD) is read once, carefully, during implementation.
   - The result is checked in as a dated, sourced data file under `data/medschools/`. Each entry carries the URL, the date checked and the program it applies to.
   - An import step loads that file into `MedSecondaryObservation` as source `SCHOOL`.
   - There is no recurring job against school websites, and spec §7's "school websites are not scraped" stays true for automated jobs.
   - The admin entry endpoint stays, for corrections.
   - The same file is the seed for roadmap item 5 (rolling admissions).
3. **Turnaround: add it.**
   - Add a private `SECONDARY_SUBMITTED` tracker milestone, and relabel the existing `SECONDARY` milestone as "Secondary received" in the UI. Use a new i18n key; the enum value is unchanged.
   - Turnaround per school is shown only at k≥20 sharing members with both dates, aggregated by the worker as in phase 5. This replaces R9's deferral.
   - Like `SUBMITTED`/`COMPLETE`, `SECONDARY_SUBMITTED` is never shared as a public event.
4. **Cycle labels: the site's `2026–2027` style.** Ranges read "2023–2024 to 2025–2026, 2027–2028". This replaces R4.
