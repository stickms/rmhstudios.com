# 02 — Background jobs console

Surface: a new admin page `/admin/jobs`, linked from the admin hub
(`app/routes/_site/admin/index.tsx`). Wave 2. Namespace `admin-jobs`.

## User story

As a site operator, I want to see every background queue's health, read why a
job failed, and retry or cancel it from the admin panel — so that a stuck digest
or a failed webhook retry is fixed in a minute instead of with a database shell.

## Requirements elicitation

- **What exists (verified):** the `jobs` worker (`server/jobs/index.ts`)
  registers about 45 pg-boss queues and crons through `registerAll`
  (`server/jobs/registry.ts`). pg-boss 12.38 is the queue
  (`lib/jobs/boss.server.ts`, `getBoss()`). The only operator view is the
  on-call checker (`lib/oncall/checks.server.ts`), which reads
  `boss.getQueues()` for failed and ready counts to raise alarms on
  `/admin/alarms`; there is no list of queues, no way to see a failed job's
  error and no retry. pg-boss exposes `getQueues()`, `getQueue(name)`,
  `findJobs(name, { id, limit, after })`, `retry(name, ids)`,
  `cancel(name, ids)` and `deleteJob(name, ids)`
  (`node_modules/pg-boss/dist/index.d.ts`); `findJobs` cannot filter by state,
  so the failed-jobs list reads pg-boss's own table.
- **Decisions:** read-mostly. Actions are retry, cancel (a queued or retrying
  job) and delete (a failed job), each one job or up to 100 selected, each
  written to the admin audit log (`logAdminAction`,
  `lib/admin-audit.server.ts`). No editing of job data, no creating jobs, no
  cron edits (schedules are code: `registerAll` reconciles them at boot). The
  page works when the worker is down (it reads the database, not the worker).

## Functional requirements

1. FR-1 `/admin/jobs` lists every queue from `getQueues()`: name, queued (ready
   / deferred), active, failed, total, policy, and the newest failure's time.
   Sorted with failures first, then by name. A filter field narrows by name.
2. FR-2 Opening a queue shows its recent jobs in four tabs
   (`components/ui/tabs.tsx`): Failed, Retrying, Active, Queued — 50 per page,
   newest first, keyset-paginated ("Load more"). Each row: id (mono, copyable),
   created, started, finished, retry count / limit, and the first line of the
   error.
3. FR-3 Opening a job shows its data and output as formatted JSON, truncated at
   8 KB each with a "truncated" note, and its timestamps, singleton key and
   dead-letter queue.
4. FR-4 Actions: Retry (failed or cancelled jobs), Cancel (queued, retry or
   active), Delete (failed or cancelled). Each confirms through `useConfirm`
   (`components/ui/confirm-dialog.tsx`), toasts the result, and refreshes the
   list. Bulk: a checkbox per row and "Retry selected" / "Delete selected" (at
   most 100).
5. FR-5 The queue list shows the cron schedule(s) attached to a queue (from
   pg-boss's schedule table) with the next run time computed in UTC.
6. FR-6 Every action writes `logAdminAction` with action `jobs.retry` /
   `jobs.cancel` / `jobs.delete`, target type `pgboss_job`, target ids (comma
   list, truncated to 500 chars) and the queue name.

## Non-functional requirements

- **Security:** every endpoint is `auth: 'admin'`; the route sits under the
  `/admin` layout (whose `beforeLoad` is not protection for data: each endpoint
  checks on its own). Job data can contain member ids and e-mail subjects: it is
  shown to admins only, never logged, and the endpoints never echo a caught
  error. Inputs are zod-validated: queue names `^[a-z0-9._:-]{1,100}$` and
  present in `getQueues()`; job ids are UUIDs; bulk ids are one comma-separated
  parameter.
- **Raw SQL:** the failed/retrying/active/queued lists and the schedule list
  read pg-boss's own tables (`pgboss.job`, `pgboss.schedule`), which are **not**
  Prisma models and use pg-boss's own snake_case columns (`created_on`,
  `started_on`, `completed_on`, `retry_count`, `retry_limit`, `output`, `state`,
  `name`, `id`, `singleton_key`, `dead_letter`). Read the column names from
  `node_modules/pg-boss/dist/plans.js` before writing the query and assert them
  in a test. The schema name comes from the boss config
  (`lib/jobs/boss.server.ts`), never from input.
- **Performance:** lists are `LIMIT 51` keyset on `(created_on, id)` within one
  queue name (pg-boss partitions by queue and indexes `name, state`); no
  count(*) beyond what `getQueues()` returns. Page polling: none (R5) — a
  Refresh button.
- **i18n:** `admin-jobs` namespace; queue names and job ids are data, not
  translated.
- **Steel:** rows on rules; counts in `t-meta` mono; failure counts in
  `text-site-danger` only when non-zero; JSON in a `surface-field` `pre` with
  `t-meta`; one ink primary per view (none on the list; the confirm dialog's
  action on the detail).
- **Accessibility:** tabs are the shared primitive; checkboxes are labelled with
  the job id; the JSON block is a labelled region.

## Data model and API

No schema change. Contract `lib/admin/jobs.contract.ts`; modules
`lib/admin/api/admin.jobs.server.ts` (GET queues), `admin.jobs.$queue.server.ts`
(GET `?state=failed|retry|active|created&after=`),
`admin.jobs.$queue.$id.server.ts` (GET one job),
`admin.jobs.$queue.actions.server.ts` (POST
`{ action: 'retry'|'cancel'|'delete', ids: string }`). Server logic in
`lib/admin/jobs.server.ts`; pure shaping (truncation, error first line, sort
order, next-cron time via the existing cron parser if one exists —
`grep -rn "cron" lib/core lib/tools` — else omit FR-5's next time and show the
expression) in `lib/admin/jobs.ts`.

## Testing requirements

- Main suite `lib/admin/__tests__/admin-jobs.test.ts`: non-admins get 403 on
  every endpoint; an unknown queue name is 404; retry calls
  `boss.retry(name, ids)` with exactly the parsed ids and logs the audit row;
  more than 100 ids is 400; the list query uses the real pg-boss table and
  column names (string assertion on the SQL); data over 8 KB is truncated.
- Product suite `lib/admin/__tests__/admin-jobs.product.test.ts`: sort order
  (failures first), error first-line extraction, truncation.

## Acceptance criteria

- [ ] An admin sees every queue with counts, and a failed job's error and data.
- [ ] Retrying a failed job moves it back to the queue; the audit log records
      it.
- [ ] Bulk retry of 3 selected jobs works; 101 is refused.
- [ ] Non-admins get 403 from every endpoint.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Editing or creating jobs, changing schedules, the outbox (03), alarms (exist).
