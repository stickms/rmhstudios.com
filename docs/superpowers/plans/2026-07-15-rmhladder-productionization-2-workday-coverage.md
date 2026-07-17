# rmhladder Productionization — Phase 2: Workday Coverage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert more of the priority-1 finance/consulting firms (seeded as `manual` aliveness-only sources) into real job-yielding Workday sources by broadening how we discover their Workday tenant from their career landing page — and report coverage so progress is measurable.

**Architecture:** No new ATS engine types (per spec). Two changes: (1) `discoverWorkdaySourceUrls` currently extracts Workday career URLs only from `<a href>` anchors; extend it to also scan the full HTML for embedded `*.myworkdayjobs.com/<site>` URLs (scripts, JSON blobs, iframes, redirects) — every candidate is still validated by the existing `parseWorkdaySource` (strict host regex) and `probeWorkdaySourceUrl` (live CXS check) before activation, so a broader scan cannot create bad sources. (2) A pure coverage snapshot surfaced in `pnpm ladder:status`.

**Tech Stack:** TypeScript (strict), Prisma 7, Vitest, pnpm, `node-html-parser`. Spec: `docs/superpowers/specs/2026-07-15-rmhladder-productionization-design.md` (Phase 2). Builds on Phases 0–1.

## Global Constraints

- **No new ATS engine types** (no iCIMS/Phenom/Eightfold/SuccessFactors/Taleo). Deepen Workday only.
- **Every discovered Workday URL must remain validated** by `parseWorkdaySource` (host must match `*.myworkdayjobs.com`) AND `probeWorkdaySourceUrl` (live CXS endpoint) before a source is activated — the broader scan only widens the candidate set, never the trust boundary.
- **The auto-discovery slug prober (`probe-sources.ts`) is already robust** (due-based retry, exponential backoff capped at 14d, idempotent). Do NOT rebuild it. Phase 2 adds nothing there.
- **No schema change.** Coverage is computed from existing `LadderCompany` (`firmType`, `enabled`), `LadderSource` (`status`), `LadderJob` (`status`) rows.
- **No new type or lint warnings.** Repo `tsc` needs `NODE_OPTIONS=--max-old-space-size=8192` (default heap OOMs). `pnpm lint` clean.
- **Tests colocated `.test.ts`**, TDD. Adapter tests use HTML fixtures.
- **Politeness unchanged:** discovery still runs inside the manual-source path in `run.ts` Step 5, which already went through `checkRobots` + `politeFetch`; the discovery cap on probed candidates stays small.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/rmhladder/adapters/workday.ts` (modify) | `discoverWorkdaySourceUrls` scans full HTML, not just anchors | 1 |
| `lib/rmhladder/adapters/workday.test.ts` (modify) | fixtures: Workday URL in a `<script>`/iframe is discovered; junk is rejected | 1 |
| `lib/rmhladder/pipeline/run.ts` (modify) | Step 5 discovery cap becomes env-configurable (`LADDER_WORKDAY_DISCOVERY_CAP`, default 5) | 1 |
| `.env.example` (modify) | document `LADDER_WORKDAY_DISCOVERY_CAP` | 1 |
| `lib/rmhladder/coverage.ts` (create) | pure `formatCoverageSnapshot` + `CoverageSnapshot` type | 2 |
| `lib/rmhladder/coverage.test.ts` (create) | formatter unit tests | 2 |
| `scripts/ladder-status.ts` (modify) | gather + print the coverage snapshot | 2 |

---

## Task 1: Full-HTML Workday tenant discovery

**Files:**
- Modify: `lib/rmhladder/adapters/workday.ts` (`discoverWorkdaySourceUrls`)
- Modify: `lib/rmhladder/adapters/workday.test.ts`
- Modify: `lib/rmhladder/pipeline/run.ts` (Step 5 cap)
- Modify: `.env.example`

**Interfaces:**
- Produces: `discoverWorkdaySourceUrls(html, pageUrl)` — unchanged signature (`string[]`), broader results. `resolveWorkdayDiscoveryCap(env)`.

- [ ] **Step 1: Write the failing test**

In `workday.test.ts`, ADD a `describe('discoverWorkdaySourceUrls — full HTML', ...)` with:
```ts
it('discovers a Workday URL embedded only in a <script>/JSON blob (no anchor)', () => {
  const html = `<!doctype html><html><head>
    <script>window.__CFG = {"careersUrl":"https://acme.wd1.myworkdayjobs.com/en-US/AcmeCareers"};</script>
    </head><body><p>Careers</p></body></html>`;
  const urls = discoverWorkdaySourceUrls(html, 'https://acme.com/careers');
  expect(urls).toContain('https://acme.wd1.myworkdayjobs.com/AcmeCareers');
});

it('still discovers anchor-based Workday URLs (regression)', () => {
  const html = `<a href="https://acme.wd1.myworkdayjobs.com/en-US/AcmeCareers">Jobs</a>`;
  expect(discoverWorkdaySourceUrls(html, 'https://acme.com/careers'))
    .toContain('https://acme.wd1.myworkdayjobs.com/AcmeCareers');
});

it('dedupes anchor + embedded occurrences of the same site', () => {
  const html = `<a href="https://acme.wd1.myworkdayjobs.com/en-US/AcmeCareers">a</a>
    <script>var u="https://acme.wd1.myworkdayjobs.com/AcmeCareers";</script>`;
  const urls = discoverWorkdaySourceUrls(html, 'https://acme.com/careers');
  expect(urls.filter((u) => u.includes('AcmeCareers'))).toHaveLength(1);
});

it('rejects non-Workday and malformed lookalikes', () => {
  const html = `<script>var a="https://evil.myworkdayjobs.com.attacker.com/x";
    var b="https://acme.myworkdayjobs.com";</script>`; // second has no site segment
  expect(discoverWorkdaySourceUrls(html, 'https://acme.com')).toEqual([]);
});
```
(The canonical form returned is `${origin}/${site}` with the locale prefix stripped, matching the current behavior.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run lib/rmhladder/adapters/workday.test.ts`
Expected: FAIL — the `<script>`-embedded and JSON cases are not found (anchor-only today).

- [ ] **Step 3: Implement the full-HTML scan**

In `workday.ts`, replace `discoverWorkdaySourceUrls` (lines 73-89) with a version that keeps the anchor pass AND adds a raw-HTML URL scan, funneling every candidate through the existing `parseWorkdaySource`:
```ts
export function discoverWorkdaySourceUrls(html: string, pageUrl: string): string[] {
  const urls = new Set<string>();

  const add = (candidate: string): void => {
    const config = parseWorkdaySource(candidate);
    if (config) urls.add(`${config.origin}/${encodeURIComponent(config.site)}`);
  };

  // 1. Anchor hrefs (resolves relative URLs against the page).
  const root = parseHtml(html);
  for (const anchor of root.querySelectorAll('a')) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    try {
      add(new URL(href, pageUrl).toString());
    } catch {
      // ignore unparseable href
    }
  }

  // 2. Absolute *.myworkdayjobs.com URLs embedded anywhere in the HTML
  //    (scripts, JSON config, iframes, meta-refresh). parseWorkdaySource is the
  //    trust boundary — junk and lookalike hosts are rejected there.
  const EMBEDDED = /https?:\/\/[a-z0-9.-]+\.myworkdayjobs\.com\/[A-Za-z0-9/_-]+/gi;
  for (const match of html.match(EMBEDDED) ?? []) {
    add(match);
  }

  return [...urls];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run lib/rmhladder/adapters/workday.test.ts`
Expected: PASS — embedded, anchor, dedupe, and rejection cases all green.

- [ ] **Step 5: Make the run.ts discovery cap configurable**

In `run.ts`, the manual-source discovery loop currently reads `discoverWorkdaySourceUrls(res.body, source.url).slice(0, 3)`. Add a helper near the top of the file:
```ts
function resolveWorkdayDiscoveryCap(env: { LADDER_WORKDAY_DISCOVERY_CAP?: string } = process.env): number {
  const parsed = Number(env.LADDER_WORKDAY_DISCOVERY_CAP);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 5;
}
```
and change the `.slice(0, 3)` to `.slice(0, resolveWorkdayDiscoveryCap())`. (Default 5, up from a hard-coded 3, since a firm may expose several campus/experienced sites; each candidate is still probed before activation.)

- [ ] **Step 6: Document the env var**

In `.env.example`, near the other `LADDER_` vars:
```
# LADDER_WORKDAY_DISCOVERY_CAP=5   # max Workday sites probed per manual-source landing page
```

- [ ] **Step 7: Typecheck + full adapter/pipeline tests**

Run: `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit` → clean.
Run: `pnpm exec vitest run lib/rmhladder/adapters lib/rmhladder/pipeline` → all pass.

- [ ] **Step 8: Commit**

```bash
git add lib/rmhladder/adapters/workday.ts lib/rmhladder/adapters/workday.test.ts lib/rmhladder/pipeline/run.ts .env.example
git commit -m "feat(rmhladder): discover Workday tenants embedded in page HTML, not just anchors"
```

---

## Task 2: Coverage snapshot in `ladder:status`

**Files:**
- Create: `lib/rmhladder/coverage.ts`
- Test: `lib/rmhladder/coverage.test.ts`
- Modify: `scripts/ladder-status.ts`

**Interfaces:**
- Produces:
  - `interface CoverageSnapshot { totalCompanies: number; companiesWithActiveSource: number; companiesManualOnly: number; companiesUnconfigured: number; activeJobsByFirmType: Record<string, number> }`
  - `formatCoverageSnapshot(s: CoverageSnapshot): string`
- Consumed by: `scripts/ladder-status.ts`.

- [ ] **Step 1: Write the failing test**

Create `lib/rmhladder/coverage.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatCoverageSnapshot, type CoverageSnapshot } from './coverage';

const SNAP: CoverageSnapshot = {
  totalCompanies: 344,
  companiesWithActiveSource: 180,
  companiesManualOnly: 120,
  companiesUnconfigured: 44,
  activeJobsByFirmType: { bulge_bracket: 40, private_equity: 12, technology: 200 },
};

describe('formatCoverageSnapshot', () => {
  it('reports company coverage counts and a percentage', () => {
    const out = formatCoverageSnapshot(SNAP);
    expect(out).toContain('companies with an active source: 180 / 344');
    expect(out).toContain('52%'); // 180/344
  });
  it('lists active jobs by firm type, descending', () => {
    const out = formatCoverageSnapshot(SNAP);
    const techIdx = out.indexOf('technology: 200');
    const peIdx = out.indexOf('private_equity: 12');
    expect(techIdx).toBeGreaterThan(-1);
    expect(techIdx).toBeLessThan(peIdx); // higher counts first
  });
  it('handles an empty firm-type map', () => {
    const out = formatCoverageSnapshot({ ...SNAP, activeJobsByFirmType: {} });
    expect(out).toContain('(no active jobs)');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run lib/rmhladder/coverage.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the formatter**

Create `lib/rmhladder/coverage.ts`:
```ts
export interface CoverageSnapshot {
  totalCompanies: number;
  companiesWithActiveSource: number;
  companiesManualOnly: number;
  companiesUnconfigured: number;
  activeJobsByFirmType: Record<string, number>;
}

export function formatCoverageSnapshot(s: CoverageSnapshot): string {
  const pct = s.totalCompanies > 0
    ? Math.round((s.companiesWithActiveSource / s.totalCompanies) * 100)
    : 0;
  const lines: string[] = [];
  lines.push('coverage');
  lines.push('--------');
  lines.push(`companies with an active source: ${s.companiesWithActiveSource} / ${s.totalCompanies} (${pct}%)`);
  lines.push(`  manual-only (no active API source): ${s.companiesManualOnly}`);
  lines.push(`  still unconfigured: ${s.companiesUnconfigured}`);
  lines.push('active jobs by firm type:');
  const entries = Object.entries(s.activeJobsByFirmType).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    lines.push('  (no active jobs)');
  } else {
    for (const [firmType, count] of entries) lines.push(`  ${firmType}: ${count}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run lib/rmhladder/coverage.test.ts`
Expected: PASS.

- [ ] **Step 5: Gather + print the snapshot in the CLI**

In `scripts/ladder-status.ts`, add imports:
```ts
import { formatCoverageSnapshot, type CoverageSnapshot } from '@/lib/rmhladder/coverage';
```
After the existing status report is printed, gather and print coverage. A company "has an active source" if any of its `LadderSource` rows is `status: 'active'`. "Manual-only" = enabled company with ≥1 source but no `active` source and at least one `manual` source. "Unconfigured" = enabled company whose sources are all `unconfigured`/`error`. Compute with grouped queries:
```ts
  const [companiesWithActive, enabledCompanies, activeJobsGrouped] = await Promise.all([
    prisma.ladderCompany.count({ where: { enabled: true, sources: { some: { status: 'active' } } } }),
    prisma.ladderCompany.count({ where: { enabled: true } }),
    prisma.ladderJob.groupBy({ by: ['companyId'], where: { status: 'active' }, _count: { _all: true } }),
  ]);
  const manualOnly = await prisma.ladderCompany.count({
    where: { enabled: true, sources: { none: { status: 'active' }, some: { platform: 'manual' } } },
  });
  const unconfigured = await prisma.ladderCompany.count({
    where: { enabled: true, sources: { none: { status: { in: ['active', 'manual'] } } } },
  });
  // Active jobs by firm type (join companyId → firmType).
  const companies = await prisma.ladderCompany.findMany({ select: { id: true, firmType: true } });
  const firmTypeById = new Map(companies.map((c) => [c.id, c.firmType]));
  const activeJobsByFirmType: Record<string, number> = {};
  for (const row of activeJobsGrouped) {
    const ft = firmTypeById.get(row.companyId) ?? 'unknown';
    activeJobsByFirmType[ft] = (activeJobsByFirmType[ft] ?? 0) + row._count._all;
  }
  const coverage: CoverageSnapshot = {
    totalCompanies: enabledCompanies,
    companiesWithActiveSource: companiesWithActive,
    companiesManualOnly: manualOnly,
    companiesUnconfigured: unconfigured,
    activeJobsByFirmType,
  };
  console.log('\n' + formatCoverageSnapshot(coverage));
```
(If a Prisma `where` on the `sources` relation filter needs the exact relation name, confirm it against `schema.prisma` — `LadderCompany.sources` is the relation; adjust the filter to the generated client's shape. `platform: 'manual'` and `status` enums are as in earlier phases. Keep the query type-correct; do not use `any`.)

- [ ] **Step 6: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit` → clean. (This is the main risk surface — the Prisma relation-filter queries must type-check.)

- [ ] **Step 7: Commit**

```bash
git add lib/rmhladder/coverage.ts lib/rmhladder/coverage.test.ts scripts/ladder-status.ts
git commit -m "feat(rmhladder): coverage snapshot in ladder:status"
```

---

## Self-Review

**Spec coverage (Phase 2):**
- 2.1 Maximize Workday coverage → Task 1 (full-HTML tenant discovery + configurable multi-site cap). ✅
- 2.2 Auto-discovery robustness → verified already-implemented in `probe-sources.ts` (retry/backoff/idempotent); intentionally NOT rebuilt (YAGNI), documented in Global Constraints. ✅ (no task)
- 2.3 Coverage reporting → Task 2 (`ladder:status` coverage snapshot). ✅

**Type consistency:** `CoverageSnapshot`/`formatCoverageSnapshot` defined in Task 2 and consumed by its CLI step. `discoverWorkdaySourceUrls` keeps its `string[]` signature.

**Placeholder scan:** exact code for the discovery scan, the cap helper, the coverage formatter, and the CLI gather block. The one "confirm against schema" note (Prisma relation-filter shape in the CLI gather) is a genuine generated-client specific a fresh implementer verifies with tsc; the query intent and shapes are fully specified.

**Risk to flag at review:** the embedded-URL regex could in principle match a Workday URL inside an unrelated comment; this is acceptable because `parseWorkdaySource` + `probeWorkdaySourceUrl` validate every candidate before activation (a non-live or malformed candidate is dropped). The reviewer should confirm that trust boundary is intact.
