# rmhladder Plan 2/5: Source Adapters + Slug Prober Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API adapters for Greenhouse, Lever, Ashby, and SmartRecruiters; a generic careers-page verifier (robots-aware, node-html-parser); and a slug prober that activates the 1,376 `unconfigured` sources seeded in Plan 1.

**Architecture:** Each adapter is a module in `lib/rmhladder/adapters/` implementing a shared `SourceAdapter` contract and taking an injectable `fetchImpl` so tests run on recorded JSON fixtures with zero network. Adapters produce `NormalizedJob` objects and `VerificationEvidence` consumed by Plan 1's `computeVerification`. The prober is a CLI script (like `ladder:seed`) that tests candidate slugs against the live APIs and flips sources to `active`. Spec: `docs/superpowers/specs/2026-07-05-rmhladder-design.md`. Foundation interfaces: see `lib/rmhladder/` (Plan 1, complete).

**Tech Stack:** TypeScript strict, native `fetch` (Node 20), `node-html-parser` (already installed), vitest, Prisma client (prober only).

## Global Constraints

- All code under `lib/rmhladder/adapters/` except the prober script (`scripts/probe-ladder-sources.ts`); tests colocated `*.test.ts`; fixtures under `lib/rmhladder/adapters/__fixtures__/*.json`.
- **No network in tests** — every adapter function takes `fetchImpl: typeof fetch = fetch` as its last constructor/options argument; tests pass a stub returning fixture data.
- No new dependencies. No Playwright in this plan (JS-rendered pages → evidence `blocked: false, fetched: true` with low signals → `needs_manual_review`; full Playwright fallback is Plan 3).
- Consume Plan 1 exports — do not modify them: `computeVerification`, `VerificationEvidence` (14 fields, verification.ts), `classifyUSLocation` (us-location.ts), `normalizeTitle`, `normalizeCompanyName` (normalize.ts).
- Politeness: custom User-Agent `process.env.LADDER_USER_AGENT ?? 'rmhladder-bot/0.1 (+https://rmhstudios.com)'` on every request; 10s timeout via AbortSignal; the prober sleeps 300ms between requests. robots.txt honored for non-API HTML fetches only (the 4 job-board APIs are public JSON APIs).
- Commit after every green test cycle; run `pnpm exec vitest run lib/rmhladder/adapters` for the task suite.
- Live API calls happen ONLY in the prober script and only when a human runs `pnpm ladder:probe`.

---

### Task 1: Adapter contract + HTTP helper

**Files:**
- Create: `lib/rmhladder/adapters/types.ts`
- Create: `lib/rmhladder/adapters/http.ts`
- Test: `lib/rmhladder/adapters/http.test.ts`

**Interfaces:**
- Produces (types.ts — consumed by every later task):
  ```ts
  export interface NormalizedJob {
    externalId: string;
    title: string;
    locationRaw: string;
    country: string | null;        // ISO-ish country string when the API provides one
    remoteHint: boolean;           // platform's own remote flag, when present
    postedAt: Date | null;
    absoluteUrl: string;           // canonical original posting URL
    applyUrl: string | null;
    descriptionHtml: string | null;
    requisitionId: string | null;
  }
  export interface AdapterContext { slug: string; companyName: string; fetchImpl?: typeof fetch; }
  export interface SourceAdapter {
    platform: 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters';
    discoverJobs(ctx: AdapterContext): Promise<NormalizedJob[]>;
    verifyJob(ctx: AdapterContext, job: { externalId: string; title: string }): Promise<import('../verification').VerificationEvidence>;
    detectExpired(ctx: AdapterContext, externalId: string): Promise<boolean>;
  }
  ```
- Produces (http.ts): `politeFetch(url: string, opts?: { fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<{ ok: boolean; status: number; body: string }>` — sets the User-Agent header, aborts after `timeoutMs` (default 10_000), never throws on HTTP errors (returns `ok:false`), throws only on network/abort errors wrapped as `{ ok: false, status: 0, body: '' }` — i.e. it NEVER throws.

- [ ] **Step 1: Write failing tests**

```ts
// lib/rmhladder/adapters/http.test.ts
import { describe, expect, it } from 'vitest';
import { politeFetch } from './http';

const stub = (status: number, body: string, capture?: { headers?: Record<string, string> }): typeof fetch =>
  (async (_url: any, init?: any) => {
    if (capture) capture.headers = Object.fromEntries(new Headers(init?.headers).entries());
    return new Response(body, { status });
  }) as typeof fetch;

describe('politeFetch', () => {
  it('returns body and ok on 200', async () => {
    const r = await politeFetch('https://example.com/x', { fetchImpl: stub(200, '{"a":1}') });
    expect(r).toEqual({ ok: true, status: 200, body: '{"a":1}' });
  });
  it('returns ok:false on 404 without throwing', async () => {
    const r = await politeFetch('https://example.com/x', { fetchImpl: stub(404, 'nope') });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
  });
  it('sends the custom User-Agent', async () => {
    const cap: { headers?: Record<string, string> } = {};
    await politeFetch('https://example.com/x', { fetchImpl: stub(200, '', cap) });
    expect(cap.headers?.['user-agent']).toMatch(/rmhladder-bot/);
  });
  it('never throws on network failure', async () => {
    const boom = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const r = await politeFetch('https://example.com/x', { fetchImpl: boom });
    expect(r).toEqual({ ok: false, status: 0, body: '' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run lib/rmhladder/adapters/http.test.ts`
Expected: FAIL — cannot resolve `./http`.

- [ ] **Step 3: Implement**

```ts
// lib/rmhladder/adapters/http.ts
export const LADDER_USER_AGENT =
  process.env.LADDER_USER_AGENT ?? 'rmhladder-bot/0.1 (+https://rmhstudios.com)';

export interface PoliteResponse { ok: boolean; status: number; body: string }

export async function politeFetch(
  url: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<PoliteResponse> {
  const { fetchImpl = fetch, timeoutMs = 10_000 } = opts;
  try {
    const res = await fetchImpl(url, {
      headers: { 'user-agent': LADDER_USER_AGENT, accept: 'application/json, text/html;q=0.9' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch {
    return { ok: false, status: 0, body: '' };
  }
}
```

`types.ts` is pure declarations — copy the Interfaces block above verbatim into `lib/rmhladder/adapters/types.ts` (with `VerificationEvidence` imported as a type from `../verification`).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run lib/rmhladder/adapters/http.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add lib/rmhladder/adapters/types.ts lib/rmhladder/adapters/http.ts lib/rmhladder/adapters/http.test.ts
git commit -m "feat(rmhladder): adapter contract + polite HTTP helper"
```

---

### Task 2: Greenhouse adapter

**Files:**
- Create: `lib/rmhladder/adapters/greenhouse.ts`
- Create: `lib/rmhladder/adapters/__fixtures__/greenhouse-board.json`
- Test: `lib/rmhladder/adapters/greenhouse.test.ts`

**Interfaces:**
- Consumes: `politeFetch`, `NormalizedJob`, `SourceAdapter`, `AdapterContext` (Task 1); `computeVerification`-compatible `VerificationEvidence` (Plan 1); `classifyUSLocation` (Plan 1).
- Produces: `export const greenhouseAdapter: SourceAdapter` and `export const greenhouseBoardUrl = (slug: string) => \`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true\``.

API shape (recorded): `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` returns `{ "jobs": [ { "id": 4285367007, "internal_job_id": 123, "title": "Product Management Intern", "updated_at": "2026-06-20T12:00:00-04:00", "first_published": "2026-06-01T09:00:00-04:00", "requisition_id": "R-1234", "location": { "name": "New York, NY" }, "absolute_url": "https://boards.greenhouse.io/stripe/jobs/4285367007", "content": "&lt;p&gt;Join us...&lt;/p&gt;", "offices": [{ "name": "New York" }] } ] }`.

- [ ] **Step 1: Create the fixture**

`lib/rmhladder/adapters/__fixtures__/greenhouse-board.json` — exactly:

```json
{
  "jobs": [
    {
      "id": 4285367007,
      "title": "Product Management Intern",
      "updated_at": "2026-06-20T12:00:00-04:00",
      "first_published": "2026-06-01T09:00:00-04:00",
      "requisition_id": "R-1234",
      "location": { "name": "New York, NY" },
      "absolute_url": "https://boards.greenhouse.io/stripe/jobs/4285367007",
      "content": "<p>Join our payments team as a PM intern.</p>"
    },
    {
      "id": 4285367008,
      "title": "Senior Staff Engineer",
      "updated_at": "2026-06-21T12:00:00-04:00",
      "first_published": "2026-05-01T09:00:00-04:00",
      "requisition_id": null,
      "location": { "name": "Remote - US" },
      "absolute_url": "https://boards.greenhouse.io/stripe/jobs/4285367008",
      "content": "<p>10+ years required.</p>"
    }
  ]
}
```

- [ ] **Step 2: Write failing tests**

```ts
// lib/rmhladder/adapters/greenhouse.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { greenhouseAdapter, greenhouseBoardUrl } from './greenhouse';

const fixture = readFileSync(join(__dirname, '__fixtures__/greenhouse-board.json'), 'utf8');
const stub = (status: number, body: string): typeof fetch =>
  (async () => new Response(body, { status })) as typeof fetch;
const ctx = { slug: 'stripe', companyName: 'Stripe', fetchImpl: stub(200, fixture) };

describe('greenhouseAdapter.discoverJobs', () => {
  it('normalizes board jobs', async () => {
    const jobs = await greenhouseAdapter.discoverJobs(ctx);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual({
      externalId: '4285367007',
      title: 'Product Management Intern',
      locationRaw: 'New York, NY',
      country: null,
      remoteHint: false,
      postedAt: new Date('2026-06-01T09:00:00-04:00'),
      absoluteUrl: 'https://boards.greenhouse.io/stripe/jobs/4285367007',
      applyUrl: null,
      descriptionHtml: '<p>Join our payments team as a PM intern.</p>',
      requisitionId: 'R-1234',
    });
    expect(jobs[1].remoteHint).toBe(true); // "Remote" in location name
  });
  it('returns [] on non-200 without throwing', async () => {
    const jobs = await greenhouseAdapter.discoverJobs({ ...ctx, fetchImpl: stub(404, 'not found') });
    expect(jobs).toEqual([]);
  });
});

describe('greenhouseAdapter.verifyJob', () => {
  it('produces API-source evidence when the job is on the board', async () => {
    const e = await greenhouseAdapter.verifyJob(ctx, { externalId: '4285367007', title: 'Product Management Intern' });
    expect(e).toMatchObject({
      fetched: true, apiSource: true, titleMatch: true, companyMatch: true,
      usConfirmed: true, applyPresent: true, reqIdPresent: true,
      closedLanguage: false, blocked: false, isSearchResultsPage: false,
      companyName: 'Stripe', jobTitle: 'Product Management Intern', platform: 'greenhouse',
    });
  });
  it('reports fetched-but-absent as closedLanguage=false, apiSource=true, titleMatch=false', async () => {
    const e = await greenhouseAdapter.verifyJob(ctx, { externalId: '999', title: 'Ghost Role' });
    expect(e.titleMatch).toBe(false);
    expect(e.applyPresent).toBe(false);
  });
});

describe('greenhouseAdapter.detectExpired', () => {
  it('absent id → expired', async () => {
    expect(await greenhouseAdapter.detectExpired(ctx, '999')).toBe(true);
    expect(await greenhouseAdapter.detectExpired(ctx, '4285367007')).toBe(false);
  });
});

describe('greenhouseBoardUrl', () => {
  it('builds the boards-api URL', () => {
    expect(greenhouseBoardUrl('stripe')).toBe('https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm exec vitest run lib/rmhladder/adapters/greenhouse.test.ts`
Expected: FAIL — cannot resolve `./greenhouse`.

- [ ] **Step 4: Implement**

```ts
// lib/rmhladder/adapters/greenhouse.ts
import { classifyUSLocation } from '../classifiers/us-location';
import type { VerificationEvidence } from '../verification';
import { politeFetch } from './http';
import type { AdapterContext, NormalizedJob, SourceAdapter } from './types';

export const greenhouseBoardUrl = (slug: string) =>
  `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;

interface GhJob {
  id: number;
  title: string;
  first_published?: string;
  updated_at?: string;
  requisition_id?: string | null;
  location?: { name?: string };
  absolute_url: string;
  content?: string;
}

async function fetchBoard(ctx: AdapterContext): Promise<GhJob[] | null> {
  const res = await politeFetch(greenhouseBoardUrl(ctx.slug), { fetchImpl: ctx.fetchImpl });
  if (!res.ok) return null;
  try {
    return (JSON.parse(res.body) as { jobs?: GhJob[] }).jobs ?? [];
  } catch {
    return null;
  }
}

function normalize(raw: GhJob): NormalizedJob {
  const locationRaw = raw.location?.name ?? '';
  return {
    externalId: String(raw.id),
    title: raw.title,
    locationRaw,
    country: null,
    remoteHint: /\bremote\b/i.test(locationRaw),
    postedAt: raw.first_published ? new Date(raw.first_published) : raw.updated_at ? new Date(raw.updated_at) : null,
    absoluteUrl: raw.absolute_url,
    applyUrl: null, // greenhouse absolute_url IS the apply page
    descriptionHtml: raw.content ?? null,
    requisitionId: raw.requisition_id ?? null,
  };
}

export const greenhouseAdapter: SourceAdapter = {
  platform: 'greenhouse',

  async discoverJobs(ctx) {
    const jobs = await fetchBoard(ctx);
    return (jobs ?? []).map(normalize);
  },

  async verifyJob(ctx, job): Promise<VerificationEvidence> {
    const board = await fetchBoard(ctx);
    const hit = board?.find((j) => String(j.id) === job.externalId) ?? null;
    const loc = hit ? classifyUSLocation({ locationRaw: hit.location?.name ?? '' }) : null;
    return {
      fetched: board !== null,
      httpStatus: board !== null ? 200 : 404,
      apiSource: true,
      companyMatch: board !== null, // the board itself is company-scoped
      titleMatch: hit !== null && hit.title === job.title,
      usConfirmed: loc?.isUS === true,
      applyPresent: hit !== null, // every greenhouse posting page carries the apply form
      reqIdPresent: Boolean(hit?.requisition_id),
      closedLanguage: false,
      blocked: false,
      isSearchResultsPage: false,
      companyName: ctx.companyName,
      jobTitle: job.title,
      locationLabel: hit?.location?.name,
      platform: 'greenhouse',
    };
  },

  async detectExpired(ctx, externalId) {
    const board = await fetchBoard(ctx);
    if (board === null) return false; // fetch failure is NOT expiry evidence (3-strike rule is Plan 3)
    return !board.some((j) => String(j.id) === externalId);
  },
};
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm exec vitest run lib/rmhladder/adapters/greenhouse.test.ts`
Expected: PASS (6/6).

- [ ] **Step 6: Commit**

```bash
git add lib/rmhladder/adapters/greenhouse.ts lib/rmhladder/adapters/greenhouse.test.ts lib/rmhladder/adapters/__fixtures__/greenhouse-board.json
git commit -m "feat(rmhladder): greenhouse adapter with fixture tests"
```

---

### Task 3: Lever adapter

**Files:**
- Create: `lib/rmhladder/adapters/lever.ts`
- Create: `lib/rmhladder/adapters/__fixtures__/lever-postings.json`
- Test: `lib/rmhladder/adapters/lever.test.ts`

**Interfaces:**
- Consumes: Task 1 contract; Plan 1 `classifyUSLocation`.
- Produces: `export const leverAdapter: SourceAdapter`, `export const leverPostingsUrl = (slug: string) => \`https://api.lever.co/v0/postings/${slug}?mode=json\``.

API shape: `GET https://api.lever.co/v0/postings/{slug}?mode=json` returns a bare array: `[ { "id": "a1b2c3d4-uuid", "text": "Data Science Intern", "hostedUrl": "https://jobs.lever.co/plaid/a1b2c3d4-uuid", "applyUrl": "https://jobs.lever.co/plaid/a1b2c3d4-uuid/apply", "createdAt": 1750000000000, "categories": { "location": "San Francisco, CA", "commitment": "Intern", "team": "Data" }, "country": "US", "workplaceType": "hybrid", "descriptionPlain": "Work on ML.", "description": "<div>Work on ML.</div>" } ]`.

Fixture `lever-postings.json`: two entries — the one above, plus `{ "id": "e5f6-uuid", "text": "Engineering Manager", "hostedUrl": "https://jobs.lever.co/plaid/e5f6-uuid", "applyUrl": "https://jobs.lever.co/plaid/e5f6-uuid/apply", "createdAt": 1749000000000, "categories": { "location": "Remote - United States", "commitment": "Full-time" }, "workplaceType": "remote", "description": "<div>Lead a team.</div>" }` (note: no `country` field on the second).

Normalization mapping (implement in `normalize(raw)`): `externalId: raw.id` · `title: raw.text` · `locationRaw: raw.categories?.location ?? ''` · `country: raw.country ?? null` · `remoteHint: raw.workplaceType === 'remote'` · `postedAt: raw.createdAt ? new Date(raw.createdAt) : null` (epoch ms) · `absoluteUrl: raw.hostedUrl` · `applyUrl: raw.applyUrl ?? null` · `descriptionHtml: raw.description ?? null` · `requisitionId: null` (Lever postings API exposes none).

`verifyJob`/`detectExpired`: same board-refetch pattern as greenhouse (find by `id`); evidence differences: `applyPresent: Boolean(hit?.applyUrl)`, `reqIdPresent: false`, `usConfirmed` from `classifyUSLocation({ locationRaw, country: hit?.country ?? null })`.

Tests mirror greenhouse's structure exactly (same describe blocks, same stub helper) with these Lever-specific assertions: first normalized job equals the full mapped object above (postedAt `new Date(1750000000000)`); `jobs[1].remoteHint` is `true` via `workplaceType`; `verifyJob` on the first job yields `apiSource: true, titleMatch: true, usConfirmed: true, applyPresent: true, reqIdPresent: false, platform: 'lever'`; `detectExpired('missing-id')` → true. Steps: fixture → failing tests → run RED → implement → run GREEN → commit `feat(rmhladder): lever adapter with fixture tests`.

---

### Task 4: Ashby adapter

**Files:**
- Create: `lib/rmhladder/adapters/ashby.ts`
- Create: `lib/rmhladder/adapters/__fixtures__/ashby-board.json`
- Test: `lib/rmhladder/adapters/ashby.test.ts`

**Interfaces:**
- Consumes: Task 1 contract; Plan 1 `classifyUSLocation`.
- Produces: `export const ashbyAdapter: SourceAdapter`, `export const ashbyBoardUrl = (slug: string) => \`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=false\``.

API shape: `GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=false` returns `{ "jobs": [ { "id": "uuid-1", "title": "Software Engineering Intern", "location": "New York", "secondaryLocations": [], "isRemote": false, "isListed": true, "publishedAt": "2026-06-15T00:00:00Z", "jobUrl": "https://jobs.ashbyhq.com/ramp/uuid-1", "applyUrl": "https://jobs.ashbyhq.com/ramp/uuid-1/application", "descriptionHtml": "<p>Build fintech.</p>", "address": { "postalAddress": { "addressLocality": "New York", "addressRegion": "New York", "addressCountry": "United States" } } } ] }`.

Fixture: two jobs — the one above plus a second `{ "id": "uuid-2", "title": "Staff Engineer", "location": "Remote", "isRemote": true, "isListed": false, ... address.postalAddress.addressCountry: "United States" }`. **`isListed: false` jobs must be filtered out of `discoverJobs`** (Ashby returns unlisted drafts).

Normalization: `externalId: raw.id` · `title` · `locationRaw`: join `location` with `addressRegion` as `` `${location}, ${addressRegion}` `` when the region differs from the locality, else just `location` · `country: raw.address?.postalAddress?.addressCountry ?? null` · `remoteHint: raw.isRemote === true` · `postedAt: publishedAt ? new Date(publishedAt) : null` · `absoluteUrl: raw.jobUrl` · `applyUrl: raw.applyUrl ?? null` · `descriptionHtml: raw.descriptionHtml ?? null` · `requisitionId: null`.

Tests mirror the greenhouse structure; Ashby-specific assertions: `discoverJobs` returns **1** job (unlisted filtered); `locationRaw` is `'New York, New York'`... no — locality equals region string here is 'New York' vs 'New York' → equal → expect `locationRaw: 'New York'`; `country: 'United States'`; `verifyJob` evidence has `usConfirmed: true` (country field wins in classifyUSLocation), `platform: 'ashby'`; `detectExpired` treats unlisted (`isListed: false`) OR absent as expired → `detectExpired(ctx, 'uuid-2')` is `true`. Steps: fixture → RED → implement → GREEN → commit `feat(rmhladder): ashby adapter with fixture tests`.

---

### Task 5: SmartRecruiters adapter

**Files:**
- Create: `lib/rmhladder/adapters/smartrecruiters.ts`
- Create: `lib/rmhladder/adapters/__fixtures__/smartrecruiters-postings.json`
- Test: `lib/rmhladder/adapters/smartrecruiters.test.ts`

**Interfaces:**
- Consumes: Task 1 contract; Plan 1 `classifyUSLocation`.
- Produces: `export const smartRecruitersAdapter: SourceAdapter`, `export const smartRecruitersPostingsUrl = (slug: string) => \`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100\``, `export const smartRecruitersJobUrl = (slug: string, id: string) => \`https://jobs.smartrecruiters.com/${slug}/${id}\``.

API shape: `GET https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100` returns `{ "totalFound": 2, "content": [ { "id": "744000012345", "uuid": "uuid-x", "name": "Finance Analyst Program 2027", "refNumber": "REQ-778", "releasedDate": "2026-06-10T08:00:00.000Z", "location": { "city": "Charlotte", "region": "NC", "country": "us", "remote": false }, "company": { "identifier": "honeywell", "name": "Honeywell" } } ] }` — postings list has NO description (details need a second call; description stays `null` in this plan and Plan 3's pipeline treats null description as "summary unavailable").

Fixture: two postings — the one above plus `{ "id": "744000067890", "name": "Director of Operations", "refNumber": "REQ-990", "releasedDate": "2026-05-10T08:00:00.000Z", "location": { "city": "London", "country": "gb", "remote": false } }`.

Normalization: `externalId: raw.id` · `title: raw.name` · `locationRaw`: `` `${city}, ${region}` `` when region present else city ?? '' · `country: raw.location?.country?.toUpperCase() ?? null` (SR uses lowercase ISO codes — uppercase them so `classifyUSLocation`'s `US` country test matches) · `remoteHint: raw.location?.remote === true` · `postedAt: releasedDate ? new Date(releasedDate) : null` · `absoluteUrl: smartRecruitersJobUrl(ctx.slug, raw.id)` (list API has no hosted URL) · `applyUrl: null` · `descriptionHtml: null` · `requisitionId: raw.refNumber ?? null`.

Note `discoverJobs`/`verifyJob`/`detectExpired` need `ctx.slug` inside `normalize` for the URL — pass ctx through (`normalize(raw, ctx)`), unlike previous adapters.

Tests mirror greenhouse; SR-specific assertions: first job `country: 'US'`, `requisitionId: 'REQ-778'`, `absoluteUrl: 'https://jobs.smartrecruiters.com/honeywell/744000012345'`; second job's verify evidence has `usConfirmed: false` (country `GB`); `reqIdPresent: true` on the first. Steps: fixture → RED → implement → GREEN → commit `feat(rmhladder): smartrecruiters adapter with fixture tests`.

---

### Task 6: robots checker + generic careers-page verifier + manual adapter

**Files:**
- Create: `lib/rmhladder/adapters/robots.ts`
- Create: `lib/rmhladder/adapters/generic.ts`
- Test: `lib/rmhladder/adapters/robots.test.ts`
- Test: `lib/rmhladder/adapters/generic.test.ts`

**Interfaces:**
- Produces (robots.ts): `isPathAllowed(robotsTxt: string, userAgent: string, path: string): boolean` (pure parser) and `checkRobots(url: string, fetchImpl?: typeof fetch): Promise<boolean>` (fetches `origin + '/robots.txt'`; missing/failed robots.txt (status ≥ 400 or network fail) → allowed = true).
- Produces (generic.ts): `verifyGenericUrl(args: { url: string; companyName: string; jobTitle: string; fetchImpl?: typeof fetch }): Promise<VerificationEvidence>` — the verifier used for manual sources (banks) and any non-API posting URL.

**robots.ts logic** (subset of the standard, sufficient and conservative): split into UA groups (`User-agent:` lines start a group, consecutive UA lines share a group); collect `Disallow:`/`Allow:` rules for the group matching `userAgent` (case-insensitive substring) or `*` if none matches; a path is disallowed if it starts with any Disallow prefix (empty Disallow = allow all) unless a longer Allow prefix also matches (longest-prefix wins).

- [ ] **Step 1: robots tests**

```ts
// lib/rmhladder/adapters/robots.test.ts
import { describe, expect, it } from 'vitest';
import { isPathAllowed } from './robots';

const robots = `
User-agent: *
Disallow: /admin/
Allow: /admin/jobs/

User-agent: rmhladder-bot
Disallow: /private/
`;

describe('isPathAllowed', () => {
  it('specific UA group wins over *', () => {
    expect(isPathAllowed(robots, 'rmhladder-bot/0.1', '/admin/anything')).toBe(true);
    expect(isPathAllowed(robots, 'rmhladder-bot/0.1', '/private/x')).toBe(false);
  });
  it('falls back to * group', () => {
    expect(isPathAllowed(robots, 'otherbot', '/admin/secret')).toBe(false);
    expect(isPathAllowed(robots, 'otherbot', '/careers/123')).toBe(true);
  });
  it('longest prefix wins: Allow overrides Disallow', () => {
    expect(isPathAllowed(robots, 'otherbot', '/admin/jobs/456')).toBe(true);
  });
  it('empty robots allows everything', () => {
    expect(isPathAllowed('', 'anybot', '/x')).toBe(true);
  });
});
```

- [ ] **Step 2: RED** — `pnpm exec vitest run lib/rmhladder/adapters/robots.test.ts` fails (module missing).

- [ ] **Step 3: Implement robots.ts**

```ts
// lib/rmhladder/adapters/robots.ts
import { politeFetch } from './http';

interface Group { agents: string[]; rules: Array<{ allow: boolean; prefix: string }> }

function parse(robotsTxt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = [m[0], m[1].toLowerCase(), m[2].trim()];
    if (key === 'user-agent') {
      if (!lastWasAgent || !current) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'disallow' || key === 'allow') && current) {
      current.rules.push({ allow: key === 'allow', prefix: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

export function isPathAllowed(robotsTxt: string, userAgent: string, path: string): boolean {
  const groups = parse(robotsTxt);
  const ua = userAgent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  const applicable = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes('*'));
  let verdict = true;
  let matchLen = -1;
  for (const g of applicable) {
    for (const r of g.rules) {
      if (r.prefix === '' || !path.startsWith(r.prefix)) continue;
      if (r.prefix.length > matchLen) { matchLen = r.prefix.length; verdict = r.allow; }
    }
  }
  return verdict;
}

export async function checkRobots(url: string, fetchImpl?: typeof fetch): Promise<boolean> {
  const u = new URL(url);
  const res = await politeFetch(`${u.origin}/robots.txt`, { fetchImpl });
  if (!res.ok) return true; // no robots.txt → allowed
  const { LADDER_USER_AGENT } = await import('./http');
  return isPathAllowed(res.body, LADDER_USER_AGENT, u.pathname);
}
```

- [ ] **Step 4: GREEN** — robots tests pass (4/4). Commit: `feat(rmhladder): robots.txt checker`.

- [ ] **Step 5: generic verifier tests**

```ts
// lib/rmhladder/adapters/generic.test.ts
import { describe, expect, it } from 'vitest';
import { verifyGenericUrl } from './generic';

const page = (body: string, status = 200) =>
  (async (url: any) =>
    String(url).endsWith('/robots.txt')
      ? new Response('User-agent: *\nDisallow:', { status: 200 })
      : new Response(body, { status })) as typeof fetch;

const GOOD_HTML = `<html><body>
  <h1>Investment Banking Summer Analyst 2027</h1>
  <p>Goldman Sachs is seeking students in New York, NY.</p>
  <button>Apply Now</button> <span>Job ID: 2027-IBD-001</span>
</body></html>`;

describe('verifyGenericUrl', () => {
  const args = { url: 'https://example.com/careers/job/123', companyName: 'Goldman Sachs', jobTitle: 'Investment Banking Summer Analyst 2027' };

  it('full-signal page verifies', async () => {
    const e = await verifyGenericUrl({ ...args, fetchImpl: page(GOOD_HTML) });
    expect(e).toMatchObject({
      fetched: true, httpStatus: 200, apiSource: false, companyMatch: true,
      titleMatch: true, applyPresent: true, reqIdPresent: true,
      closedLanguage: false, blocked: false, isSearchResultsPage: false, platform: 'generic',
    });
  });
  it('detects closed language', async () => {
    const e = await verifyGenericUrl({ ...args, fetchImpl: page('<p>This position is no longer accepting applications.</p>') });
    expect(e.closedLanguage).toBe(true);
  });
  it('404 → fetched false with status', async () => {
    const e = await verifyGenericUrl({ ...args, fetchImpl: page('gone', 404) });
    expect(e.fetched).toBe(false);
    expect(e.httpStatus).toBe(404);
  });
  it('robots disallow → blocked, page never fetched', async () => {
    let pageFetched = false;
    const f = (async (url: any) => {
      if (String(url).endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /careers/', { status: 200 });
      pageFetched = true;
      return new Response(GOOD_HTML, { status: 200 });
    }) as typeof fetch;
    const e = await verifyGenericUrl({ ...args, fetchImpl: f });
    expect(e.blocked).toBe(true);
    expect(pageFetched).toBe(false);
  });
  it('search results page detected', async () => {
    const links = Array.from({ length: 15 }, (_, i) => `<a href="/careers/job/${i}">Job ${i}</a>`).join('');
    const e = await verifyGenericUrl({ ...args, url: 'https://example.com/careers/search?q=analyst', fetchImpl: page(`<html><body><h2>Search Results</h2>${links}</body></html>`) });
    expect(e.isSearchResultsPage).toBe(true);
  });
  it('partial title match still counts (60% token overlap)', async () => {
    const e = await verifyGenericUrl({ ...args, fetchImpl: page('<h1>Investment Banking Summer Analyst</h1><p>Goldman Sachs</p><a>apply</a>') });
    expect(e.titleMatch).toBe(true);
  });
});
```

- [ ] **Step 6: RED**, then implement generic.ts:

```ts
// lib/rmhladder/adapters/generic.ts
import { parse as parseHtml } from 'node-html-parser';
import { normalizeTitle } from '../normalize';
import type { VerificationEvidence } from '../verification';
import { politeFetch } from './http';
import { checkRobots } from './robots';

const CLOSED_LANGUAGE =
  /no longer accepting applications|position (has been )?(filled|closed)|posting (has )?expired|job is no longer available|applications? (are )?closed/i;
const APPLY_MARKERS = /apply now|apply for this|submit (your )?application|start application|\bapply\b/i;
const REQ_ID_MARKERS = /job id|requisition|req(?:uisition)? ?(id|number|#)|posting number|R-\d{3,}|REQ-?\d{3,}|\b\d{4}-[A-Z]{2,}-\d{2,}\b/i;
const SEARCH_MARKERS = /search results|\d+ (jobs|openings|positions) found|filter by/i;

export async function verifyGenericUrl(args: {
  url: string;
  companyName: string;
  jobTitle: string;
  fetchImpl?: typeof fetch;
}): Promise<VerificationEvidence> {
  const base: VerificationEvidence = {
    fetched: false, httpStatus: undefined, apiSource: false, companyMatch: false,
    titleMatch: false, usConfirmed: false, applyPresent: false, reqIdPresent: false,
    closedLanguage: false, blocked: false, isSearchResultsPage: false,
    companyName: args.companyName, jobTitle: args.jobTitle, platform: 'generic',
  };

  const allowed = await checkRobots(args.url, args.fetchImpl);
  if (!allowed) return { ...base, blocked: true };

  const res = await politeFetch(args.url, { fetchImpl: args.fetchImpl });
  if (res.status === 403 || res.status === 429) return { ...base, httpStatus: res.status, blocked: true };
  if (!res.ok) return { ...base, httpStatus: res.status };

  const root = parseHtml(res.body);
  const text = root.textContent ?? '';
  const lower = text.toLowerCase();

  // title match: ≥60% of normalized title tokens present in page text
  const tokens = normalizeTitle(args.jobTitle).split(' ').filter((t) => t.length > 1);
  const hitCount = tokens.filter((t) => lower.includes(t)).length;
  const titleMatch = tokens.length > 0 && hitCount / tokens.length >= 0.6;

  const jobLinkCount = root.querySelectorAll('a').filter((a) => /job|career|posting|position/i.test(a.getAttribute('href') ?? '')).length;
  const isSearchResultsPage = SEARCH_MARKERS.test(text) || (jobLinkCount >= 10 && !titleMatch) || (jobLinkCount >= 10 && /[?&]q=/.test(args.url));

  return {
    ...base,
    fetched: true,
    httpStatus: res.status,
    companyMatch: lower.includes(args.companyName.toLowerCase()),
    titleMatch,
    usConfirmed: false, // generic pages: US-ness comes from the job record's own location fields, not page scraping
    applyPresent: APPLY_MARKERS.test(text),
    reqIdPresent: REQ_ID_MARKERS.test(text),
    closedLanguage: CLOSED_LANGUAGE.test(text),
    isSearchResultsPage,
  };
}
```

Trace the search-results test before running: 15 links matching `/job/`, `titleMatch` false (page text lacks most title tokens — it has "Job 0..14" only → tokens hit: 'analyst'? no → ratio 0) → `jobLinkCount >= 10 && !titleMatch` → true. Also `Search Results` marker hits anyway.

- [ ] **Step 7: GREEN** — `pnpm exec vitest run lib/rmhladder/adapters/generic.test.ts` (6/6) and re-run robots (no regressions). Commit: `feat(rmhladder): generic careers-page verifier (robots-aware)`.

---

### Task 7: Slug prober + CLI script

**Files:**
- Create: `lib/rmhladder/adapters/prober.ts`
- Create: `scripts/probe-ladder-sources.ts`
- Test: `lib/rmhladder/adapters/prober.test.ts`
- Modify: `package.json` (add `"ladder:probe": "pnpm exec tsx scripts/probe-ladder-sources.ts"`)

**Interfaces:**
- Consumes: the four adapters' board URL builders + `politeFetch`; Prisma `ladderSource`/`ladderCompany` (script only — the lib stays Prisma-free).
- Produces (prober.ts, pure — DB writes live in the script):
  ```ts
  export function candidateSlugs(companyName: string): string[]  // ordered, deduped
  export async function probeSlug(platform: 'greenhouse'|'lever'|'ashby'|'smartrecruiters', slug: string, fetchImpl?: typeof fetch): Promise<{ live: boolean; jobCount: number }>
  ```

**candidateSlugs** (pure, tested): from `normalizeCompanyName(name)` produce, in order: (1) spaces removed (`jpmorganchase`), (2) hyphenated (`jpmorgan-chase`), (3) first word only when multi-word (`jpmorgan`), (4) raw lowercase name stripped of non-alphanumerics before normalization (`jpmorganchase` — dedupe against (1)). Dedupe preserving order.

**probeSlug**: GET the platform's board URL for the slug via `politeFetch`; `live` when status 200 AND the parsed body has the platform's job-array shape (greenhouse/ashby: `body.jobs` is an array; lever: body itself is an array; smartrecruiters: `body.content` is an array); `jobCount` = that array's length; malformed JSON or non-200 → `{ live: false, jobCount: 0 }`.

- [ ] **Step 1: Failing tests**

```ts
// lib/rmhladder/adapters/prober.test.ts
import { describe, expect, it } from 'vitest';
import { candidateSlugs, probeSlug } from './prober';

const stub = (status: number, body: string): typeof fetch =>
  (async () => new Response(body, { status })) as typeof fetch;

describe('candidateSlugs', () => {
  it('generates ordered deduped candidates', () => {
    expect(candidateSlugs('JPMorgan Chase')).toEqual(['jpmorganchase', 'jpmorgan-chase', 'jpmorgan']);
    expect(candidateSlugs('Stripe')).toEqual(['stripe']);
    expect(candidateSlugs('H.I.G. Capital')).toEqual(['higcapital', 'hig-capital', 'hig']);
  });
});

describe('probeSlug', () => {
  it('greenhouse live board', async () => {
    const r = await probeSlug('greenhouse', 'stripe', stub(200, '{"jobs":[{},{}]}'));
    expect(r).toEqual({ live: true, jobCount: 2 });
  });
  it('lever bare-array shape', async () => {
    expect(await probeSlug('lever', 'plaid', stub(200, '[{},{},{}]'))).toEqual({ live: true, jobCount: 3 });
  });
  it('smartrecruiters content shape', async () => {
    expect(await probeSlug('smartrecruiters', 'honeywell', stub(200, '{"content":[{}]}'))).toEqual({ live: true, jobCount: 1 });
  });
  it('404 and wrong-shape are dead', async () => {
    expect(await probeSlug('greenhouse', 'nope', stub(404, ''))).toEqual({ live: false, jobCount: 0 });
    expect(await probeSlug('greenhouse', 'weird', stub(200, '{"error":"x"}'))).toEqual({ live: false, jobCount: 0 });
    expect(await probeSlug('ashby', 'html', stub(200, '<html>'))).toEqual({ live: false, jobCount: 0 });
  });
});
```

- [ ] **Step 2: RED**, then implement prober.ts (import the four URL builders; switch on platform for URL + shape extraction; wrap JSON.parse in try/catch).

- [ ] **Step 3: GREEN** (6 assertions across 5 tests). Commit: `feat(rmhladder): slug candidate generation + platform probing`.

- [ ] **Step 4: Write the CLI script** `scripts/probe-ladder-sources.ts`:

Behavior: load all `LadderSource` rows with `status: 'unconfigured'` (join company), group by company; for each company × platform, try `candidateSlugs(company.name)` in order with a **300ms sleep between every request**; first live slug → update that source `{ slug, status: 'active', lastSuccessAt: new Date() }` and stop probing that platform; if none live, leave `unconfigured`. Flags (parse from `process.argv`): `--limit N` (only first N companies, default all), `--platform X` (only one platform). Summary log line (eslint-disable like seed script): companies probed, sources activated, total live jobs seen. Reuse the seed script's prisma import (`@/lib/prisma.server`) and `main().catch(...).finally(...)` pattern. Manual test (documented, not automated): `pnpm ladder:probe --limit 5 --platform greenhouse` — expect at least one activation among tech companies (e.g. stripe/databricks) and zero crashes; report the output.

- [ ] **Step 5: Commit** `feat(rmhladder): slug prober CLI` (package.json + script).

---

### Task 8: Adapter registry + full-suite wrap

**Files:**
- Create: `lib/rmhladder/adapters/index.ts`
- Test: `lib/rmhladder/adapters/index.test.ts`

**Interfaces:**
- Produces: `export const ADAPTERS: Record<'greenhouse'|'lever'|'ashby'|'smartrecruiters', SourceAdapter>` and `export function getAdapter(platform: string): SourceAdapter | null` (null for manual/generic/unknown — Plan 3's pipeline handles those via `verifyGenericUrl`). Re-export `verifyGenericUrl`, `checkRobots`, `politeFetch`, and all types.

- [ ] **Step 1: Failing test** — `index.test.ts`: `getAdapter('greenhouse').platform === 'greenhouse'` for all four; `getAdapter('manual')` and `getAdapter('bogus')` are null; `ADAPTERS` has exactly 4 keys.
- [ ] **Step 2: RED → implement → GREEN.**
- [ ] **Step 3: Full check** — `pnpm exec vitest run lib/rmhladder && pnpm exec eslint lib/rmhladder scripts/probe-ladder-sources.ts && pnpm exec prisma validate`. All green, no new warnings.
- [ ] **Step 4: Commit** `feat(rmhladder): adapter registry + plan-2 wrap`.

---

## Roadmap reminder

Plan 3 (pipeline + ladder-worker: cron, scrape runs, dedupe merge, 3-strike expiry, Playwright fallback, review tasks) → Plan 4 (dashboard routes) → Plan 5 (alerts, CSV, README). Deferred-from-review items to fold into Plan 3: gate `schoolYearTarget` extraction on classification at persistence; tighten `VerificationOutcome.status` to a union; `prisma migrate` before any deploy; indexes for run/review/job query paths.
