# 08 — Track a job you found elsewhere in RMHLadder

Surface: `/rmhladder/pipeline` ("Add a job you found elsewhere"), the job's own detail (yours only), the pipeline and
offers views, the data export. Wave 1. Namespace `ladder-own-jobs`. Site tier (Steel).

## User story

As a student using RMHLadder to run my job search, I want to add a job I found on another site or heard about from a
friend — title, company, link, location, deadline, pay — and track it in the same pipeline as the jobs RMHLadder found,
so that my whole search is in one place and my insights count every application.

## Requirements elicitation

- **What exists (verified):**
  - Every application points at a scraped job: `LadderApplication.jobId` is required and references `LadderJob`
    (`prisma/schema/rmhladder.prisma`, `@@unique([userId, jobId])`); `LadderJob.companyId` is required and references
    `LadderCompany` (`normalizedName @unique`). Applications are written only by `updateApplication` and its sibling in
    `lib/rmhladder/server/actions.ts`; the CSV import (`lib/rmhladder/api/rmhladder.import.server.ts`) requires a
    `jobId` column. **A member cannot track a job RMHLadder did not scrape.**
  - `LadderJob` is the shared catalogue, read by the job search and detail (`lib/rmhladder/server/queries.ts`
    `listJobs`, `getJobDetail`, `getOverview`), matching (`lib/rmhladder/matching/score.ts`), the AI enrichment and
    profiles (`lib/rmhladder/ai/enrich-jobs.server.ts`, `job-profile.server.ts`), alerts
    (`lib/rmhladder/alerts/dispatch.server.ts`), the pipeline jobs (`lib/rmhladder/pipeline/run.ts`,
    `process-source.ts`, `expire-stale.ts`, `recheck.ts`), the resume service (`lib/rmhladder/resume/service.server.ts`),
    the worker (`server/ladder-worker/index.ts`), the insights (`lib/rmhladder/insights.server.ts`), the calendar and
    export downloads (`rmhladder.calendar.server.ts`, `rmhladder.export.server.ts`) and the events route
    (`app/routes/api/rmhladder/events.ts`). **Found in validation, also catalogue readers:** the sitemap
    (`lib/sitemap.server.ts` `ladderJobWhere()`, which emits `/rmhladder/jobs/<id>` for every active job), the job's
    Open Graph card (`lib/og/api/og.job.$jobId.server.ts`, unauthenticated, through `getJobDetail`), and the shared
    `LadderCompany` readers: `listCompanies` and the company read in `lib/rmhladder/server/queries.ts` (the companies
    watchlist page `app/routes/_site/rmhladder/companies.tsx`), the settings page's company list
    (`app/routes/_site/rmhladder/settings.tsx`, `ladderCompany.findMany({ where: { enabled: true } })`), and the
    interview reports (`lib/rmhladder/community.server.ts` `createInterviewReport`, `listInterviewReports`, keyed by
    `companyId`). `scripts/ladder-status.ts` (an operator CLI) counts jobs and companies.
  - Writes that take a `jobId` from the client accept any id today: `updateApplication` and the job actions (save,
    hide) in `lib/rmhladder/server/actions.ts` and the CSV import; once own jobs exist, each must refuse another
    member's own job as not found.
  - `LadderPlatform` already has `manual` (used for curated career pages, `lib/rmhladder/adapters/`).
- **Decisions:**
  - **Model:** a member's own job is a `LadderJob` row with a new nullable `ownerId` (null for the catalogue), and its
    company a `LadderCompany` row with a new nullable `ownerId`; an own company's `normalizedName` is
    `own:<userId>:<normalized name>` so it can never collide with or be found as a catalogue company. A typed company
    name that matches a catalogue company's normalized name links to the catalogue company instead (read-only). The
    job's `sourcePlatform` is `manual`, `sourceUrl` and `originalPostingUrl` are the link the member gave (validated as
    `https?://`, never fetched: no SSRF surface), `status` is `active`, `dedupeHash` is `own:<id>`.
  - **Fields:** title (required, 160), company (required, 120), link, location, remote status, employment type,
    deadline, pay range and period, notes go on the application as today. Edit and delete are the owner's only;
    deleting an own job deletes its application, events and offer (they cascade from the job) after a confirmation that
    says so.
  - **Cap:** 300 own jobs per member (`LADDER_OWN_JOB_LIMIT`, `max`), checked under `lockKey(tx, 'ladder-own-job:<id>')`.
  - **Readers:** every catalogue reader excludes own rows through one fragment per model, `catalogJobWhere`
    (`{ ownerId: null }`) and `catalogCompanyWhere` (`{ ownerId: null }`), held by a read-path registry
    `CATALOG_JOB_READ_PATHS` (`lib/rmhladder/own-jobs.ts`, new) and a source-scan test that fails any file under
    `lib/`, `app/`, `server/`, `features/` or `scripts/` that reads `ladderJob` or `ladderCompany` and is in neither
    `CATALOG_JOB_READ_PATHS` nor `OWNER_JOB_READ_PATHS` (the member's own readers: pipeline, offers, insights, calendar,
    export, which include their own rows and no one else's, through `ownerOrCatalogJobWhere(userId)` =
    `{ OR: [{ ownerId: null }, { ownerId: userId }] }`). There is no raw SQL over `ladder_job` today, so there is no SQL
    twin; a future one joins the registry. The scraper, matching, alerts, AI enrichment, expiry and recheck (which
    fetches posting URLs) never see an own job; the sitemap and the OG card never emit one (the card answers 404 for an
    own job whoever asks, since it is unauthenticated); an own company is in no company list, watchlist or interview
    report (`createInterviewReport` refuses an own company as "Company not found.").
  - **Writes:** one guard, `assertJobUsable(userId, jobId)` (a catalogue job, or an own job of this member; otherwise
    the caller's existing not-found), called by `updateApplication`, the job actions and the CSV import, so no member
    can attach an application, a save or a hide to another member's own job.
  - **Erasure:** own jobs and own companies are erased with the account (registry `erase`, scoped to `ownerId`); the
    applications already go (`LadderApplication` is `erase`).
  - **Export:** the member's own jobs (their fields), as `ladderOwnJobs` under the sprint 13 anchor.

## Functional requirements

1. FR-1 Migrations: `20261220010100_s13_ladder_own_jobs` (`ALTER TABLE "ladder_job" ADD COLUMN "ownerId" TEXT`,
   the same on `"ladder_company"`, both with a foreign key to `"user"` `ON DELETE CASCADE`), then
   `20261220010101_s13_ladder_own_jobs_index` (`CREATE INDEX CONCURRENTLY "ladder_job_ownerId_idx" ON "ladder_job"
   ("ownerId")`, alone) and `20261220010102_s13_ladder_own_jobs_index_ensure_valid`.
2. FR-2 `lib/rmhladder/own-jobs.ts` (pure: zod schema, normalisation, `catalogJobWhere`, `CATALOG_JOB_READ_PATHS`) and
   `own-jobs.server.ts` (create, update, delete, list mine, `exportLadderOwnJobs`, `ladderOwnJobErasureOps`).
3. FR-3 Endpoints (registered modules, contract `lib/rmhladder/own-jobs.contract.ts`): `POST /api/rmhladder/own-jobs`,
   `PATCH|DELETE /api/rmhladder/own-jobs/$id` (`rateLimit: 'write'`).
4. FR-4 Every catalogue reader listed above applies `catalogJobWhere` / `catalogCompanyWhere` (including
   `lib/sitemap.server.ts`, `og.job.$jobId.server.ts`, `companies.tsx` through `queries.ts`, `settings.tsx`'s company
   list, `community.server.ts` and `scripts/ladder-status.ts`); `getJobDetail` returns an own job only to its owner
   (a viewer of `null` never gets one); `assertJobUsable` guards every write that takes a `jobId`.
5. FR-5 UI: `components/rmhladder/OwnJobDialog.tsx` (new, lazy-loaded so zod stays off the route) from
   `app/routes/_site/rmhladder/pipeline.tsx`; an own job carries a "Yours" meta label in `PipelineLadder.tsx` and
   `JobDetail.tsx`; edit and delete from the job's menu (`useConfirm`).
6. FR-6 Registry entries `LadderJob` and `LadderCompany` (`erase`, scope "rows the member owns"), the operation under
   `// s13-08 ladder-own-jobs` in `anonymizeAccount`, back-relations under the Wave 0 anchor in `auth.prisma`.

## Non-functional requirements

- **Privacy:** an own job is in no search, match, alert, insight of another member, export of another member, sitemap
  or developer API response other than its owner's (10 reads it for the owner only).
- **Safety:** links are stored and rendered as plain links with `rel="noopener noreferrer"`; never fetched.
- **Design (Steel):** the dialog is an overlay; the "Yours" label is `t-meta` text, not a badge box.

## Data model and API

`LadderJob.ownerId String?`, `LadderCompany.ownerId String?` (relations to `User`, `@@index([ownerId])` on
`LadderJob`). `POST /api/rmhladder/own-jobs` → `{ job: OwnJobView, applicationId }`.

## Testing requirements

- Main suite `lib/rmhladder/__tests__/own-jobs.test.ts`: create, edit, delete as owner only; the cap under the lock; a
  catalogue company name links to the catalogue row; a bad link is refused.
- Main suite `lib/rmhladder/__tests__/catalog-job-reads.test.ts`: the source scan — every file that reads
  `ladderJob` or `ladderCompany` is in exactly one of `CATALOG_JOB_READ_PATHS` and `OWNER_JOB_READ_PATHS`; each
  catalogue file uses `catalogJobWhere` / `catalogCompanyWhere`, each owner file `ownerOrCatalogJobWhere`; plus
  behaviour tests that another member's own job is absent from `listJobs`, the sitemap's job rows, the OG card (404),
  `listCompanies`, the settings company list and matching, and that `updateApplication`, a job action and the import
  refuse another member's own job id.
- Main suite `lib/account/__tests__/ladder-own-jobs-erasure.test.ts`; the export test (key `ladderOwnJobs`).
- `components/rmhladder/__tests__/own-job-dialog.test.tsx` (`renderToStaticMarkup`): fields named, the cap message.
- Gates: migration safety (the `CONCURRENTLY` index alone, `_ensure_valid`), erasure coverage, field names, zod off hot
  routes, user-text direction.

## Acceptance criteria

- [ ] A member adds "Data intern at a startup" with a link and sees it in the pipeline as "Yours".
- [ ] Moving it to "Interviewing" records an event and counts in their insights.
- [ ] Another member's job search, alerts and matches never show it, and neither does the sitemap, the job's link
      preview or any company list.
- [ ] Deleting it removes its application after a confirmation.

## Out of scope

Importing own jobs from CSV, sharing an own job, fetching the link's page, adding own jobs to the shared catalogue.
