/**
 * Table-driven queue registration for the `jobs` worker.
 *
 * `server/jobs/index.ts` used to be ~20 hand-copied `try { await registerX(boss);
 * log.info(...) } catch { log.error(...) }` blocks. The block is the same every
 * time and its two properties are what matter, so they live here once:
 *
 *   - one registration failing never stops the others (a queue that did not
 *     register is a feature that waits or falls back inline, never a worker that
 *     will not boot), and
 *   - the log lines are the same two events an operator greps for:
 *     `jobs.started` and `jobs.register_failed`, each carrying the `queue` label.
 *
 * Pure of Node/Prisma/pg-boss imports on purpose, so it can be unit-tested
 * without a database (server/__tests__/jobs-registry.test.ts).
 */

/** What a registration needs from the logger (the `createLogger` shape). */
export interface RegistryLogger {
  info(
    fields: Record<
      string,
      unknown
    >,
  ): void;
  error(
    fields: Record<
      string,
      unknown
    >,
  ): void;
}

export interface Registration<
  B,
> {
  /** The queue (or the group of queues) this entry stands for; the `queue` field of the log events. */
  queue: string;
  /** Create the queue(s), schedule the cron(s) and attach the worker(s). */
  register: (
    boss: B,
  ) => Promise<unknown>;
}

export interface RegistrationResult {
  started: string[];
  failed: string[];
}

/**
 * Run every registration in order, isolating failures.
 *
 * Sequential, as before: registrations share one pg-boss pool and Postgres
 * advisory locks around queue creation, and the order is part of the boot log
 * operators read.
 */
export async function registerAll<
  B,
>(
  boss: B,
  entries: ReadonlyArray<
    Registration<B>
  >,
  log: RegistryLogger,
  /** Return true to stop early (a shutdown signal arrived mid-boot). */
  shouldStop: () => boolean = () =>
    false,
): Promise<RegistrationResult> {
  const result: RegistrationResult =
    {
      started:
        [],
      failed:
        [],
    };
  for (const entry of entries) {
    if (
      shouldStop()
    )
      break;
    try {
      await entry.register(
        boss,
      );
      result.started.push(
        entry.queue,
      );
      log.info(
        {
          event:
            'jobs.started',
          queue:
            entry.queue,
        },
      );
    } catch (e) {
      result.failed.push(
        entry.queue,
      );
      log.error(
        {
          event:
            'jobs.register_failed',
          queue:
            entry.queue,
          err: (
            e as Error
          )
            ?.message,
        },
      );
    }
  }
  return result;
}

/**
 * A loader that runs once. The first caller starts the import; every concurrent
 * and later caller shares that one promise. A failed load is NOT cached, so the
 * next job retries the import instead of failing for the life of the process.
 */
export function once<
  T,
>(
  load: () => Promise<T>,
): () => Promise<T> {
  let pending: Promise<T> | null =
    null;
  return () => {
    if (
      !pending
    ) {
      pending =
        load().catch(
          (
            e,
          ) => {
            pending =
              null;
            throw e;
          },
        );
    }
    return pending;
  };
}
