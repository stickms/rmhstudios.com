/**
 * pg-boss job queue (server-only) — the durable async backbone (rewrite R2-T1).
 *
 * A Postgres-backed queue so best-effort, off-the-hot-path work (engagement
 * progression today; media transcode, retention, fan-out later) runs in the
 * background instead of blocking the request. It rides the existing Postgres —
 * no new infrastructure, and it's covered by the same backups.
 *
 * Graceful by design: when `DATABASE_URL` is unset or pg-boss fails to start,
 * `getBoss()` resolves to `null` and callers fall back to running the work
 * inline (see `enqueueProgression`), so a missing/broken queue never drops the
 * side effect — it just moves back onto the request path.
 *
 * Producers (the web tier) get a send-only instance (`supervise:false`) with a
 * tiny pool; the dedicated `jobs` worker gets the supervising instance.
 */
import { PgBoss } from 'pg-boss';

const CONN = process.env.DATABASE_URL;
const SCHEMA = process.env.PGBOSS_SCHEMA || 'pgboss';

/** Best-effort engagement progression (achievements/XP/quests/webhook). */
export const PROGRESSION_QUEUE = 'engagement.progression';
const QUEUES = [PROGRESSION_QUEUE];

let bossPromise: Promise<PgBoss | null> | null = null;

async function create(worker: boolean): Promise<PgBoss | null> {
  if (!CONN) return null;
  try {
    const boss = new PgBoss({
      connectionString: CONN,
      schema: SCHEMA,
      // Only the dedicated worker performs maintenance/scheduling; producers
      // just insert jobs, so they skip the supervisor loops and use a tiny pool.
      supervise: worker,
      schedule: worker,
      max: worker ? 8 : 2,
      application_name: worker ? 'rmh-jobs' : 'rmh-web-producer',
    });
    boss.on('error', (e: Error) => console.error('[pg-boss] error:', e?.message));
    await boss.start();
    // createQueue is idempotent — safe for both producer and worker to call.
    for (const q of QUEUES) await boss.createQueue(q);
    return boss;
  } catch (e) {
    console.error('[pg-boss] start failed; jobs will run inline:', (e as Error)?.message);
    return null;
  }
}

/**
 * The shared pg-boss instance for this process (memoised). Pass `worker=true`
 * from the `jobs` container to enable maintenance; the web tier calls it with
 * the default (send-only). Resolves to `null` when the queue is unavailable so
 * callers can fall back to inline execution.
 */
export function getBoss(worker = false): Promise<PgBoss | null> {
  if (!bossPromise) bossPromise = create(worker);
  return bossPromise;
}
