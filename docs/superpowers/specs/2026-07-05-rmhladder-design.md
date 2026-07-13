# rmhladder — US Early-Career Job Tracker (Design)

**Date:** 2026-07-05
**Status:** Approved design, pending implementation plan
**Location:** Inside rmhstudios.com (TanStack Start), following existing mini-app + worker patterns

## Goal

A verified, US-focused early-career recruiting tracker: automatically discover, verify, store, rank, and alert users about US-based internships, summer analyst/associate programs, rotational programs, LDPs, and new-grad roles across finance, consulting, and technology firms. Every job links to the original posting and is verified as real and accessible before alerting.

Priorities, in order: (1) verified existence, (2) direct original links, (3) US-based, (4) early-career relevance, (5) high-quality alerts, (6) deduplication, (7) target-firm coverage, (8) clean dashboard + application tracking.

## Decisions Made

| Decision | Choice |
|---|---|
| Location | Inside rmhstudios.com repo, app name **rmhladder**, route `/rmhladder` |
| Users | **Multi-user from day one** (better-auth `User`), shared global job data + per-user prefs/tracking |
| Alert channels (MVP) | In-app + Email (Resend) + Discord DM (existing bot) |
| Workday | **Deferred to phase 2.** Banks seeded as manual sources with preserved early-career page links |
| Seed scope | **Full ~400-firm list**, best-effort slugs via automated slug prober; unverifiable sources marked `unconfigured` |
| Pipeline runtime | **Approach A:** dedicated `ladder-worker` + node-cron (4h cadence), matching existing worker patterns. No Redis/BullMQ in MVP |
| Implementation style | Subagent-driven development |

## Architecture

```
app/routes/rmhladder/          TanStack routes (dashboard)
server/ladder-worker/          cron pipeline + alert dispatch (tsx dev / esbuild prod, added to concurrently)
lib/rmhladder/
  adapters/                    greenhouse, lever, ashby, smartrecruiters, manual, generic-verifier
  pipeline/                    discover, normalize, dedupe, verify, classify, score, persist, alert, recheck
  classifiers/                 early-career, us-location
  seed/                        ~400-company config + slug prober
prisma/schema.prisma           new Ladder* models
```

Pipeline (every 4h + dashboard "Run now"):
`sources → discover → normalize → dedupe → verify → classify (US + early-career) → score → persist → alert → recheck active jobs → log run`

- One `LadderScrapeRun` row per execution (counts: discovered/new/verified/expired/errors; trigger cron|manual).
- Per-source isolation: try/catch per source; errors → `LadderSourceError`; one failure never kills a run.
- Politeness: 1 req/sec/domain, custom User-Agent, robots.txt honored for all non-API fetches. API adapters need no scraping.
- Playwright only for JS-rendered verification where robots permits; otherwise `blocked_or_inaccessible` + review task. Never bypass CAPTCHAs, login walls, or anti-bot systems.
- Expiry: only after 3 consecutive failed rechecks OR explicit closed language.
- Web app does reads + user actions only; never scrapes.

## Database Schema (Prisma, `Ladder*` prefix)

**Global:**
- `LadderCompany` — name, normalizedName, industry, firmType, priorityLevel, careerUrl/usEarlyCareerUrl/campusUrl, notes, enabled
- `LadderSource` — companyId, platform enum (greenhouse|lever|ashby|smartrecruiters|manual|generic), slug/url, status (active|unconfigured|blocked|error|disabled), lastSuccessAt
- `LadderJob` — companyId, title, normalizedTitle, roleCategory, programType enum, industry, city, state, country, remoteStatus (onsite|hybrid|remote_us), internshipOrFullTime, postingDate, applicationDeadline, startSeason, graduationYearTarget, schoolYearTarget, sourcePlatform, sourceUrl, originalPostingUrl, canonicalApplyUrl, externalRequisitionId, descriptionSummary, fullDescription?, dedupeHash (unique), status (active|expired|unknown), discoveredAt, lastCheckedAt, lastVerifiedAt, earlyCareerScore, earlyCareerClassification (yes|probable|no|unclear), usLocationConfidence, relevanceScoreBase, matchingKeywords[], alternateUrls[]
- `LadderVerification` — jobId, status enum (verified_active|verified_probable|unverified|expired|broken_link|duplicate|non_us_role|blocked_or_inaccessible|needs_manual_review), confidence 0–100, evidence text, checkedAt. Append-only history; latest row is current.
- `LadderScrapeRun`, `LadderSourceError`, `LadderReviewTask` (reason enum: broken_link|blocked|js_required|possible_duplicate|ambiguous_early_career|ambiguous_us_location|low_confidence|aggregator_unconfirmed; resolution actions: verify|expire|duplicate|non_us|ignore|set_canonical|remap_source)
- `LadderRelevanceRule` — seeded, editable weights (see Scoring)

**Per-user (FK → better-auth User):**
- `LadderUserPrefs` — relevanceThreshold (default 60), preferredCities[], preferredProgramTypes[], digestFrequency (immediate|daily|weekly), channels {inApp, email, discord}, discordUserId
- `LadderKeyword` — keyword, weight, type (boost|block)
- `LadderWatchlistEntry` — companyId, priority
- `LadderJobAction` — jobId, action (saved|applied|ignored), timestamps
- `LadderApplication` — jobId, status (not_applied|planning|applied|networking|interviewing|final_round|rejected|offer|withdrawn), appliedDate, resumeVersion, coverLetter, referralName, contactEmail, notes, followUpDate, interviewDates[], outcome
- `LadderAlert` — jobId, channel, type (immediate|daily_digest|weekly_digest|deadline|changed|expired|review_needed), sentAt. **Unique (userId, jobId, type) = duplicate-alert guard.**

**Dedupe:** `dedupeHash = sha256(normalizedCompany + normalizedTitle + locationBucket)`; canonical-URL and requisition-ID matches also merge. Loser's URL stored in `alternateUrls`.

## Adapters

```ts
interface SourceAdapter {
  platform: Platform;
  discoverJobs(company, source): Promise<RawJob[]>;
  normalizeJob(raw): NormalizedJob;
  getCanonicalUrl(raw): string;
  verifyJob(job): Promise<VerificationResult>;
  detectExpired(job): Promise<boolean>;
}
```

MVP: **Greenhouse, Lever, Ashby, SmartRecruiters** (public JSON APIs), **manual-source adapter** (registered URL + generic verification; used for banks/consultancies), **generic careers-page verifier** (fetch + node-html-parser; Playwright fallback when JS-rendered and robots-permitted). Aggregators (LinkedIn/Indeed/etc.) are never primary sources; aggregator-derived entries stay `unverified` until the official posting is found.

**Slug prober** (seed-time + on-demand): tests each company's likely slugs against the four public APIs; hits → active source, misses → `unconfigured`.

Phase 2: Workday CXS adapter, iCIMS/Taleo/Phenom/SuccessFactors/Oracle/Eightfold/Jobvite, RSS.

## Verification

Additive confidence: API-returned job +40, title match +15, company match +10, US location confirmed +15, apply mechanism +10, req ID +5, no closed-language +5. Thresholds: ≥85 typical for API sources → `verified_active`; 60–85 → `verified_probable` or `needs_manual_review`; page fetch failures → `broken_link`; robots/CAPTCHA/login → `blocked_or_inaccessible` (no bypass, URL preserved, review task created). Every verification stores a human-readable evidence sentence shown on the job detail page.

**Alert gate (all required):** status ∈ {verified_active, verified_probable} ∧ confidence ≥ 75 ∧ US-based/Remote-US ∧ earlyCareer ∈ {yes, probable} ∧ finalRelevance ≥ user threshold ∧ no existing (user, job, immediate) alert ∧ no user block-keyword hit.

## Classifiers

- **Early-career:** weighted keyword signals (positive: intern, summer analyst, new grad, rotational, LDP, campus, entry level, class-year regex `\b202[6-9]\b`, etc.; negative: VP, director, MD, principal, senior, 5+/7+/10+ years, staff/lead, etc.) → earlyCareerScore, classification, programType, graduationYearTarget, schoolYearTarget. Pure function, unit-tested against fixture titles/descriptions.
- **US-location:** gazetteer of the 28 spec locations + all US states/abbrevs, Remote-US patterns, country fields from APIs. Non-US → `non_us_role`, excluded from MVP alerts and default views.

## Relevance Scoring

Two layers: **base** (global, stored on job; recomputed on recheck) from `LadderRelevanceRule` seeded with the spec's weights (Summer Analyst +30, IB +30, internship +25, new grad +25, corp strategy/dev +25, US +20, target-firm +20, recent ≤7d +15, Remote US +15, deadline ≤14d +10 urgency flag; negative: senior −25, manager −20, director −50, VP −60, principal −50, 5+ yrs −40; non-US/expired/unverified → disqualified). **User boost** (computed at query/alert time): keyword weights, watchlist +20, preferred city +10, block keyword → disqualify. Final = clamp(base + boost, 0, 100). Rules editable from Settings.

## Dashboard (`/rmhladder`)

8 routes with filter presets covering all spec pages:
1. **Overview** — new this week, expiring soon, review count, last run status
2. **Jobs** — main table (title, company, location, program type, start season, posted, deadline, verification badge + confidence, early-career score, relevance, platform, original link, Save/Apply/Ignore); preset chips (New verified, Finance, Consulting, Tech, Expiring soon, Remote US); full filter panel (28 locations, program types, industries); detail drawer with verification evidence + application tracker
3. **My Pipeline** — kanban over 9 application stages with per-application fields
4. **Review Queue** — one-click resolutions
5. **Companies** — 400 firms, source status, enable/disable/prioritize/add
6. **Alerts** — in-app center + history
7. **Settings** — keywords, threshold, cities, channels, digest frequency
8. **System Health** — runs, per-source errors, blocked sources

CSV export: all jobs, verified US early-career, saved, applied, expiring, review queue. CSV import: existing tracker, watchlist, keywords, blocked keywords.

## Alerts

Worker-dispatched. Types: immediate, daily digest, weekly digest, deadline reminders (14d + 3d), posting-changed and posting-expired (saved/applied jobs only), review-needed (sent to users with the existing better-auth admin role only). Channels: in-app rows, Resend email, Discord DM via existing bot client. Content: title, company, location, program type, dates, deadline, verification status + confidence, early-career classification, relevance score, matching keywords, "why this matched", original posting link, apply link if different. Never: duplicates, unverified, expired, senior, or non-US.

## Testing (vitest)

Unit tests: dedupe hashing/merging, US-location classifier, early-career classifier, relevance scoring, verification status logic, alert duplicate prevention. Adapter tests against recorded JSON fixtures — no network in tests.

## Env Vars

`RESEND_API_KEY`, existing `DISCORD_BOT_TOKEN`, `LADDER_CRON_SCHEDULE` (default `0 */4 * * *`), `LADDER_USER_AGENT`. All secrets via env.

## Compliance

Respect robots.txt, ToS, rate limits. No bypassing login walls/CAPTCHAs/anti-bot. Prefer official APIs. Blocked → `blocked_or_inaccessible` + review task + preserved URL. Always link to the official posting. Scrape no more than needed.

## MVP Build Order

1. Prisma schema + migrations
2. Seed: 400-company config + slug prober
3. Adapters (Greenhouse, Lever, Ashby, SmartRecruiters, manual, generic verifier) + classifiers + scoring (all unit-tested)
4. Pipeline + ladder-worker + scrape runs
5. Dashboard routes
6. Alerts (in-app, email, Discord) + digests
7. CSV import/export, README

Phase 2 (explicitly out of MVP): Workday adapter, other ATS platforms, SMS/Slack, international tracking.
