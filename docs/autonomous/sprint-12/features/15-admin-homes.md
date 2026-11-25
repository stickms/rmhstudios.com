# 15 — The home listing feeds, for admins

Surface: `/admin/homes` (new): every scrape source with its state and last error, the recent scrape runs, and audited
actions — pause or resume a source, add an RSS feed, run a scrape now. Wave 3. Namespace `admin-homes`. Site tier
(Steel).

## User story

As an admin, I want to see whether the feeds that fill RMHHomes with outside listings are working, pause one that
started returning junk, add a new city's feed, and run a scrape after fixing one, so that members browsing homes see
real, current listings and I do not have to read container logs to know why a city went empty.

## Requirements elicitation

- **What exists (verified):**
  - Sources: `HomeSource` (`prisma/schema/hearth.prisma`: `key` unique, `provider` `CRAIGSLIST | RSS`, `label`,
    `region`/`category` for Craigslist, `url` for RSS, `listingType`, default location, `status`
    `ACTIVE | DISABLED | ERROR | BLOCKED`, `lastRunAt`, `lastSuccessAt`, `lastError VarChar(500)`). Runs:
    `HomeScrapeRun` (`trigger` `CRON | MANUAL`, counts of discovered, created, updated, expired and errors,
    `stats Json`).
  - The scraper (`lib/homes/scrape/run.ts` `runHomesScrape`, `process-source.ts` which sets `BLOCKED`, `ERROR` and back
    to `ACTIVE`, adapters `adapters/craigslist.ts` and `adapters/rss.ts`, `seed.ts` `seedHomeSources`) runs in the
    `homes-worker` container (`server/homes-worker/index.ts`), consuming the pg-boss queue `homes.scrape` through
    `startScheduledConsumer` (`lib/jobs/scheduled-consumer.server.ts`, whose handler receives the job's `data`). Every
    run is passed `{ trigger: 'CRON' }`: **`MANUAL` exists in the enum and nothing ever writes it.**
  - There is no admin page for sources or runs: the only way to see a failing feed is the worker's console, and the only
    way to change a source is SQL. The admin jobs console (`/admin/jobs`, `lib/admin/jobs.server.ts`) can retry a failed
    job but not queue a fresh scrape with a trigger; `getBoss()` (`lib/jobs/boss.server.ts`) gives the web tier a
    send-only pg-boss.
  - Admin conventions: `auth: 'admin'`, `recordAdminActionIn(tx, …)` (`lib/admin-audit.server.ts`), a hub card in
    `app/routes/_site/admin/index.tsx`, rows on rules (D10 default).
- **Decisions:**
  - **Sources table:** label, provider, status (with `lastError` as text, truncated), last run and last success in the
    admin's locale, the number of active external listings from the source. Sorted: `ERROR` and `BLOCKED` first.
  - **Pause / resume:** `ACTIVE`, `ERROR` or `BLOCKED` to `DISABLED`, and `DISABLED` back to `ACTIVE` (clearing
    `lastError`), each a compare-and-set on the status the admin saw, audited (`homes.source.pause`,
    `homes.source.resume`). Pausing does not remove listings; the scraper's own expiry still applies to them.
    **A pause must survive a run in flight:** `processSource` (`lib/homes/scrape/process-source.ts`) writes
    `status: 'ACTIVE'` (and `ERROR`, `BLOCKED`) with an unconditional `update({ where: { id } })` at the end of each
    source, so a source paused while a scrape is fetching it would be set back to `ACTIVE`. Those status writes become
    `updateMany({ where: { id, status: { not: 'DISABLED' } } })` (the counters and `lastRunAt` may still be written),
    and `runHomesScrape`'s source list (`status in ACTIVE, ERROR`) is unchanged.
  - **Add an RSS feed:** label, URL, listing type, default city, state and coordinates (through the existing geocode
    endpoint). The URL must be `https:` and pass `lib/ssrf-guard.server` the way the adapters' fetches do; the key is
    `rss:<host><path>` and must be new. Craigslist sources are added by `seed.ts` only (their region list is code).
  - **Run now:** queues one `homes.scrape` job with `{ trigger: 'MANUAL', by: <admin id> }` through `getBoss()`; the
    queue's `exclusive` policy already keeps one scrape queued or active, so a second press while one is waiting says
    "A scrape is already queued". The worker passes the trigger to `runHomesScrape`. Audited (`homes.scrape.run`).
  - **Recent runs:** the last 20 `HomeScrapeRun` rows: trigger, start, duration, counts.

## Functional requirements

1. FR-1 `server/homes-worker/index.ts`: `tick(data)` (the consumer already passes the job's `data`, `{}` for a cron
   fire) reads `data.trigger` (`'MANUAL'` or default `'CRON'`; anything else is `'CRON'`) and passes it on;
   `process-source.ts`'s status writes never overwrite `DISABLED` (above).
2. FR-2 `lib/admin/homes.ts` (pure: row shapes, the key builder, status transitions), `homes-schema.ts`,
   `homes.contract.ts`, `homes.server.ts` (`listSources`, `listRuns`, `setSourceStatus`, `addRssSource`, `queueScrape`).
3. FR-3 Registered endpoints in `lib/admin/api/`: `admin.homes.server.ts` (GET sources and runs, POST add RSS),
   `admin.homes.sources.$id.status.server.ts` (POST pause or resume), `admin.homes.scrape.server.ts` (POST run now), all
   `auth: 'admin'`, writes `rateLimit: 'write'`.
4. FR-4 UI: `components/admin/HomesAdmin.tsx` on `app/routes/_site/admin/homes.tsx`; the hub card under the Wave 0
   anchor; the add form in a dialog (`components/ui/dialog`), confirmation for pause through `useConfirm`.
5. FR-5 Refusals: `HOME_SOURCE_URL_UNSAFE` ("Use a public https address for the feed"), `HOME_SOURCE_EXISTS` ("That
   feed is already a source"), `HOME_SCRAPE_QUEUED` ("A scrape is already queued"), and `CONFLICT` for a stale status.

## Non-functional requirements

- **Security:** the feed URL passes the SSRF guard before it is stored, and again when the adapter fetches it (as
  today).
- **Integrity:** status changes are compare-and-set; every action is in the audit log with the admin.
- **Accessibility:** tables with headers; the status is a word, not a colour.

## Data model and API

No schema change. `GET /api/admin/homes` → `{ sources: AdminHomeSource[], runs: AdminHomeRun[] }`.

## Testing requirements

- Main suite `lib/admin/__tests__/admin-homes.test.ts`: non-admins refused; the status CAS (a stale status is a
  conflict); an `http:` or private-address URL refused; a duplicate key refused; run now queues once and refuses while
  one is queued (a fake boss); each action audited.
- Main suite `server/homes-worker/__tests__/trigger.test.ts` (or the nearest existing homes-worker test file): the job's
  `trigger` reaches `runHomesScrape`, defaulting to `CRON`.
- Gates: route table, sitemap coverage, design consistency, Steel flat, `server-bundle-copies` (the worker bundle).

## Acceptance criteria

- [ ] A source in `ERROR` shows first with its error; pausing it stops it being fetched on the next run, and a pause
      made while a scrape is running is still in force when that scrape ends.
- [ ] An admin adds a city's RSS feed and runs a scrape; the run appears with trigger "Manual" and the feed's listings
      arrive.
- [ ] A feed URL on a private address is refused.

## Out of scope

Editing Craigslist regions, moderating individual external listings (reports on community listings are 16's), the
ladder worker's sources.
