# Med Schools: forecast per source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Forecast tab follows the header's CycleTrack / Admit.org toggle: each source has its own stored forecast, the toggle swaps between them, and an Admit MD-PhD / DO-PhD forecast carries a "not accurate" note.

**Architecture:** `MedForecast` gets `source` in its unique key (one row per school x program x cycle x type x source). The daily job fits every source that has floored current data, each on its own series and its own earlier cycles (never summed, spec §10). The public forecast read takes `source=cycletrack|admit` (only `admit` is sent, like Activity), returns the chosen source's row, else the next source in `primaryOrder`, so the existing "this forecast is made from {{source}}" note still covers a fallback. The model (`engine/stats/forecast.ts`) is untouched.

**Tech Stack:** Prisma 7 / Postgres, vitest, TanStack Start, React Query, i18next.

**Spec:** Approved in conversation 2026-11-26 (no separate doc). Context: `features/medschools/CLAUDE.md` §"The reader's source choice" and §"Statistics, the Forecast tab and the personal chance (phase 5)".

## Global Constraints

- Never sum sources; every history cycle handed to `forecastCycle` is from the same source as its current series (a thin cycle may still lend its SHAPE from `MDAPPLICANTS`, as today).
- The public read stays user-independent: `source` is a query param, part of the cache key, zod enum `cycletrack|admit`, lower case; junk is a 400. Only `admit` is sent; CycleTrack is the plain request (`sourceParamOf`).
- All counts read through `floorWhere` / `primarySeriesOf`-style floored helpers (`engine/floor.ts`); `run-forecast.test.ts`'s "reads counts only through the shared floor" must still pass.
- User-facing strings through `t("key", { defaultValue })`, a NEW key for new copy, then `pnpm i18n:extract` and check `locales/en/medschools.json`; no `{/* */}` comment directly before a `t()` call.
- The app tier is not the Steel site tier: use `.medapp-meta` for the note, no new styles.
- `MODEL_VERSION` stays 1. Migration is additive-safe: no data a reader needs is deleted.
- Every commit passes `pnpm check:consistency`; `pnpm typecheck` clean.

## Review Focus

- **Admit selected, school has no Admit row** (new school, or Admit has nothing for this program): the tab shows the CycleTrack forecast with the existing "made from CycleTrack" note, never an empty chart. Pinned in Task 4.
- **Chosen source has a row in `NONE` mode** (current data, no usable history): the read returns that source's `no-history` state, not the other source's band. Pinned in Task 4.
- **School with only SDN / RMH / MDApplicants data** keeps its forecast (the job fits every source with data; the toggle still offers two). Pinned in Task 3.
- **Old rows at deploy time** (one row per key, source already set): the migration must keep them and the next run adds the other source's rows without errors. Pinned in Task 1 (SQL) and Task 3 (upsert key).
- **Toggle flipped to Admit while on PHD**: the note shows only when the drawn forecast IS from Admit and the program is PHD; REG and CycleTrack never show it. Pinned in Task 5.

---

### Task 1: Schema, migration, test fakes

**Files:**
- Modify: `prisma/schema/medschools.prisma:548-572` (`MedForecast`)
- Create: `prisma/migrations/20261226090000_medschools_forecast_per_source/migration.sql`
- Modify: `features/medschools/scrape/test-support.ts:28` (key list for `medForecast`)
- Modify: `features/medschools/scrape/types.ts` (`MedForecastRow` gets `source: MedSource`; check its definition near the `medForecast` block at ~345)
- Test: `features/medschools/engine/schema.test.ts:373` and the migration-SQL assertions near line 393

**Interfaces:**
- Produces: Prisma unique `schoolId_program_cycleYear_eventType_source`; `MedForecast.source` is `MedSource` (not null).

- [ ] **Step 1: Update the test.** In `schema.test.ts` change "pins the uniques the job upserts on" to expect `['schoolId','program','cycleYear','eventType','source']` for `MedForecast`; add a test `'the per-source migration makes source required and re-keys the unique'` reading the new migration file and asserting it contains `ALTER COLUMN "source" SET NOT NULL`, `DROP INDEX "med_forecast_schoolId_program_cycleYear_eventType_key"` and `CREATE UNIQUE INDEX "med_forecast_schoolId_program_cycleYear_eventType_source_key"`.
- [ ] **Step 2: Run** `pnpm exec vitest run features/medschools/engine/schema.test.ts` and see both fail.
- [ ] **Step 3: Edit the model:** `source MedSource` (doc comment: "The source this forecast was fitted on."), `@@unique([schoolId, program, cycleYear, eventType, source])`. Migration SQL, in order: `DELETE FROM med_forecast WHERE source IS NULL;` (the job never wrote null, so this is a no-op guard), `ALTER TABLE "med_forecast" ALTER COLUMN "source" SET NOT NULL;`, drop the old unique index, create the new one. Update `test-support.ts` key list and the `MedForecastRow` type.
- [ ] **Step 4: Run** `pnpm exec prisma generate && pnpm exec prisma validate`, then the vitest file again: pass.
- [ ] **Step 5: Commit** `git add -A prisma features/medschools && git commit -m "feat(medschools): key the stored forecast by source"` after `pnpm check:consistency`. (Typecheck is red until Task 3 for the job's upsert key; if the gate blocks, commit Tasks 1 to 3 together.)

### Task 2: Per-source series helpers

**Files:**
- Modify: `features/medschools/engine/stats/input.ts`
- Test: `features/medschools/engine/stats/input.test.ts`

**Interfaces:**
- Produces: `seriesBySource(rows: readonly StoredCountRow[], today: string): PrimarySeries[]` (every source with floored public data, in `PRIMARY_ORDER`, each its own days, never added); `primarySeriesOf(rows, today, prefer?: MedSource | null): PrimarySeries | null` (passes `prefer` to `buildTypeSeries`, so the reader's no-row fallback follows the toggle).

- [ ] **Step 1: Write failing tests** in `input.test.ts`: `'seriesBySource lists CycleTrack and Admit separately and never adds them'` (two sources, same day, counts 3 and 5: two entries, 3 and 5, in order CYCLETRACK then ADMIT); `'seriesBySource drops a suppressed RMH source (k floor)'`; `'primarySeriesOf prefers the chosen source and falls back when it has none'` (prefer ADMIT with both: ADMIT; prefer ADMIT with CYCLETRACK only: CYCLETRACK).
- [ ] **Step 2: Run** `pnpm exec vitest run features/medschools/engine/stats/input.test.ts`: fail.
- [ ] **Step 3: Implement** both using `buildTypeSeries(floored(rows, today), today, prefer)` and its `sources` array (it already floors and orders by `PRIMARY_ORDER`).
- [ ] **Step 4: Run** the file: pass. `stats-boundary.test.ts` still passes.
- [ ] **Step 5: Commit.**

### Task 3: The job fits every source

**Files:**
- Modify: `features/medschools/scrape/run-forecast.ts` (`ForecastRow.source: MedSource`; `fitSchool`; the stored-row map and upsert in `runForecast`)
- Test: `features/medschools/scrape/run-forecast.test.ts`

**Interfaces:**
- Consumes: `seriesBySource`, `seriesOfSource` (Task 2 / existing).
- Produces: `fitSchool(...)` returns one `ForecastRow` per program x type x source that has floored current data; `row.source` always set; seed `fnv1a(`${schoolId}|${program}|${eventType}|${source}|${cycleYear}|${asOf}`)`. `runForecast` keys `prior` by `program|type|source` and upserts on `schoolId_program_cycleYear_eventType_source`.

- [ ] **Step 1: Write failing tests:** `'fits CycleTrack and Admit separately for one program and type, each on its own series and history'` (both sources' current + one history cycle each with different totals: two rows, `basis` sources equal the row's own source, `summary.observed` equal each source's own count, no row mixes them); `'a school with only SDN data still gets a row'`; `'a re-run on the same day leaves every per-source row unchanged and a new source adds only its own row'`. Update the existing assertions that expect exactly one row per key to filter by source.
- [ ] **Step 2: Run** `pnpm exec vitest run features/medschools/scrape/run-forecast.test.ts`: fail.
- [ ] **Step 3: Implement.** In `fitSchool` replace the `primary` single fit with a loop over `seriesBySource(of(cycleYear), today)`; inside, use that series' `source` for the history rule (the existing thin-history shape fallback stays). `runForecast`: `prior` keyed with source, compare and upsert with the new key name; `ForecastSummary` counts are per row (unchanged names).
- [ ] **Step 4: Run** the job's tests and `pnpm typecheck`: pass.
- [ ] **Step 5: Commit.**

### Task 4: The public read follows the source

**Files:**
- Modify: `features/medschools/api/read-schemas.ts:61` (`forecastQuery = historyQuery.extend({ source: sourcePref.optional() })`; leave `arrivalsQuery = historyQuery`), `features/medschools/medschools.contract.ts:368-371` (query gains `source?: MedSourcePrefId | undefined`), `features/medschools/api/read.server.ts:661-757` (`getForecast`)
- Test: `features/medschools/api/read.server.test.ts` (`describe('getForecast')`, line ~864) and `features/medschools/api/read-source-pref.server.test.ts`

**Interfaces:**
- Produces: `GET .../forecast?source=admit`; `getForecast(slug, q: ForecastQuery, now?)` where `q.source` is `'cycletrack' | 'admit' | undefined`.
- Behaviour: load every `MedForecast` row of the school x program x site cycle x type (`findMany`, same `select` plus `source`); the chosen row is the one whose source comes first in `primaryOrder(prefer)` (`prefer = PREF_SOURCE[q.source]`, import `pickPrimary`/`primaryOrder` from `engine/public-read`); the observed line and the no-row `primarySeriesOf` fallback both use the same `prefer`. Response keys unchanged.

- [ ] **Step 1: Write failing tests.** In `read.server.test.ts` switch `setup()` to `m.medForecast.findMany.mockResolvedValue(forecast ? [forecast].flat() : [])` and keep every existing case green; add: `'source=admit returns the Admit row when both exist'`, `'no source reads CycleTrack first'`, `'falls back to the other source when the chosen one has no row'` (Review Focus 1), `'a NONE row for the chosen source stays no-history, it does not borrow the other band'` (Review Focus 2), `'with no row at all the observed line follows the chosen source'`. In `read-source-pref.server.test.ts` extend "the source param (validation)" to include `forecastQuery` for accept and refuse cases, and assert `arrivalsQuery` still refuses `source`.
- [ ] **Step 2: Run** both files: fail.
- [ ] **Step 3: Implement** as described; keep the band-shift logic as it is.
- [ ] **Step 4: Run** `pnpm exec vitest run features/medschools/api` (includes `qa/retrieve.server.test.ts`, whose `getForecast` call passes no source and must still pass) and `pnpm typecheck`.
- [ ] **Step 5: Commit.**

### Task 5: The tab, the loader prefetch, the Admit PhD note

**Files:**
- Modify: `features/medschools/medschools.queries.ts` (`forecastQuery` accepts `source?: 'admit'`; loader branch at ~380 passes `...sourceParamOf(deps.source)`), `features/medschools/ui/prefetch-tabs.ts:~51` (`...source`), `features/medschools/ui/ForecastTab.tsx` (query and note), `locales/en/medschools.json` (via extract)
- Test: `features/medschools/ui/school-page.test.tsx` (`describe('Forecast tab')`, line ~542), `features/medschools/ui/keep-place.test.ts` only if it enumerates query keys

**Interfaces:**
- Consumes: `sourceParamOf`, `useSourcePref().value` (already imported in the tab), the Task 4 contract.
- Produces: i18n key `forecast-admit-phd-note`, default `Admit.org only began reporting {{program}} separately this cycle, so this forecast is not accurate for {{program}}.`, with `program` from `programFilterLabel(program, detail.school.degree)` ("MD-PhD" / "DO-PhD"). Rendered as a `.medapp-meta` paragraph above the chart when `data.source === 'ADMIT' && program === 'PHD'`. The existing `source-forecast-other` note is unchanged.

- [ ] **Step 1: Write failing tests** (seed the cache with the key that includes `source: 'admit'`; mirror how the file's existing source-pref cases set `h.search` and `source`): `'Admit selected on MD-PhD shows the note'`, `'Admit selected on MD (REG) shows no note'`, `'CycleTrack on MD-PhD shows no note'`, `'Admit selected but only a CycleTrack forecast exists shows the made-from note and not the PhD note'` (Review Focus 5), `'the Forecast query key carries source only for admit'`.
- [ ] **Step 2: Run** `pnpm exec vitest run features/medschools/ui/school-page.test.tsx`: fail.
- [ ] **Step 3: Implement.** `forecastQuery(slug, q: { program; type; source?: 'admit' })`; tab calls it with `...sourceParamOf(pref.value)`; loader and `prefetch-tabs` pass the same, so the server HTML and the cache keys agree. Add the note paragraph (no `{/* */}` before the `t()` call; explain above the component). Run `pnpm i18n:extract` and confirm the key is in `locales/en/medschools.json`.
- [ ] **Step 4: Run** `pnpm exec vitest run features/medschools` (whole feature, including `ui/ui-rules.test.ts`): pass.
- [ ] **Step 5: Commit.**

### Task 6: Docs and full gate

**Files:**
- Modify: `features/medschools/CLAUDE.md` (the "reader's source choice" bullet: the Forecast now follows the toggle with a per-source fit; "The model" and "The job" bullets: one row per school, program, cycle, type and source; `schools/$slug/forecast` takes `source`; the Admit MD-PhD note), `server/CLAUDE.md:~311-314` (forecast job line)

- [ ] **Step 1:** Edit the docs. No running counts or totals.
- [ ] **Step 2: Run** `pnpm check:consistency --base main` and `pnpm exec vitest run features/medschools scripts` (anything that imports the forecast); fix what fails.
- [ ] **Step 3: Commit,** then push `claude/youthful-curie-m4ry5u` and open the PR (mention: the forecast table gains a source key; first run after deploy adds the other source's rows).

## Self-review notes

- Spec coverage: toggle swaps CT/Admit (Tasks 3-5), no "both" view (none built), Admit PhD note (Task 5), fallback and no-row behaviour (Task 4), docs (Task 6).
- One deliberate widening of the approved design: the job fits every source with data, not only CycleTrack and Admit, so a school whose only data is SDN or RMH keeps the forecast it has today. The UI still offers two.
- Names used across tasks: `seriesBySource`, `primarySeriesOf(..., prefer)`, `forecastQuery` (schema and query factory), `sourceParamOf`, `forecast-admit-phd-note`.
