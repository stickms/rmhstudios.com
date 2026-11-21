/**
 * Server side of the background jobs console (`/admin/jobs`). Reads pg-boss through its API where it
 * has one (queues, schedules, one job by id, retry, cancel) and through its own tables where it does
 * not: `findJobs` cannot filter by state, so the per-state lists, the newest failure per queue and
 * the delete guard are `$queryRaw` against `pgboss.job`, whose columns are pg-boss's snake_case ones
 * (`created_on`, `started_on`, `completed_on`, `retry_count`, `retry_limit`, `output`, `state`, `name`,
 * `id`). They are not Prisma models. The schema name is the boss configuration, never input.
 *
 * Job data can hold member ids and e-mail subjects: it goes to admins only, is redacted and capped,
 * and nothing here logs it.
 */
import { Prisma } from '@prisma/client';
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import {
  getBoss,
  PGBOSS_SCHEMA,
} from '@/lib/jobs/boss.server';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import {
  JOBS_PAGE_SIZE,
  errorFirstLine,
  sortQueues,
  toJsonField,
  type JobAction,
  type JobDetail,
  type JobListState,
  type JobRow,
  type JobSchedule,
  type QueueSummary,
} from '@/lib/admin/jobs';

/** The queue (pg-boss) is not reachable: no database URL, or it failed to start. */
export class JobsUnavailableError extends Error {
  constructor() {
    super(
      'The job queue is unavailable.',
    );
    this.name =
      'JobsUnavailableError';
  }
}

if (
  !/^[a-z_][a-z0-9_]*$/i.test(
    PGBOSS_SCHEMA,
  )
)
  throw new Error(
    'PGBOSS_SCHEMA is not a plain identifier',
  );
/** `pgboss.job` as raw SQL; built from the configured schema, which is checked above. */
const JOB_TABLE =
  Prisma.raw(
    `"${PGBOSS_SCHEMA}"."job"`,
  );
const JOB_STATE_TYPE =
  Prisma.raw(
    `"${PGBOSS_SCHEMA}"."job_state"`,
  );

async function requireBoss(): Promise<PgBoss> {
  // The send-only instance: it never starts a worker, which is all a read and a retry need.
  const boss =
    await getBoss();
  if (
    !boss
  )
    throw new JobsUnavailableError();
  return boss;
}

/** The queue, or null when it does not exist. */
export async function findQueue(
  name: string,
): Promise<boolean> {
  const boss =
    await requireBoss();
  return (
    (await boss.getQueue(
      name,
    )) !==
    null
  );
}

const iso =
  (
    d:
      | Date
      | null
      | undefined,
  ):
    | string
    | null =>
    d
      ? d.toISOString()
      : null;

function nextRun(
  boss: PgBoss,
  s: {
    kind: string;
    cron: string;
    timezone: string;
  },
):
  | string
  | null {
  if (
    s.kind !==
    'cron'
  )
    return null;
  try {
    const [
      next,
    ] =
      boss.previewSchedule(
        s.cron,
        {
          tz: s.timezone,
          count: 1,
        },
      );
    return next
      ? next.toISOString()
      : null;
  } catch {
    return null;
  }
}

/** The newest failure time per queue, for the queues that have failures. */
export async function newestFailures(
  names: string[],
): Promise<
  Map<
    string,
    string
  >
> {
  if (
    names.length ===
    0
  )
    return new Map();
  const rows =
    await prisma.$queryRaw<
      {
        name: string;
        newest: Date | null;
      }[]
    >(Prisma.sql`
    SELECT name, max(completed_on) AS newest
    FROM ${JOB_TABLE}
    WHERE name = ANY(${names}::text[]) AND state = 'failed'::${JOB_STATE_TYPE}
    GROUP BY name`);
  const out =
    new Map<
      string,
      string
    >();
  for (const r of Array.isArray(
    rows,
  )
    ? rows
    : [])
    if (
      r.newest
    )
      out.set(
        r.name,
        new Date(
          r.newest,
        ).toISOString(),
      );
  return out;
}

export async function listQueues(): Promise<
  QueueSummary[]
> {
  const boss =
    await requireBoss();
  const [
    queues,
    schedules,
  ] =
    await Promise.all(
      [
        boss.getQueues(),
        boss.getSchedules(),
      ],
    );
  const failures =
    await newestFailures(
      queues
        .filter(
          (
            q,
          ) =>
            q.failedCount >
            0,
        )
        .map(
          (
            q,
          ) =>
            q.name,
        ),
    );
  const byQueue =
    new Map<
      string,
      JobSchedule[]
    >();
  for (const s of schedules) {
    const list =
      byQueue.get(
        s.name,
      ) ??
      [];
    list.push(
      {
        key: s.key,
        cron: s.cron,
        kind: s.kind,
        timezone:
          s.timezone,
        nextRunAt:
          nextRun(
            boss,
            s,
          ),
      },
    );
    byQueue.set(
      s.name,
      list,
    );
  }
  return sortQueues(
    queues.map(
      (
        q,
      ) => ({
        name: q.name,
        policy:
          q.policy ??
          null,
        deadLetter:
          q.deadLetter ??
          null,
        ready:
          q.readyCount,
        deferred:
          q.deferredCount,
        active:
          q.activeCount,
        failed:
          q.failedCount,
        total:
          q.totalCount,
        newestFailureAt:
          failures.get(
            q.name,
          ) ??
          null,
        schedules:
          byQueue.get(
            q.name,
          ) ??
          [],
      }),
    ),
  );
}

interface RawJobRow {
  id: string;
  created_on: Date;
  started_on: Date | null;
  completed_on: Date | null;
  retry_count: number;
  retry_limit: number;
  error:
    | string
    | null;
  cursor_key: string;
}

/**
 * One page of a queue's jobs in a state, newest first, keyset on `(created_on, id)` within the queue
 * (pg-boss partitions by queue name and indexes name and state). `after` is the cursor of the last
 * row of the previous page, with `created_on` to the microsecond, which a JS Date cannot hold.
 */
export async function listJobs(
  queue: string,
  state: JobListState,
  after:
    | string
    | undefined,
): Promise<{
  jobs: JobRow[];
  nextCursor:
    | string
    | null;
}> {
  const [
    afterKey,
    afterId,
  ] =
    after
      ? [
          after.slice(
            0,
            27,
          ),
          after.slice(
            28,
          ),
        ]
      : [
          null,
          null,
        ];
  const keyset =
    after
      ? Prisma.sql`AND (created_on, id) < (${afterKey}::timestamptz, ${afterId}::uuid)`
      : Prisma.empty;
  const rows =
    await prisma.$queryRaw<
      RawJobRow[]
    >(Prisma.sql`
    SELECT id, created_on, started_on, completed_on, retry_count, retry_limit,
      left(COALESCE(output->>'message', output #>> '{}'), 1000) AS error,
      to_char(created_on AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '_' || id::text AS cursor_key
    FROM ${JOB_TABLE}
    WHERE name = ${queue} AND state = ${state}::${JOB_STATE_TYPE}
    ${keyset}
    ORDER BY created_on DESC, id DESC
    LIMIT ${JOBS_PAGE_SIZE + 1}`);
  const all =
    Array.isArray(
      rows,
    )
      ? rows
      : [];
  const page =
    all.slice(
      0,
      JOBS_PAGE_SIZE,
    );
  return {
    jobs: page.map(
      (
        r,
      ) => ({
        id: r.id,
        createdOn:
          new Date(
            r.created_on,
          ).toISOString(),
        startedOn:
          r.started_on
            ? new Date(
                r.started_on,
              ).toISOString()
            : null,
        completedOn:
          r.completed_on
            ? new Date(
                r.completed_on,
              ).toISOString()
            : null,
        retryCount:
          r.retry_count,
        retryLimit:
          r.retry_limit,
        error:
          state ===
            'failed' ||
          state ===
            'retry'
            ? errorFirstLine(
                r.error,
              )
            : null,
      }),
    ),
    nextCursor:
      all.length >
      JOBS_PAGE_SIZE
        ? (page[
            page.length -
              1
          ]
            ?.cursor_key ??
          null)
        : null,
  };
}

export async function getJob(
  queue: string,
  id: string,
): Promise<JobDetail | null> {
  const boss =
    await requireBoss();
  const [
    job,
  ] =
    await boss.findJobs(
      queue,
      {
        id,
        limit: 1,
      },
    );
  if (
    !job
  )
    return null;
  return {
    id: job.id,
    queue,
    state:
      job.state,
    data: toJsonField(
      job.data,
    ),
    output:
      toJsonField(
        job.output,
      ),
    createdOn:
      job.createdOn.toISOString(),
    startedOn:
      iso(
        job.startedOn,
      ),
    completedOn:
      iso(
        job.completedOn,
      ),
    startAfter:
      iso(
        job.startAfter,
      ),
    retryCount:
      job.retryCount,
    retryLimit:
      job.retryLimit,
    singletonKey:
      job.singletonKey ??
      null,
    deadLetter:
      job.deadLetter ??
      null,
  };
}

/** pg-boss's `db` option over a Prisma transaction, so its statement runs on the transaction's connection. */
function txDb(tx: Prisma.TransactionClient) {
  return {
    async executeSql(text: string, values: unknown[] = []) {
      const rows = await tx.$queryRawUnsafe<unknown[]>(text, ...values);
      return { rows: Array.isArray(rows) ? rows : [] };
    },
  };
}

/**
 * Of `ids`, lock those in a state a delete may remove (failed or cancelled): never a queued or active
 * job. `FOR UPDATE` holds the rows until the transaction ends, so a job cannot change state between
 * this check and the delete.
 */
async function lockDeletableIds(
  tx: Prisma.TransactionClient,
  queue: string,
  ids: string[],
): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM ${JOB_TABLE}
    WHERE name = ${queue} AND id = ANY(${ids}::uuid[])
      AND state IN ('failed'::${JOB_STATE_TYPE}, 'cancelled'::${JOB_STATE_TYPE})
    FOR UPDATE`);
  return (Array.isArray(rows) ? rows : []).map((r) => r.id);
}

/**
 * Run one action on up to 100 jobs and audit it. pg-boss itself only retries failed jobs and only
 * cancels jobs that have not finished; delete is restricted to failed and cancelled ones by a row
 * lock. The action and its audit row share one transaction: if the audit row cannot be written the
 * action is rolled back, so no destructive action goes unrecorded. (pg-boss's queue retained_count is
 * not adjusted on a caller's connection; its next maintenance pass corrects it.)
 */
export async function runJobAction(
  adminId: string,
  queue: string,
  action: JobAction,
  ids: string[],
): Promise<{
  requested: number;
  affected: number;
}> {
  const boss = await requireBoss();
  const affected = await prisma.$transaction(async (tx) => {
    const db = txDb(tx);
    let n: number;
    if (action === 'retry') n = (await boss.retry(queue, ids, { db })).affected;
    else if (action === 'cancel') n = (await boss.cancel(queue, ids, { db })).affected;
    else {
      const allowed = await lockDeletableIds(tx, queue, ids);
      n = allowed.length > 0 ? (await boss.deleteJob(queue, allowed, { db })).affected : 0;
    }
    await recordAdminActionIn(tx, adminId, `jobs.${action}`, {
      targetType: 'pgboss_job',
      // The audit target column holds 64 characters: one id, or the first and how many more.
      targetId: ids.length === 1 ? ids[0] : `${ids[0]}+${ids.length - 1}`,
      // The queue and the full list (the column cuts it at 500 characters).
      detail: `queue=${queue} affected=${n}/${ids.length} ids=${ids.join(',')}`,
    });
    return n;
  });
  return { requested: ids.length, affected };
}
