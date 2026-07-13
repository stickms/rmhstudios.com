# rmhladder Plan 1/5: Foundation (Schema, Classifiers, Scoring, Seed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prisma schema, company seed data, and all pure domain logic (normalization/dedupe, US-location classifier, early-career classifier, relevance scoring, verification status logic) for the rmhladder job tracker — fully unit-tested, no network.

**Architecture:** All domain logic lives in `lib/rmhladder/` as pure functions consumed later by the `ladder-worker` pipeline (Plan 3) and TanStack routes (Plan 4). Schema adds `Ladder*` models to the existing `prisma/schema.prisma`. Spec: `docs/superpowers/specs/2026-07-05-rmhladder-design.md`.

**Tech Stack:** TypeScript (strict), Prisma 7 + PostgreSQL, vitest, node:crypto, pnpm.

## Global Constraints

- All new models/enums prefixed `Ladder` in `prisma/schema.prisma`; snake_case enum values exactly as listed in the spec.
- All domain code under `lib/rmhladder/`; tests colocated as `*.test.ts` (vitest root config picks them up).
- No network calls anywhere in this plan. No new dependencies.
- Run tests with `pnpm exec vitest run <path>`. Run all-plan tests with `pnpm exec vitest run lib/rmhladder`.
- Commit after every green test cycle. Conventional commits (`feat:`, `test:` style matches repo history).
- DB commands: `pnpm db:generate` (client), `pnpm db:push` (dev sync). Never `db:reset`.
- The existing better-auth `User` model in `prisma/schema.prisma` gains back-relation fields only — do not otherwise modify it.

---

### Task 1: Prisma schema — enums + global job models

**Files:**
- Modify: `prisma/schema.prisma` (append at end; also add back-relations to `User` in Task 2 only)

**Interfaces:**
- Produces: Prisma models `LadderCompany`, `LadderSource`, `LadderJob`, `LadderVerification`, `LadderScrapeRun`, `LadderSourceError`, `LadderReviewTask`, `LadderRelevanceRule` and all enums below, available via `@prisma/client`.

- [ ] **Step 1: Append enums + global models to `prisma/schema.prisma`**

```prisma
// ---------- rmhladder ----------

enum LadderPlatform { greenhouse lever ashby smartrecruiters manual generic }
enum LadderSourceStatus { active unconfigured blocked error disabled }
enum LadderJobStatus { active expired unknown }
enum LadderRemoteStatus { onsite hybrid remote_us }
enum LadderEmploymentType { internship full_time }
enum LadderProgramType { internship summer_analyst summer_associate analyst_program rotational_program new_grad leadership_development entry_level mba other }
enum LadderEarlyCareer { yes probable no unclear }
enum LadderVerificationStatus { verified_active verified_probable unverified expired broken_link duplicate non_us_role blocked_or_inaccessible needs_manual_review }
enum LadderReviewReason { broken_link blocked js_required possible_duplicate ambiguous_early_career ambiguous_us_location low_confidence aggregator_unconfirmed }
enum LadderReviewStatus { open resolved dismissed }
enum LadderRunTrigger { cron manual }

model LadderCompany {
  id               String   @id @default(nanoid())
  name             String
  normalizedName   String   @unique
  industry         String
  firmType         String
  priorityLevel    Int      @default(3) // 1 high .. 5 low
  careerUrl        String?
  usEarlyCareerUrl String?
  campusUrl        String?
  notes            String?
  enabled          Boolean  @default(true)
  createdAt        DateTime @default(now())
  sources          LadderSource[]
  jobs             LadderJob[]
  watchlistEntries LadderWatchlistEntry[]
}

model LadderSource {
  id            String             @id @default(nanoid())
  companyId     String
  company       LadderCompany      @relation(fields: [companyId], references: [id], onDelete: Cascade)
  platform      LadderPlatform
  slug          String?            // board slug for API platforms
  url           String?            // page URL for manual/generic
  status        LadderSourceStatus @default(unconfigured)
  lastSuccessAt DateTime?
  createdAt     DateTime           @default(now())
  errors        LadderSourceError[]
  @@unique([companyId, platform, slug])
}

model LadderJob {
  id                       String                @id @default(nanoid())
  companyId                String
  company                  LadderCompany         @relation(fields: [companyId], references: [id])
  title                    String
  normalizedTitle          String
  roleCategory             String?
  programType              LadderProgramType     @default(other)
  industry                 String?
  locationRaw              String?
  city                     String?
  state                    String?
  country                  String                @default("US")
  remoteStatus             LadderRemoteStatus    @default(onsite)
  employmentType           LadderEmploymentType  @default(internship)
  postingDate              DateTime?
  applicationDeadline      DateTime?
  startSeason              String?               // e.g. "Summer 2027"
  graduationYearTarget     Int?
  schoolYearTarget         String?
  sourcePlatform           LadderPlatform
  sourceUrl                String
  originalPostingUrl       String
  canonicalApplyUrl        String?
  externalRequisitionId    String?
  descriptionSummary       String?
  fullDescription          String?
  dedupeHash               String                @unique
  alternateUrls            String[]              @default([])
  matchingKeywords         String[]              @default([])
  status                   LadderJobStatus       @default(unknown)
  failedCheckCount         Int                   @default(0)
  earlyCareerScore         Int                   @default(0)
  earlyCareerClassification LadderEarlyCareer    @default(unclear)
  usLocationConfidence     Int                   @default(0)
  relevanceScoreBase       Int                   @default(0)
  urgencyFlag              Boolean               @default(false)
  discoveredAt             DateTime              @default(now())
  lastCheckedAt            DateTime?
  lastVerifiedAt           DateTime?
  verifications            LadderVerification[]
  reviewTasks              LadderReviewTask[]
  actions                  LadderJobAction[]
  applications             LadderApplication[]
  alerts                   LadderAlert[]
  @@index([status, earlyCareerClassification])
  @@index([companyId, status])
}

model LadderVerification {
  id         String                   @id @default(nanoid())
  jobId      String
  job        LadderJob                @relation(fields: [jobId], references: [id], onDelete: Cascade)
  status     LadderVerificationStatus
  confidence Int                      // 0-100
  evidence   String
  checkedAt  DateTime                 @default(now())
  @@index([jobId, checkedAt])
}

model LadderScrapeRun {
  id             String           @id @default(nanoid())
  trigger        LadderRunTrigger
  startedAt      DateTime         @default(now())
  finishedAt     DateTime?
  discoveredCount Int             @default(0)
  newCount       Int              @default(0)
  verifiedCount  Int              @default(0)
  expiredCount   Int              @default(0)
  errorCount     Int              @default(0)
  stats          Json?
  errors         LadderSourceError[]
}

model LadderSourceError {
  id        String          @id @default(nanoid())
  runId     String
  run       LadderScrapeRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  sourceId  String
  source    LadderSource    @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  errorClass String
  message   String
  httpStatus Int?
  createdAt DateTime        @default(now())
}

model LadderReviewTask {
  id         String             @id @default(nanoid())
  jobId      String?
  job        LadderJob?         @relation(fields: [jobId], references: [id], onDelete: Cascade)
  sourceId   String?
  reason     LadderReviewReason
  status     LadderReviewStatus @default(open)
  resolution String?
  resolvedById String?
  createdAt  DateTime           @default(now())
  resolvedAt DateTime?
}

model LadderRelevanceRule {
  id        String  @id @default(nanoid())
  key       String  @unique // e.g. "program:summer_analyst", "industry:investment_banking"
  label     String
  weight    Int
  enabled   Boolean @default(true)
}
```

Note: if the repo's schema uses `cuid()`/`uuid()` id defaults instead of `nanoid()`, match the existing convention — check the first existing model and mirror it.

- [ ] **Step 2: Validate + generate**

Run: `pnpm exec prisma validate && pnpm db:generate`
Expected: `The schema at prisma/schema.prisma is valid` and client generation succeeds.

- [ ] **Step 3: Push to dev DB**

Run: `pnpm db:push`
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(rmhladder): add global job-tracking schema (companies, sources, jobs, verifications, runs)"
```

---

### Task 2: Prisma schema — per-user models + User back-relations

**Files:**
- Modify: `prisma/schema.prisma` (append models; add back-relation lines inside existing `model User`)

**Interfaces:**
- Consumes: Task 1 models/enums.
- Produces: `LadderUserPrefs`, `LadderKeyword`, `LadderWatchlistEntry`, `LadderJobAction`, `LadderApplication`, `LadderAlert` + enums `LadderKeywordType`, `LadderJobActionType`, `LadderApplicationStatus`, `LadderAlertChannel`, `LadderAlertType`, `LadderDigestFrequency`. **Alert dup-guard:** `@@unique([userId, jobId, type])` on `LadderAlert`.

- [ ] **Step 1: Append per-user models**

```prisma
enum LadderKeywordType { boost block }
enum LadderJobActionType { saved applied ignored }
enum LadderApplicationStatus { not_applied planning applied networking interviewing final_round rejected offer withdrawn }
enum LadderAlertChannel { in_app email discord }
enum LadderAlertType { immediate daily_digest weekly_digest deadline changed expired review_needed }
enum LadderDigestFrequency { immediate daily weekly }

model LadderUserPrefs {
  id                 String                @id @default(nanoid())
  userId             String                @unique
  user               User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  relevanceThreshold Int                   @default(60)
  preferredCities    String[]              @default([])
  preferredProgramTypes LadderProgramType[] @default([])
  digestFrequency    LadderDigestFrequency @default(daily)
  channelInApp       Boolean               @default(true)
  channelEmail       Boolean               @default(false)
  channelDiscord     Boolean               @default(false)
  discordUserId      String?
}

model LadderKeyword {
  id      String            @id @default(nanoid())
  userId  String
  user    User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  keyword String
  weight  Int               @default(10)
  type    LadderKeywordType @default(boost)
  @@unique([userId, keyword, type])
}

model LadderWatchlistEntry {
  id        String        @id @default(nanoid())
  userId    String
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  companyId String
  company   LadderCompany @relation(fields: [companyId], references: [id], onDelete: Cascade)
  priority  Int           @default(3)
  @@unique([userId, companyId])
}

model LadderJobAction {
  id        String              @id @default(nanoid())
  userId    String
  user      User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  jobId     String
  job       LadderJob           @relation(fields: [jobId], references: [id], onDelete: Cascade)
  action    LadderJobActionType
  createdAt DateTime            @default(now())
  @@unique([userId, jobId])
}

model LadderApplication {
  id            String                  @id @default(nanoid())
  userId        String
  user          User                    @relation(fields: [userId], references: [id], onDelete: Cascade)
  jobId         String
  job           LadderJob               @relation(fields: [jobId], references: [id], onDelete: Cascade)
  status        LadderApplicationStatus @default(not_applied)
  appliedDate   DateTime?
  resumeVersion String?
  coverLetter   String?
  referralName  String?
  contactEmail  String?
  notes         String?
  followUpDate  DateTime?
  interviewDates DateTime[]             @default([])
  outcome       String?
  updatedAt     DateTime                @updatedAt
  @@unique([userId, jobId])
}

model LadderAlert {
  id        String             @id @default(nanoid())
  userId    String
  user      User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  jobId     String
  job       LadderJob          @relation(fields: [jobId], references: [id], onDelete: Cascade)
  channel   LadderAlertChannel
  type      LadderAlertType
  sentAt    DateTime           @default(now())
  readAt    DateTime?
  @@unique([userId, jobId, type])
}
```

Inside the existing `model User { ... }`, add:

```prisma
  ladderPrefs        LadderUserPrefs?
  ladderKeywords     LadderKeyword[]
  ladderWatchlist    LadderWatchlistEntry[]
  ladderJobActions   LadderJobAction[]
  ladderApplications LadderApplication[]
  ladderAlerts       LadderAlert[]
```

- [ ] **Step 2: Validate + generate + push**

Run: `pnpm exec prisma validate && pnpm db:generate && pnpm db:push`
Expected: valid, generated, `Your database is now in sync`.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(rmhladder): add per-user prefs, keywords, watchlist, applications, alerts schema"
```

---

### Task 3: Normalization + dedupe hash

**Files:**
- Create: `lib/rmhladder/normalize.ts`
- Test: `lib/rmhladder/normalize.test.ts`

**Interfaces:**
- Produces:
  - `normalizeCompanyName(name: string): string`
  - `normalizeTitle(title: string): string`
  - `locationBucket(input: { city?: string | null; state?: string | null; remoteStatus?: 'onsite'|'hybrid'|'remote_us' }): string`
  - `dedupeHash(company: string, title: string, bucket: string): string` (sha256 hex of `normalizeCompanyName(company)|normalizeTitle(title)|bucket`)

- [ ] **Step 1: Write failing tests**

```ts
// lib/rmhladder/normalize.test.ts
import { describe, expect, it } from 'vitest';
import { dedupeHash, locationBucket, normalizeCompanyName, normalizeTitle } from './normalize';

describe('normalizeCompanyName', () => {
  it('lowercases, strips punctuation and corporate suffixes', () => {
    expect(normalizeCompanyName('Moelis & Company')).toBe('moelis');
    expect(normalizeCompanyName('Deere & Co.')).toBe('deere');
    expect(normalizeCompanyName('BlackRock, Inc.')).toBe('blackrock');
    expect(normalizeCompanyName("Moody's")).toBe('moodys');
    expect(normalizeCompanyName('JPMorgan Chase')).toBe('jpmorgan chase');
  });
  it('never returns empty when the whole name is suffixes', () => {
    expect(normalizeCompanyName('Partners Group')).toBe('partners group');
  });
});

describe('normalizeTitle', () => {
  it('lowercases, strips punctuation/req ids, collapses whitespace, keeps years', () => {
    expect(normalizeTitle('Investment Banking Summer Analyst – 2027 (NYC) [R-12345]')).toBe(
      'investment banking summer analyst 2027 nyc',
    );
    expect(normalizeTitle('Software  Engineering   Intern')).toBe('software engineering intern');
  });
});

describe('locationBucket', () => {
  it('remote beats city; city+state; state only; fallback us', () => {
    expect(locationBucket({ city: 'New York', state: 'NY', remoteStatus: 'remote_us' })).toBe('remote-us');
    expect(locationBucket({ city: 'New York', state: 'NY' })).toBe('new york-ny');
    expect(locationBucket({ state: 'TX' })).toBe('tx');
    expect(locationBucket({})).toBe('us');
  });
});

describe('dedupeHash', () => {
  it('is stable and insensitive to formatting differences', () => {
    const a = dedupeHash('BlackRock, Inc.', 'Summer Analyst – 2027', 'new york-ny');
    const b = dedupeHash('blackrock', 'summer analyst 2027', 'new york-ny');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs when year differs', () => {
    expect(dedupeHash('X', 'Summer Analyst 2027', 'us')).not.toBe(dedupeHash('X', 'Summer Analyst 2028', 'us'));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run lib/rmhladder/normalize.test.ts`
Expected: FAIL — cannot resolve `./normalize`.

- [ ] **Step 3: Implement**

```ts
// lib/rmhladder/normalize.ts
import { createHash } from 'node:crypto';

const COMPANY_SUFFIXES =
  /\b(incorporated|inc|llc|llp|lp|ltd|plc|corp|corporation|company|co|group|holdings|partners|management|capital markets)\b\.?/g;

export function normalizeCompanyName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stripped = cleaned.replace(COMPANY_SUFFIXES, ' ').replace(/\s+/g, ' ').trim();
  // Guard: "Partners Group" would strip to nothing — fall back to the pre-suffix form.
  return stripped || cleaned;
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]|\(r-?\d+\)|\br-?\d{4,}\b/g, ' ') // req-id noise
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function locationBucket(input: {
  city?: string | null;
  state?: string | null;
  remoteStatus?: 'onsite' | 'hybrid' | 'remote_us';
}): string {
  if (input.remoteStatus === 'remote_us') return 'remote-us';
  const city = input.city?.trim().toLowerCase();
  const state = input.state?.trim().toLowerCase();
  if (city && state) return `${city}-${state}`;
  if (state) return state;
  return 'us';
}

export function dedupeHash(company: string, title: string, bucket: string): string {
  const key = `${normalizeCompanyName(company)}|${normalizeTitle(title)}|${bucket}`;
  return createHash('sha256').update(key).digest('hex');
}
```

Note: `normalizeCompanyName('Moelis & Company')` — `&`→space, suffix `company` stripped → `moelis`. If the suffix regex strips a word you need (e.g. "Capital Group"), that is acceptable for hashing (both sides normalize identically); adjust tests only if a real collision between two *different seeded companies* appears — add a test proving the collision first.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run lib/rmhladder/normalize.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add lib/rmhladder/normalize.ts lib/rmhladder/normalize.test.ts
git commit -m "feat(rmhladder): normalization + dedupe hashing"
```

---

### Task 4: US-location classifier

**Files:**
- Create: `lib/rmhladder/classifiers/us-location.ts`
- Test: `lib/rmhladder/classifiers/us-location.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface LocationInput { locationRaw?: string | null; city?: string | null; state?: string | null; country?: string | null; }
  interface LocationResult { isUS: boolean | null; confidence: number; city: string | null; state: string | null; remoteStatus: 'onsite' | 'hybrid' | 'remote_us'; }
  function classifyUSLocation(input: LocationInput): LocationResult
  ```
  `isUS: null` means unclear (confidence < 50) → pipeline routes to review with `ambiguous_us_location`.

- [ ] **Step 1: Write failing tests**

```ts
// lib/rmhladder/classifiers/us-location.test.ts
import { describe, expect, it } from 'vitest';
import { classifyUSLocation } from './us-location';

describe('classifyUSLocation', () => {
  it('explicit country wins', () => {
    expect(classifyUSLocation({ country: 'United States', city: 'New York' }).isUS).toBe(true);
    expect(classifyUSLocation({ country: 'US' }).isUS).toBe(true);
    expect(classifyUSLocation({ country: 'United Kingdom', locationRaw: 'London' }).isUS).toBe(false);
  });
  it('parses "City, ST" raw locations from the gazetteer', () => {
    const r = classifyUSLocation({ locationRaw: 'Charlotte, NC' });
    expect(r).toMatchObject({ isUS: true, city: 'Charlotte', state: 'NC' });
    expect(r.confidence).toBeGreaterThanOrEqual(80);
  });
  it('detects Remote US', () => {
    expect(classifyUSLocation({ locationRaw: 'Remote - US' }).remoteStatus).toBe('remote_us');
    expect(classifyUSLocation({ locationRaw: 'Remote (United States)' }).isUS).toBe(true);
    expect(classifyUSLocation({ locationRaw: 'Hybrid - New York, NY' }).remoteStatus).toBe('hybrid');
  });
  it('full state names count', () => {
    expect(classifyUSLocation({ locationRaw: 'Austin, Texas' })).toMatchObject({ isUS: true, state: 'TX' });
  });
  it('known non-US cities are rejected', () => {
    expect(classifyUSLocation({ locationRaw: 'London' }).isUS).toBe(false);
    expect(classifyUSLocation({ locationRaw: 'Toronto, ON' }).isUS).toBe(false);
  });
  it('unknown location is unclear, low confidence', () => {
    const r = classifyUSLocation({ locationRaw: 'Main Campus' });
    expect(r.isUS).toBeNull();
    expect(r.confidence).toBeLessThan(50);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run lib/rmhladder/classifiers/us-location.test.ts`
Expected: FAIL — cannot resolve `./us-location`.

- [ ] **Step 3: Implement**

```ts
// lib/rmhladder/classifiers/us-location.ts
export interface LocationInput {
  locationRaw?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}
export interface LocationResult {
  isUS: boolean | null;
  confidence: number;
  city: string | null;
  state: string | null;
  remoteStatus: 'onsite' | 'hybrid' | 'remote_us';
}

const STATE_NAMES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};
const STATE_ABBREVS = new Set(Object.values(STATE_NAMES));
const US_COUNTRY = /^(us|usa|u\.s\.?a?\.?|united states( of america)?)$/i;
// word-bounded so "Indianapolis" doesn't match "india"
const NON_US_COUNTRY_HINT = /\b(kingdom|canada|india|singapore|australia|germany|france|japan|china|ireland|switzerland|mexico|brazil|poland|hong ?kong)\b/i;
// spec's 28 preferred locations get a confidence boost when matched
export const PREFERRED_CITIES = new Set([
  'new york', 'charlotte', 'chicago', 'san francisco', 'los angeles', 'boston', 'washington',
  'minneapolis', 'dallas', 'houston', 'atlanta', 'miami', 'seattle', 'austin', 'denver',
  'philadelphia', 'nashville', 'phoenix', 'salt lake city', 'raleigh', 'jersey city',
  'stamford', 'menlo park', 'palo alto', 'mountain view', 'san jose',
]);
const NON_US_CITIES = /\b(london|toronto|vancouver|montreal|paris|frankfurt|dublin|zurich|geneva|mumbai|bangalore|bengaluru|singapore|sydney|tokyo|hong ?kong|shanghai|beijing|warsaw|madrid|milan|amsterdam|tel aviv|mexico city|s[aã]o paulo)\b/i;

export function classifyUSLocation(input: LocationInput): LocationResult {
  const raw = (input.locationRaw ?? '').trim();
  const lower = raw.toLowerCase();
  let remoteStatus: LocationResult['remoteStatus'] = 'onsite';
  if (/\bhybrid\b/i.test(raw)) remoteStatus = 'hybrid';
  else if (/\bremote\b/i.test(raw)) remoteStatus = 'remote_us'; // US-ness still checked below

  // 1. Explicit country field
  if (input.country) {
    if (US_COUNTRY.test(input.country.trim())) {
      const parsed = parseCityState(raw, input.city, input.state);
      return { isUS: true, confidence: 95, remoteStatus, ...parsed };
    }
    return { isUS: false, confidence: 95, city: null, state: null, remoteStatus };
  }
  // 2. Non-US signals in raw string
  if (NON_US_CITIES.test(lower) || NON_US_COUNTRY_HINT.test(lower)) {
    return { isUS: false, confidence: 85, city: null, state: null, remoteStatus };
  }
  // 3. Remote + US markers
  if (remoteStatus === 'remote_us') {
    if (/\b(us|usa|united states)\b/i.test(lower) || !raw.replace(/remote|[-()]/gi, '').trim()) {
      return { isUS: /\b(us|usa|united states)\b/i.test(lower) ? true : null,
               confidence: /\b(us|usa|united states)\b/i.test(lower) ? 85 : 40,
               city: null, state: null, remoteStatus };
    }
  }
  // 4. City, ST / City, StateName patterns
  const parsed = parseCityState(raw, input.city, input.state);
  if (parsed.state) {
    const conf = parsed.city && PREFERRED_CITIES.has(parsed.city.toLowerCase()) ? 90 : 80;
    return { isUS: true, confidence: conf, remoteStatus, ...parsed };
  }
  // 5. Unclear
  return { isUS: null, confidence: 30, city: parsed.city, state: null, remoteStatus };
}

function parseCityState(
  raw: string,
  cityField?: string | null,
  stateField?: string | null,
): { city: string | null; state: string | null } {
  let state = stateField?.trim().toUpperCase() ?? null;
  if (state && !STATE_ABBREVS.has(state)) state = STATE_NAMES[state.toLowerCase()] ?? null;
  let city = cityField?.trim() ?? null;
  if (!state) {
    const cleaned = raw.replace(/\b(hybrid|remote)\b\s*[-–]?\s*/gi, '');
    const m = cleaned.match(/([A-Za-z .']+?),\s*([A-Za-z .]+)$/);
    if (m) {
      const cand = m[2].trim();
      const abbr = cand.toUpperCase();
      if (STATE_ABBREVS.has(abbr)) state = abbr;
      else if (STATE_NAMES[cand.toLowerCase()]) state = STATE_NAMES[cand.toLowerCase()];
      if (state && !city) city = m[1].trim();
    }
  }
  return { city, state };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run lib/rmhladder/classifiers/us-location.test.ts`
Expected: PASS. If `Remote - US` case fails on the `isUS` value, check branch 3: `Remote - US` must hit the `\b(us|usa|united states)\b` test → `isUS: true`.

- [ ] **Step 5: Commit**

```bash
git add lib/rmhladder/classifiers/us-location.ts lib/rmhladder/classifiers/us-location.test.ts
git commit -m "feat(rmhladder): US location classifier with gazetteer + remote detection"
```

---

### Task 5: Early-career classifier

**Files:**
- Create: `lib/rmhladder/classifiers/early-career.ts`
- Test: `lib/rmhladder/classifiers/early-career.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type ProgramType = 'internship'|'summer_analyst'|'summer_associate'|'analyst_program'|'rotational_program'|'new_grad'|'leadership_development'|'entry_level'|'mba'|'other';
  interface EarlyCareerResult { score: number; classification: 'yes'|'probable'|'no'|'unclear'; programType: ProgramType; graduationYearTarget: number | null; schoolYearTarget: string | null; }
  function classifyEarlyCareer(title: string, description?: string): EarlyCareerResult
  ```
  Thresholds: score ≥ 70 → `yes`; 50–69 → `probable`; ≤ 25 → `no`; else `unclear`.

- [ ] **Step 1: Write failing tests**

```ts
// lib/rmhladder/classifiers/early-career.test.ts
import { describe, expect, it } from 'vitest';
import { classifyEarlyCareer } from './early-career';

describe('classifyEarlyCareer', () => {
  it('summer analyst is a clear yes with program type', () => {
    const r = classifyEarlyCareer('Investment Banking Summer Analyst 2027');
    expect(r.classification).toBe('yes');
    expect(r.programType).toBe('summer_analyst');
    expect(r.graduationYearTarget).toBe(2027);
  });
  it('intern titles classify yes/internship', () => {
    expect(classifyEarlyCareer('Software Engineering Intern')).toMatchObject({
      classification: 'yes', programType: 'internship',
    });
  });
  it('senior titles are no', () => {
    expect(classifyEarlyCareer('Senior Software Engineer').classification).toBe('no');
    expect(classifyEarlyCareer('Vice President, Corporate Development').classification).toBe('no');
    expect(classifyEarlyCareer('Managing Director - M&A').classification).toBe('no');
  });
  it('experience requirements in description push to no', () => {
    const r = classifyEarlyCareer('Strategy Associate', 'Requires 7+ years of consulting experience.');
    expect(r.classification).toBe('no');
  });
  it('program types are detected in priority order', () => {
    expect(classifyEarlyCareer('2026 Rotational Analyst Program').programType).toBe('rotational_program');
    expect(classifyEarlyCareer('Finance Leadership Development Program').programType).toBe('leadership_development');
    expect(classifyEarlyCareer('New Grad Software Engineer').programType).toBe('new_grad');
    expect(classifyEarlyCareer('MBA Summer Associate').programType).toBe('summer_associate');
    expect(classifyEarlyCareer('Product Management MBA Intern').programType).toBe('mba');
  });
  it('school year target detected', () => {
    const r = classifyEarlyCareer('Sophomore Summer Analyst Program', 'Open to current sophomores.');
    expect(r.schoolYearTarget).toBe('sophomore');
  });
  it('ambiguous titles are unclear', () => {
    const r = classifyEarlyCareer('Operations Specialist');
    expect(r.classification).toBe('unclear');
  });
  it('manager alone is negative but "program manager, early careers" recovers', () => {
    expect(classifyEarlyCareer('Engineering Manager').classification).toBe('no');
    expect(classifyEarlyCareer('Analyst, Early Careers Program').classification).toBe('yes');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run lib/rmhladder/classifiers/early-career.test.ts`
Expected: FAIL — cannot resolve `./early-career`.

- [ ] **Step 3: Implement**

```ts
// lib/rmhladder/classifiers/early-career.ts
export type ProgramType =
  | 'internship' | 'summer_analyst' | 'summer_associate' | 'analyst_program'
  | 'rotational_program' | 'new_grad' | 'leadership_development' | 'entry_level' | 'mba' | 'other';

export interface EarlyCareerResult {
  score: number;
  classification: 'yes' | 'probable' | 'no' | 'unclear';
  programType: ProgramType;
  graduationYearTarget: number | null;
  schoolYearTarget: string | null;
}

// [pattern, weight] — title matches count double
const POSITIVE: Array<[RegExp, number]> = [
  [/\bsummer analyst\b/i, 40], [/\bsummer associate\b/i, 40], [/\bintern(ship)?\b/i, 35],
  [/\bnew grad(uate)?\b/i, 35], [/\brotational (analyst )?program\b/i, 35],
  [/\bleadership development program\b/i, 35], [/\banalyst (development )?program\b/i, 30],
  [/\bearly careers?\b/i, 30], [/\bcampus\b/i, 20], [/\buniversity program\b/i, 25],
  [/\bentry[- ]level\b/i, 25], [/\brecent graduates?\b/i, 25], [/\bstudents?\b/i, 15],
  [/\bassociate consultant\b/i, 25], [/\bbusiness analyst\b/i, 15],
  [/\b(sophomore|junior|senior year|freshman)\b/i, 20], [/\bmba intern\b/i, 30],
  [/\bclass of 20(2[5-9]|3[0-2])\b/i, 25], [/\b20(2[5-9]|3[0-2])\b/, 10],
];
const NEGATIVE: Array<[RegExp, number]> = [
  [/\bvice president\b|\bvp\b/i, 60], [/\b(executive|managing) director\b/i, 60],
  [/\bdirector\b/i, 50], [/\bprincipal\b/i, 50], [/\bhead of\b/i, 45],
  [/\bsenior\b(?! year)/i, 30], [/\bstaff (engineer|scientist)\b/i, 40], [/\blead\b/i, 25],
  [/\bmanager\b/i, 25], [/\bexpert\b/i, 25], [/\bexperienced professional\b/i, 40],
  [/\blateral\b/i, 30], [/\b([5-9]|1[0-9])\+? ?(years|yrs)\b/i, 45],
];
// order matters: first match wins
const PROGRAM_TYPES: Array<[RegExp, ProgramType]> = [
  [/\bmba intern\b/i, 'mba'],
  [/\bsummer analyst\b/i, 'summer_analyst'],
  [/\bsummer associate\b/i, 'summer_associate'],
  [/\brotational\b/i, 'rotational_program'],
  [/\bleadership development\b/i, 'leadership_development'],
  [/\banalyst (development )?program\b/i, 'analyst_program'],
  [/\bnew grad(uate)?\b/i, 'new_grad'],
  [/\bintern(ship)?\b/i, 'internship'],
  [/\bentry[- ]level\b/i, 'entry_level'],
  [/\bmba\b/i, 'mba'],
];
const SCHOOL_YEARS = /\b(freshman|sophomore|junior|senior)\b/i;

export function classifyEarlyCareer(title: string, description = ''): EarlyCareerResult {
  const text = `${title}\n${description}`;
  let score = 0;
  let hasNegative = false;
  for (const [re, w] of POSITIVE) {
    if (re.test(title)) score += w;           // title hit: full weight
    else if (re.test(description)) score += Math.floor(w / 2);
  }
  for (const [re, w] of NEGATIVE) {
    if (re.test(title)) { score -= w; hasNegative = true; }
    else if (re.test(description)) { score -= Math.floor(w / 2); hasNegative = true; }
  }
  score = Math.max(0, Math.min(100, score));

  // unambiguous program markers in the title floor the score
  const strongTitle = /\b(summer analyst|summer associate|new grad(uate)?|early careers?|intern(ship)?|rotational)\b/i;
  if (strongTitle.test(title)) score = Math.max(score, 75);

  let classification: EarlyCareerResult['classification'];
  if (score >= 70) classification = 'yes';
  else if (score >= 50) classification = 'probable';
  else if (hasNegative && score <= 25) classification = 'no';
  else classification = 'unclear';
  // hard negatives in the title always kill it unless an explicit program marker is also in the title
  const hardNeg = /\b(vice president|managing director|executive director|senior(?! year)|director|principal|manager|head of|staff engineer)\b/i;
  const hardPos = /\b(summer analyst|summer associate|intern(ship)?|new grad|early careers?|rotational|campus)\b/i;
  if (hardNeg.test(title) && !hardPos.test(title)) classification = 'no';

  const programType = PROGRAM_TYPES.find(([re]) => re.test(text))?.[1] ?? 'other';
  const gradMatch = text.match(/\b(20(2[5-9]|3[0-2]))\b/);
  const schoolMatch = text.match(SCHOOL_YEARS);
  return {
    score,
    classification,
    programType,
    graduationYearTarget: gradMatch ? Number(gradMatch[1]) : null,
    schoolYearTarget: schoolMatch ? schoolMatch[1].toLowerCase() : null,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run lib/rmhladder/classifiers/early-career.test.ts`
Expected: PASS. Trace the tricky cases: `'Analyst, Early Careers Program'` hits the `strongTitle` floor (75 → yes, no hard-negative in title); `'Operations Specialist'` has no positive or negative signals → score 0, `hasNegative` false → `unclear`; `'Strategy Associate'` + "7+ years" description → negative present, score ≤25 → `no`.

- [ ] **Step 5: Commit**

```bash
git add lib/rmhladder/classifiers/early-career.ts lib/rmhladder/classifiers/early-career.test.ts
git commit -m "feat(rmhladder): early-career classifier with program type + grad year extraction"
```

---

### Task 6: Relevance scoring

**Files:**
- Create: `lib/rmhladder/scoring.ts`
- Test: `lib/rmhladder/scoring.test.ts`

**Interfaces:**
- Consumes: `ProgramType` from Task 5.
- Produces:
  ```ts
  interface ScorableJob { programType: ProgramType; roleCategory?: string | null; industry?: string | null; isUS: boolean; remoteStatus: 'onsite'|'hybrid'|'remote_us'; city?: string | null; postingDate?: Date | null; applicationDeadline?: Date | null; companyPriority: number; companyIsTarget: boolean; title: string; }
  interface UserScoringContext { keywords: Array<{ keyword: string; weight: number; type: 'boost'|'block' }>; watchlistCompanyIds: Set<string>; companyId: string; preferredCities: string[]; }
  function computeBaseScore(job: ScorableJob, now?: Date): { score: number; urgencyFlag: boolean }
  function computeUserBoost(job: ScorableJob, ctx: UserScoringContext): { boost: number; matched: string[]; blocked: boolean }
  const DEFAULT_RELEVANCE_RULES: Array<{ key: string; label: string; weight: number }>
  ```
  Final relevance = `clamp(base + boost, 0, 100)`; `blocked === true` disqualifies from alerts.

- [ ] **Step 1: Write failing tests**

```ts
// lib/rmhladder/scoring.test.ts
import { describe, expect, it } from 'vitest';
import { computeBaseScore, computeUserBoost } from './scoring';

const base = {
  programType: 'summer_analyst' as const,
  roleCategory: 'investment_banking',
  industry: 'Investment Banking',
  isUS: true,
  remoteStatus: 'onsite' as const,
  city: 'New York',
  postingDate: new Date('2026-07-03'),
  applicationDeadline: new Date('2026-07-15'),
  companyPriority: 1,
  companyIsTarget: true,
  title: 'Investment Banking Summer Analyst 2027',
};
const NOW = new Date('2026-07-05');

describe('computeBaseScore', () => {
  it('stacks program, industry, US, target-firm, recency, deadline weights', () => {
    const { score, urgencyFlag } = computeBaseScore(base, NOW);
    // US 20 + summer_analyst 30 + IB 30 + target 20 + recent 15 + deadline 10 = 125 → clamped 100
    expect(score).toBe(100);
    expect(urgencyFlag).toBe(true);
  });
  it('remote US gets +15 instead of +20', () => {
    const a = computeBaseScore({ ...base, isUS: true, remoteStatus: 'remote_us' }, NOW).score;
    const b = computeBaseScore({ ...base, isUS: true, remoteStatus: 'onsite' }, NOW).score;
    expect(b - a).toBe(5);
  });
  it('senior title terms subtract', () => {
    const r = computeBaseScore({ ...base, title: 'Senior Director, Strategy', programType: 'other', industry: null, companyIsTarget: false, postingDate: null, applicationDeadline: null }, NOW);
    expect(r.score).toBeLessThan(25);
  });
  it('no deadline → no urgency flag', () => {
    expect(computeBaseScore({ ...base, applicationDeadline: null }, NOW).urgencyFlag).toBe(false);
  });
});

describe('computeUserBoost', () => {
  const ctx = {
    keywords: [
      { keyword: 'investment banking', weight: 15, type: 'boost' as const },
      { keyword: 'crypto', weight: 0, type: 'block' as const },
    ],
    watchlistCompanyIds: new Set(['c1']),
    companyId: 'c1',
    preferredCities: ['New York'],
  };
  it('adds keyword, watchlist, and city boosts and reports matches', () => {
    const r = computeUserBoost(base, ctx);
    expect(r.boost).toBe(15 + 20 + 10);
    expect(r.matched).toContain('investment banking');
    expect(r.blocked).toBe(false);
  });
  it('block keyword disqualifies', () => {
    const r = computeUserBoost({ ...base, title: 'Crypto Analyst Intern' }, ctx);
    expect(r.blocked).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run lib/rmhladder/scoring.test.ts`
Expected: FAIL — cannot resolve `./scoring`.

- [ ] **Step 3: Implement**

```ts
// lib/rmhladder/scoring.ts
import type { ProgramType } from './classifiers/early-career';

export interface ScorableJob {
  programType: ProgramType;
  roleCategory?: string | null;
  industry?: string | null;
  isUS: boolean;
  remoteStatus: 'onsite' | 'hybrid' | 'remote_us';
  city?: string | null;
  postingDate?: Date | null;
  applicationDeadline?: Date | null;
  companyPriority: number;
  companyIsTarget: boolean;
  title: string;
}
export interface UserScoringContext {
  keywords: Array<{ keyword: string; weight: number; type: 'boost' | 'block' }>;
  watchlistCompanyIds: Set<string>;
  companyId: string;
  preferredCities: string[];
}

const PROGRAM_WEIGHTS: Partial<Record<ProgramType, number>> = {
  summer_analyst: 30, summer_associate: 25, internship: 25, analyst_program: 25,
  new_grad: 25, rotational_program: 25, leadership_development: 18, entry_level: 15, mba: 15,
};
const INDUSTRY_WEIGHTS: Array<[RegExp, number, string]> = [
  [/investment banking/i, 30, 'industry:investment_banking'],
  [/corporate (banking|strategy|development)/i, 25, 'industry:corporate'],
  [/consult/i, 20, 'industry:consulting'],
  [/product management|product/i, 20, 'industry:product'],
  [/markets|sales & trading|trading/i, 18, 'industry:markets'],
  [/asset management|wealth/i, 18, 'industry:asset_management'],
  [/risk/i, 18, 'industry:risk'],
  [/business analyst|business operations/i, 20, 'industry:business'],
];
const TITLE_PENALTIES: Array<[RegExp, number]> = [
  [/\bvp\b|vice president/i, 60], [/\bdirector\b/i, 50], [/\bprincipal\b/i, 50],
  [/\bsenior\b(?! year)/i, 25], [/\bmanager\b/i, 20],
];
const DAY = 86_400_000;

export const DEFAULT_RELEVANCE_RULES = [
  { key: 'geo:us', label: 'US-based role', weight: 20 },
  { key: 'geo:remote_us', label: 'Remote US role', weight: 15 },
  { key: 'program:summer_analyst', label: 'Summer Analyst', weight: 30 },
  { key: 'program:internship', label: 'Internship', weight: 25 },
  { key: 'program:analyst_program', label: 'Analyst Program', weight: 25 },
  { key: 'program:new_grad', label: 'New Grad', weight: 25 },
  { key: 'company:target', label: 'Target company match', weight: 20 },
  { key: 'recency:7d', label: 'Posted within 7 days', weight: 15 },
  { key: 'deadline:14d', label: 'Deadline within 14 days', weight: 10 },
  { key: 'user:watchlist', label: 'Watchlisted company', weight: 20 },
  { key: 'user:city', label: 'Preferred city', weight: 10 },
];

export function computeBaseScore(job: ScorableJob, now = new Date()): { score: number; urgencyFlag: boolean } {
  let score = 0;
  if (job.isUS) score += job.remoteStatus === 'remote_us' ? 15 : 20;
  score += PROGRAM_WEIGHTS[job.programType] ?? 0;
  const haystack = `${job.industry ?? ''} ${job.roleCategory ?? ''} ${job.title}`;
  const industryHit = INDUSTRY_WEIGHTS.find(([re]) => re.test(haystack));
  if (industryHit) score += industryHit[1];
  if (job.companyIsTarget) score += 20;
  if (job.postingDate && now.getTime() - job.postingDate.getTime() <= 7 * DAY) score += 15;
  let urgencyFlag = false;
  if (job.applicationDeadline) {
    const until = job.applicationDeadline.getTime() - now.getTime();
    if (until >= 0 && until <= 14 * DAY) { score += 10; urgencyFlag = true; }
  }
  for (const [re, w] of TITLE_PENALTIES) if (re.test(job.title)) score -= w;
  return { score: Math.max(0, Math.min(100, score)), urgencyFlag };
}

export function computeUserBoost(
  job: ScorableJob,
  ctx: UserScoringContext,
): { boost: number; matched: string[]; blocked: boolean } {
  const haystack = `${job.title} ${job.industry ?? ''} ${job.roleCategory ?? ''}`.toLowerCase();
  const matched: string[] = [];
  let boost = 0;
  for (const k of ctx.keywords) {
    if (!haystack.includes(k.keyword.toLowerCase())) continue;
    if (k.type === 'block') return { boost: 0, matched, blocked: true };
    matched.push(k.keyword);
    boost += k.weight;
  }
  if (ctx.watchlistCompanyIds.has(ctx.companyId)) boost += 20;
  if (job.city && ctx.preferredCities.some((c) => c.toLowerCase() === job.city!.toLowerCase())) boost += 10;
  return { boost, matched, blocked: false };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run lib/rmhladder/scoring.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/rmhladder/scoring.ts lib/rmhladder/scoring.test.ts
git commit -m "feat(rmhladder): relevance scoring (base + per-user boost)"
```

---

### Task 7: Verification status logic + alert gate

**Files:**
- Create: `lib/rmhladder/verification.ts`
- Test: `lib/rmhladder/verification.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface VerificationEvidence { fetched: boolean; httpStatus?: number; apiSource: boolean; companyMatch: boolean; titleMatch: boolean; usConfirmed: boolean; applyPresent: boolean; reqIdPresent: boolean; closedLanguage: boolean; blocked: boolean; isSearchResultsPage: boolean; companyName: string; jobTitle: string; locationLabel?: string; platform: string; }
  interface VerificationOutcome { status: LadderVerificationStatus-like string; confidence: number; evidence: string; }
  function computeVerification(e: VerificationEvidence): VerificationOutcome
  function passesAlertGate(args: { status: string; confidence: number; isUS: boolean; earlyCareer: 'yes'|'probable'|'no'|'unclear'; finalRelevance: number; userThreshold: number; alreadyAlerted: boolean; blockedKeyword: boolean }): boolean
  ```

- [ ] **Step 1: Write failing tests**

```ts
// lib/rmhladder/verification.test.ts
import { describe, expect, it } from 'vitest';
import { computeVerification, passesAlertGate } from './verification';

const good = {
  fetched: true, httpStatus: 200, apiSource: true, companyMatch: true, titleMatch: true,
  usConfirmed: true, applyPresent: true, reqIdPresent: true, closedLanguage: false,
  blocked: false, isSearchResultsPage: false,
  companyName: 'Stripe', jobTitle: 'Product Management Intern', locationLabel: 'New York, NY',
  platform: 'greenhouse',
};

describe('computeVerification', () => {
  it('API source with full evidence → verified_active, high confidence, readable evidence', () => {
    const r = computeVerification(good);
    expect(r.status).toBe('verified_active');
    expect(r.confidence).toBeGreaterThanOrEqual(85);
    expect(r.evidence).toContain('Stripe');
    expect(r.evidence).toContain('Product Management Intern');
  });
  it('HTML-verified without req id → verified_probable band', () => {
    const r = computeVerification({ ...good, apiSource: false, reqIdPresent: false });
    expect(['verified_probable', 'verified_active']).toContain(r.status);
    expect(r.confidence).toBeGreaterThanOrEqual(60);
  });
  it('closed language → expired regardless of other evidence', () => {
    expect(computeVerification({ ...good, closedLanguage: true }).status).toBe('expired');
  });
  it('blocked page → blocked_or_inaccessible', () => {
    expect(computeVerification({ ...good, blocked: true, fetched: false }).status).toBe('blocked_or_inaccessible');
  });
  it('fetch failure → broken_link', () => {
    expect(computeVerification({ ...good, fetched: false, httpStatus: 404, apiSource: false }).status).toBe('broken_link');
  });
  it('search results page → needs_manual_review', () => {
    expect(computeVerification({ ...good, isSearchResultsPage: true }).status).toBe('needs_manual_review');
  });
  it('weak evidence → needs_manual_review', () => {
    const r = computeVerification({ ...good, apiSource: false, titleMatch: false, applyPresent: false, reqIdPresent: false });
    expect(r.status).toBe('needs_manual_review');
    expect(r.confidence).toBeLessThan(60);
  });
});

describe('passesAlertGate', () => {
  const ok = { status: 'verified_active', confidence: 90, isUS: true, earlyCareer: 'yes' as const,
               finalRelevance: 75, userThreshold: 60, alreadyAlerted: false, blockedKeyword: false };
  it('passes the happy path', () => expect(passesAlertGate(ok)).toBe(true));
  it.each([
    ['unverified status', { ...ok, status: 'unverified' }],
    ['low confidence', { ...ok, confidence: 74 }],
    ['non-US', { ...ok, isUS: false }],
    ['not early-career', { ...ok, earlyCareer: 'no' as const }],
    ['below threshold', { ...ok, finalRelevance: 59 }],
    ['duplicate alert', { ...ok, alreadyAlerted: true }],
    ['blocked keyword', { ...ok, blockedKeyword: true }],
  ])('fails on %s', (_label, args) => expect(passesAlertGate(args)).toBe(false));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run lib/rmhladder/verification.test.ts`
Expected: FAIL — cannot resolve `./verification`.

- [ ] **Step 3: Implement**

```ts
// lib/rmhladder/verification.ts
export interface VerificationEvidence {
  fetched: boolean;
  httpStatus?: number;
  apiSource: boolean;
  companyMatch: boolean;
  titleMatch: boolean;
  usConfirmed: boolean;
  applyPresent: boolean;
  reqIdPresent: boolean;
  closedLanguage: boolean;
  blocked: boolean;
  isSearchResultsPage: boolean;
  companyName: string;
  jobTitle: string;
  locationLabel?: string;
  platform: string;
}
export interface VerificationOutcome { status: string; confidence: number; evidence: string }

export function computeVerification(e: VerificationEvidence): VerificationOutcome {
  if (e.blocked) return out('blocked_or_inaccessible', 0, `Page on ${e.platform} is blocked by robots.txt/anti-bot; not scraped. URL preserved for manual review.`);
  if (e.closedLanguage) return out('expired', 95, `Posting for "${e.jobTitle}" at ${e.companyName} contains closed/no-longer-accepting language.`);
  if (!e.fetched) return out('broken_link', 0, `Fetch failed (HTTP ${e.httpStatus ?? 'n/a'}) for "${e.jobTitle}" at ${e.companyName}.`);
  if (e.isSearchResultsPage) return out('needs_manual_review', 30, `URL for "${e.jobTitle}" at ${e.companyName} resolves to a generic search/results page, not a posting.`);

  let confidence = 0;
  const parts: string[] = [];
  if (e.apiSource) { confidence += 40; parts.push(`official ${e.platform} API returned the posting`); }
  else { confidence += 20; parts.push(`page returned HTTP ${e.httpStatus ?? 200}`); }
  if (e.titleMatch) { confidence += 15; parts.push(`title matched "${e.jobTitle}"`); }
  if (e.companyMatch) { confidence += 10; parts.push(`page contained company name "${e.companyName}"`); }
  if (e.usConfirmed) { confidence += 15; parts.push(`location confirmed US${e.locationLabel ? ` (${e.locationLabel})` : ''}`); }
  if (e.applyPresent) { confidence += 10; parts.push('apply mechanism present'); }
  if (e.reqIdPresent) { confidence += 5; parts.push('requisition ID present'); }
  confidence += 5; parts.push('no expired/closed language detected'); // closedLanguage handled above
  confidence = Math.min(100, confidence);

  const evidence = `Verified because ${parts.join(', ')}.`;
  if (confidence >= 85) return { status: 'verified_active', confidence, evidence };
  if (confidence >= 60) return { status: 'verified_probable', confidence, evidence };
  return { status: 'needs_manual_review', confidence, evidence: `Low-confidence evidence: ${parts.join(', ')}.` };
}

const out = (status: string, confidence: number, evidence: string): VerificationOutcome => ({ status, confidence, evidence });

export function passesAlertGate(args: {
  status: string; confidence: number; isUS: boolean;
  earlyCareer: 'yes' | 'probable' | 'no' | 'unclear';
  finalRelevance: number; userThreshold: number;
  alreadyAlerted: boolean; blockedKeyword: boolean;
}): boolean {
  return (
    (args.status === 'verified_active' || args.status === 'verified_probable') &&
    args.confidence >= 75 &&
    args.isUS &&
    (args.earlyCareer === 'yes' || args.earlyCareer === 'probable') &&
    args.finalRelevance >= args.userThreshold &&
    !args.alreadyAlerted &&
    !args.blockedKeyword
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run lib/rmhladder/verification.test.ts`
Expected: PASS. Check the "weak evidence" case lands < 60: 20 (fetch) + 10 (company) + 15 (US) + 5 (no closed) = 50 → `needs_manual_review`. ✓

- [ ] **Step 5: Commit**

```bash
git add lib/rmhladder/verification.ts lib/rmhladder/verification.test.ts
git commit -m "feat(rmhladder): verification status logic + alert gate"
```

---

### Task 8: Company seed data + seed script

**Files:**
- Create: `lib/rmhladder/seed/companies.ts` (full firm list as data)
- Create: `scripts/seed-ladder.ts`
- Test: `lib/rmhladder/seed/companies.test.ts`
- Modify: `package.json` (add script `"ladder:seed": "pnpm exec tsx scripts/seed-ladder.ts"`)

**Interfaces:**
- Consumes: `normalizeCompanyName` (Task 3), Prisma models (Tasks 1–2).
- Produces:
  ```ts
  interface SeedCompany { name: string; industry: string; firmType: string; priorityLevel: number; usEarlyCareerUrl?: string }
  const SEED_COMPANIES: SeedCompany[]  // ~400 firms
  ```
  Seed script upserts companies by `normalizedName` and creates one `unconfigured` source per company per API platform (greenhouse/lever/ashby/smartrecruiters) — the Plan 2 slug prober activates the real ones — plus `manual` sources (status `active`) where `usEarlyCareerUrl` is present.

- [ ] **Step 1: Create the data file**

`lib/rmhladder/seed/companies.ts` — groups map to `{ industry, firmType, priorityLevel }`. **Transcribe every firm from the spec's Target Firms section** (`docs/superpowers/specs/2026-07-05-rmhladder-design.md` § references the original list; the authoritative full list below). Structure:

```ts
// lib/rmhladder/seed/companies.ts
export interface SeedCompany {
  name: string;
  industry: string;
  firmType: string;
  priorityLevel: number; // 1 = highest
  usEarlyCareerUrl?: string;
}

const group = (
  names: string[], industry: string, firmType: string, priorityLevel: number,
): SeedCompany[] => names.map((name) => ({ name, industry, firmType, priorityLevel }));

export const SEED_COMPANIES: SeedCompany[] = [
  ...group(['Goldman Sachs', 'JPMorgan Chase', 'Morgan Stanley', 'Bank of America', 'Citi', 'Wells Fargo', 'Barclays', 'UBS', 'Deutsche Bank', 'HSBC', 'RBC Capital Markets', 'TD Securities', 'BMO Capital Markets', 'Scotiabank', 'Nomura', 'Mizuho', 'SMBC', 'MUFG', 'Macquarie'], 'Investment Banking', 'bulge_bracket', 1),
  ...group(['Evercore', 'Lazard', 'Centerview Partners', 'PJT Partners', 'Moelis & Company', 'Perella Weinberg Partners', 'Greenhill', 'Guggenheim Securities', 'Houlihan Lokey', 'Jefferies', 'William Blair', 'Lincoln International', 'Harris Williams', 'Piper Sandler', 'Raymond James', 'Stifel', 'Baird', 'Cowen', 'Rothschild & Co', 'Ducera Partners', 'Solomon Partners', 'LionTree', 'Qatalyst Partners', 'Allen & Company', 'FT Partners', 'Cain Brothers', 'Leerink Partners', 'Cantor Fitzgerald', 'Needham & Company'], 'Investment Banking', 'elite_boutique', 1),
  ...group(['KeyBanc Capital Markets', 'Fifth Third Securities', 'Truist Securities', 'Citizens Bank', 'Regions Securities', 'Huntington Bank', 'Comerica', 'PNC', 'U.S. Bank', 'BOK Financial', 'Wedbush Securities', 'Oppenheimer', 'JMP Securities'], 'Investment Banking', 'middle_market', 2),
  ...group(['Blackstone', 'KKR', 'Apollo', 'Carlyle', 'TPG', 'Ares Management', 'Brookfield', 'Warburg Pincus', 'Silver Lake', 'General Atlantic', 'Advent International', 'Bain Capital', 'Hellman & Friedman', 'Vista Equity Partners', 'Thoma Bravo', 'Clayton Dubilier & Rice', 'EQT', 'CVC Capital Partners', 'Permira', 'Partners Group', 'Leonard Green & Partners', 'Francisco Partners', 'Insight Partners', 'TA Associates', 'Stone Point Capital', 'Clearlake Capital', 'Roark Capital', 'New Mountain Capital', 'Welsh Carson', 'K1 Investment Management', 'H.I.G. Capital', 'GTCR', 'Summit Partners', 'Audax Group', 'Charlesbank Capital Partners', 'Littlejohn & Co.', 'American Securities', 'TowerBrook Capital Partners', 'Court Square Capital', 'L Catterton', 'Searchlight Capital Partners'], 'Private Equity', 'private_equity', 2),
  ...group(['Sequoia Capital', 'Andreessen Horowitz', 'Accel', 'Benchmark', 'Greylock', 'Kleiner Perkins', 'Lightspeed Venture Partners', 'Bessemer Venture Partners', 'General Catalyst', 'Founders Fund', 'Coatue', 'Thrive Capital', 'Tiger Global', 'NEA', 'IVP', 'Menlo Ventures', 'Battery Ventures', 'Khosla Ventures', 'Union Square Ventures', 'First Round Capital', 'Spark Capital', 'Sapphire Ventures', 'Greycroft', 'Redpoint Ventures'], 'Venture Capital', 'venture_capital', 3),
  ...group(['BlackRock', 'Vanguard', 'Fidelity', 'State Street', 'PIMCO', 'Wellington Management', 'T. Rowe Price', 'Capital Group', 'Invesco', 'Franklin Templeton', 'AllianceBernstein', 'Nuveen', 'Northern Trust', 'BNY Mellon', 'Janus Henderson'], 'Asset Management', 'asset_manager', 2),
  ...group(['Bridgewater Associates', 'Citadel', 'Citadel Securities', 'Point72', 'Millennium Management', 'Two Sigma', 'DE Shaw', 'Jane Street', 'Susquehanna International Group', 'Hudson River Trading', 'Optiver', 'IMC Trading', 'DRW', 'Akuna Capital', 'Jump Trading', 'Tower Research Capital'], 'Markets / Sales & Trading', 'hedge_fund_trading', 1),
  ...group(['McKinsey & Company', 'Bain & Company', 'Boston Consulting Group', 'Deloitte', 'PwC', 'EY', 'KPMG', 'Accenture', 'Oliver Wyman', 'Strategy&', 'LEK Consulting', 'Roland Berger', 'Simon-Kucher', 'AlixPartners', 'Alvarez & Marsal', 'FTI Consulting', 'Kearney', 'Booz Allen Hamilton', 'Capgemini', 'IBM Consulting', 'Slalom', 'ZS Associates', 'Guidehouse', 'West Monroe', 'RSM', 'Grant Thornton', 'BDO', 'Protiviti', 'Huron Consulting Group', 'Ankura', 'Berkeley Research Group', 'Charles River Associates', 'Cornerstone Research', 'Analysis Group', 'NERA Economic Consulting', 'Bates White', 'Compass Lexecon'], 'Management Consulting', 'consulting', 1),
  ...group(['Google', 'Microsoft', 'Apple', 'Amazon', 'Meta', 'Netflix', 'Nvidia', 'Salesforce', 'Adobe', 'Oracle', 'IBM', 'Intel', 'AMD', 'Qualcomm', 'Cisco', 'Dell', 'HP', 'ServiceNow', 'Workday', 'Atlassian', 'Snowflake', 'Databricks', 'Palantir', 'Stripe', 'Block', 'PayPal', 'Shopify', 'Uber', 'Lyft', 'Airbnb', 'DoorDash', 'Instacart', 'Coinbase', 'Robinhood', 'Reddit', 'Pinterest', 'Snap', 'Spotify', 'TikTok', 'ByteDance', 'Discord', 'Roblox', 'Epic Games', 'Electronic Arts', 'Unity', 'OpenAI', 'Anthropic', 'Scale AI', 'Anduril', 'Ramp', 'Brex', 'Plaid', 'Figma', 'Canva', 'Dropbox', 'Box', 'Okta', 'Datadog', 'Cloudflare', 'MongoDB', 'Elastic', 'GitHub', 'GitLab', 'Twilio', 'HubSpot', 'Toast', 'Samsara', 'Verkada', 'Rippling', 'Airtable', 'Asana', 'Notion'], 'Technology', 'technology', 1),
  ...group(['Capital One', 'American Express', 'Discover', 'Mastercard', 'Visa', 'Fiserv', 'FIS', 'Global Payments', 'Adyen', 'Affirm', 'SoFi', 'Chime', 'Bloomberg', 'S&P Global', "Moody's", 'Fitch Ratings', 'Morningstar', 'FactSet', 'MSCI', 'Nasdaq', 'NYSE', 'CME Group', 'Cboe', 'ICE', 'MarketAxess'], 'FinTech', 'fintech_data', 2),
  ...group(['Procter & Gamble', 'Unilever', 'Johnson & Johnson', 'PepsiCo', 'Coca-Cola', 'Nike', 'Lululemon', 'Walmart', 'Target', 'Costco', 'Home Depot', "Lowe's", 'General Electric', 'Honeywell', '3M', 'Caterpillar', 'Deere', 'Boeing', 'Lockheed Martin', 'Northrop Grumman', 'RTX', 'General Motors', 'Ford', 'Tesla', 'Rivian', 'Lucid', 'Delta Air Lines', 'United Airlines', 'American Airlines', 'Marriott', 'Hilton', 'Disney', 'Comcast', 'Warner Bros. Discovery', 'Paramount', 'Sony', 'General Mills', 'Cargill', 'Ecolab', 'Medtronic', 'UnitedHealth Group', 'Optum', 'CVS Health', 'Elevance Health', 'Cigna', 'Humana', 'Pfizer', 'Merck', 'Eli Lilly', 'AbbVie', 'Amgen', 'Gilead', 'Moderna'], 'Corporate Strategy', 'corporate', 3),
];

// Manual early-career page URLs for firms unlikely to be on API job boards (verified in Plan 2).
export const MANUAL_EARLY_CAREER_URLS: Record<string, string> = {
  'Goldman Sachs': 'https://www.goldmansachs.com/careers/students',
  'JPMorgan Chase': 'https://careers.jpmorgan.com/us/en/students',
  'Morgan Stanley': 'https://www.morganstanley.com/careers/students-graduates',
  'Bank of America': 'https://campus.bankofamerica.com',
  'Citi': 'https://jobs.citi.com/students-and-graduates',
  'Wells Fargo': 'https://www.wellsfargojobs.com/en/early-careers/',
  'Barclays': 'https://search.jobs.barclays/early-careers',
  'UBS': 'https://www.ubs.com/global/en/careers/graduates.html',
  'Evercore': 'https://www.evercore.com/join-our-team/campus-recruiting/',
  'Lazard': 'https://www.lazard.com/careers/students-graduates/',
  'Centerview Partners': 'https://www.centerviewpartners.com/careers',
  'PJT Partners': 'https://www.pjtpartners.com/careers/campus-opportunities',
  'Moelis & Company': 'https://www.moelis.com/careers/students/',
  'Jefferies': 'https://www.jefferies.com/careers/early-careers/',
  'Houlihan Lokey': 'https://hl.com/careers/campus-recruiting/',
  'McKinsey & Company': 'https://www.mckinsey.com/careers/students',
  'Bain & Company': 'https://www.bain.com/careers/roles/students-grads/',
  'Boston Consulting Group': 'https://careers.bcg.com/students',
  'Deloitte': 'https://www2.deloitte.com/us/en/pages/careers/articles/join-deloitte-students.html',
  'PwC': 'https://www.pwc.com/us/en/careers/university-relations.html',
  'EY': 'https://www.ey.com/en_us/careers/students',
  'KPMG': 'https://kpmg.com/us/en/careers-and-culture/university-careers.html',
  'BlackRock': 'https://careers.blackrock.com/early-careers/',
  'Blackstone': 'https://www.blackstone.com/careers/students/',
  'Citadel': 'https://www.citadel.com/careers/students/',
  'Point72': 'https://careers.point72.com/students',
  'Jane Street': 'https://www.janestreet.com/join-jane-street/internships/',
  'DE Shaw': 'https://www.deshaw.com/careers/internships',
  'Two Sigma': 'https://careers.twosigma.com/careers/SearchJobs/internship',
  'Bridgewater Associates': 'https://www.bridgewater.com/working-at-bridgewater/campus',
  'Capital One': 'https://campus.capitalone.com',
  'American Express': 'https://www.americanexpress.com/en-us/careers/students/',
};
```

(If any URL 404s during Plan 2 verification, the source gets `status: error` and a review task — that is the designed behavior, not a seed bug.)

- [ ] **Step 2: Write failing tests**

```ts
// lib/rmhladder/seed/companies.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeCompanyName } from '../normalize';
import { MANUAL_EARLY_CAREER_URLS, SEED_COMPANIES } from './companies';

describe('SEED_COMPANIES', () => {
  it('has 300+ firms across all firm types', () => {
    expect(SEED_COMPANIES.length).toBeGreaterThanOrEqual(300);
    const types = new Set(SEED_COMPANIES.map((c) => c.firmType));
    for (const t of ['bulge_bracket', 'elite_boutique', 'middle_market', 'private_equity', 'venture_capital', 'asset_manager', 'hedge_fund_trading', 'consulting', 'technology', 'fintech_data', 'corporate']) {
      expect(types).toContain(t);
    }
  });
  it('normalized names are unique (no dedupe collisions in seed)', () => {
    const normalized = SEED_COMPANIES.map((c) => normalizeCompanyName(c.name));
    const dupes = normalized.filter((n, i) => normalized.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });
  it('every manual URL belongs to a seeded company', () => {
    const names = new Set(SEED_COMPANIES.map((c) => c.name));
    for (const key of Object.keys(MANUAL_EARLY_CAREER_URLS)) expect(names).toContain(key);
  });
  it('all URLs are https', () => {
    for (const url of Object.values(MANUAL_EARLY_CAREER_URLS)) expect(url).toMatch(/^https:\/\//);
  });
});
```

- [ ] **Step 3: Run tests — fix data until green**

Run: `pnpm exec vitest run lib/rmhladder/seed/companies.test.ts`
Expected: PASS on first run. If a normalized-name collision surfaces (two groups both containing a firm), fix the data — remove the duplicate from the lower-priority group — never loosen the test. Also add non-empty normalized names to the uniqueness test if not already covered by Task 3's guard.

- [ ] **Step 4: Write the seed script**

```ts
// scripts/seed-ladder.ts
import { PrismaClient } from '@prisma/client';
import { normalizeCompanyName } from '../lib/rmhladder/normalize';
import { DEFAULT_RELEVANCE_RULES } from '../lib/rmhladder/scoring';
import { MANUAL_EARLY_CAREER_URLS, SEED_COMPANIES } from '../lib/rmhladder/seed/companies';

const prisma = new PrismaClient();
const API_PLATFORMS = ['greenhouse', 'lever', 'ashby', 'smartrecruiters'] as const;

async function main() {
  let companies = 0;
  for (const c of SEED_COMPANIES) {
    const normalizedName = normalizeCompanyName(c.name);
    const company = await prisma.ladderCompany.upsert({
      where: { normalizedName },
      update: { industry: c.industry, firmType: c.firmType, priorityLevel: c.priorityLevel },
      create: {
        name: c.name, normalizedName, industry: c.industry,
        firmType: c.firmType, priorityLevel: c.priorityLevel,
        usEarlyCareerUrl: MANUAL_EARLY_CAREER_URLS[c.name],
      },
    });
    companies++;
    for (const platform of API_PLATFORMS) {
      await prisma.ladderSource.upsert({
        where: { companyId_platform_slug: { companyId: company.id, platform, slug: normalizedName.replace(/ /g, '') } },
        update: {},
        create: { companyId: company.id, platform, slug: normalizedName.replace(/ /g, ''), status: 'unconfigured' },
      });
    }
    const manualUrl = MANUAL_EARLY_CAREER_URLS[c.name];
    if (manualUrl) {
      const existing = await prisma.ladderSource.findFirst({ where: { companyId: company.id, platform: 'manual' } });
      if (!existing) {
        await prisma.ladderSource.create({
          data: { companyId: company.id, platform: 'manual', url: manualUrl, status: 'active' },
        });
      }
    }
  }
  for (const rule of DEFAULT_RELEVANCE_RULES) {
    await prisma.ladderRelevanceRule.upsert({ where: { key: rule.key }, update: {}, create: rule });
  }
  const sources = await prisma.ladderSource.count();
  console.log(`Seeded ${companies} companies, ${sources} sources, ${DEFAULT_RELEVANCE_RULES.length} relevance rules.`);
}

main().finally(() => prisma.$disconnect());
```

Add to `package.json` scripts: `"ladder:seed": "pnpm exec tsx scripts/seed-ladder.ts"`.

- [ ] **Step 5: Run the seed against the dev DB**

Run: `pnpm ladder:seed`
Expected: `Seeded ~370 companies, ~1500 sources, 11 relevance rules.` (counts vary with dedupe fixes; companies ≥ 300, sources ≈ companies × 4 + manual count). Re-run once more to confirm idempotency (same counts, no unique-constraint errors).

- [ ] **Step 6: Commit**

```bash
git add lib/rmhladder/seed/ scripts/seed-ladder.ts package.json
git commit -m "feat(rmhladder): full company seed data + idempotent seed script"
```

---

### Task 9: Full-suite check + plan wrap-up

**Files:** none new.

- [ ] **Step 1: Run everything**

Run: `pnpm exec vitest run lib/rmhladder && pnpm exec prisma validate && pnpm lint 2>&1 | tail -5`
Expected: all rmhladder tests PASS; schema valid; no new lint errors in `lib/rmhladder/**` or `scripts/seed-ladder.ts` (pre-existing lint noise elsewhere in the repo is out of scope).

- [ ] **Step 2: Commit any lint fixes**

```bash
git add -A lib/rmhladder scripts/seed-ladder.ts
git commit -m "chore(rmhladder): lint fixes for foundation" # only if fixes were needed
```

---

## Roadmap (subsequent plans, written after this one lands)

- **Plan 2 — Adapters:** Greenhouse/Lever/Ashby/SmartRecruiters API clients + fixture tests, slug prober (activates the `unconfigured` sources seeded here), manual-source + generic verifier (fetch + node-html-parser, Playwright fallback, robots.txt honor), producing `VerificationEvidence` consumed by `computeVerification`.
- **Plan 3 — Pipeline + worker:** `server/ladder-worker/` with node-cron (`LADDER_CRON_SCHEDULE`, default `0 */4 * * *`), run orchestration writing `LadderScrapeRun`/`LadderSourceError`, dedupe merge via `dedupeHash`, recheck + 3-strike expiry, review-task creation.
- **Plan 4 — Dashboard:** 8 routes under `app/routes/rmhladder/` per spec §Dashboard.
- **Plan 5 — Alerts + CSV + README:** dispatch through `passesAlertGate`, Resend email, Discord DM, digests, deadline reminders, CSV import/export, README.
