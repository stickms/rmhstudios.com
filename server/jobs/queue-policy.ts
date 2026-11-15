/**
 * Queue policy for the `jobs` worker: how often each queue is polled, and which
 * cron ticks are spread apart.
 *
 * Both are applied in ONE place, by wrapping the pg-boss instance that the
 * `register*` functions receive, so no feature module has to know about them:
 *
 *   1. POLLING. `boss.work()` polls its queue every 2 s by default. The worker
 *      registers ~30 cron-driven queues, so an idle process made ~15-20 fetch
 *      queries a second against Postgres, every one of them an empty result:
 *      measured at ~21 transactions/s on an otherwise idle database.
 *      A queue that only ever receives a job when its cron fires does not need a
 *      2 s reaction time; a job that waits at most one poll interval after the
 *      cron tick is as good as on time for a cadence of a minute or more. Queues
 *      that are fed by user actions (engagement progression, event reminders,
 *      Slice It charting, Altair replays, recipe events, post fan-out) have no
 *      schedule and keep pg-boss's default, so nothing a person is waiting on
 *      gets slower.
 *
 *   2. SCHEDULE OFFSETS. Every `* /N` sweep fires at minute 0 of the hour, so
 *      sixteen handlers started in the same pg-boss poll. Sweeps whose exact
 *      minute carries no meaning get a fixed offset inside their own period; the
 *      table says what each one was. Nothing user-visible moves: event
 *      reminders, the daily lineup, PF2e reminders, the weekly digest and the
 *      birthday/wishlist nudges keep their schedules.
 *
 * No Node, Prisma or pg-boss imports: unit-tested without a database.
 */

/** What the wrapper needs from a pg-boss instance. */
interface BossLike {
  schedule(
    name: string,
    cron: string,
    ...rest: unknown[]
  ): Promise<unknown>;
  work(
    name: string,
    ...args: unknown[]
  ): Promise<unknown>;
}

export interface ScheduleOverride {
  /** The cron the owning module registers. The override applies only while it still matches. */
  was: string;
  /** The cron this worker registers instead. */
  now: string;
}

/**
 * Cron staggering, by queue name. Every entry is a sweep (idempotent, bounded per
 * run), where running up to four minutes later in its period changes nothing a
 * person can see. `lib/__tests__/jobs-queue-policy` pins the coincidence this buys.
 */
export const SCHEDULE_OVERRIDES: Readonly<
  Record<
    string,
    ScheduleOverride
  >
> =
  {
    // */2 sweeps: split between even and odd minutes.
    'posts.publish-scheduled':
      {
        was: '*/2 * * * *',
        now: '1-59/2 * * * *',
      },
    'study-buddy.expire':
      {
        was: '*/2 * * * *',
        now: '1-59/2 * * * *',
      },
    // */5 sweeps: one per minute of the five.
    'economy.community-goals':
      {
        was: '*/5 * * * *',
        now: '1-59/5 * * * *',
      },
    'communities.challenge-finalize':
      {
        was: '*/5 * * * *',
        now: '2-59/5 * * * *',
      },
    'posts.expire':
      {
        was: '*/5 * * * *',
        now: '3-59/5 * * * *',
      },
    'gifting.exchange-draws':
      {
        was: '*/5 * * * *',
        now: '4-59/5 * * * *',
      },
    // Housekeeping with no deadline.
    'chat.expire-messages':
      {
        was: '*/10 * * * *',
        now: '5-59/10 * * * *',
      },
    'notify.quiet-hours-flush':
      {
        was: '*/15 * * * *',
        now: '7-59/15 * * * *',
      },
    'slice-it.regen-stale':
      {
        was: '17 * * * *',
        now: '47 * * * *',
      },
    'ops.cohort-retention':
      {
        was: '10 5 * * *',
        now: '25 5 * * *',
      },
  };

/**
 * Rough gap between two firings of a 5-field cron, in seconds. Only used to pick a
 * poll interval, so it is deliberately coarse: anything that is not a minute-level
 * step or a fixed minute is treated as hourly or slower.
 */
export function cronPeriodSeconds(
  cron: string,
): number {
  const [
    minute = '*',
    hour = '*',
  ] =
    cron
      .trim()
      .split(
        /\s+/,
      );
  if (
    minute ===
    '*'
  )
    return 60;
  const step =
    /\/(\d+)$/.exec(
      minute,
    );
  if (
    step
  )
    return Math.max(
      60,
      Number(
        step[1],
      ) *
        60,
    );
  // A fixed minute (or list): once an hour at most if the hour is a wildcard, else daily or slower.
  return hour ===
    '*'
    ? 3600
    : 86400;
}

/**
 * Poll interval (s) for a queue whose jobs arrive on a cron of this period, or
 * `undefined` for pg-boss's own default. Bounded by the cadence: the job is never
 * more than one poll late, which is ≤ ~8% of a minute-level period and nothing at
 * an hourly or daily one.
 */
export function pollSecondsFor(
  periodSeconds: number,
): number {
  if (
    periodSeconds <=
    120
  )
    return 5;
  if (
    periodSeconds <=
    900
  )
    return 10;
  return 30;
}

export interface QueuePolicyLogger {
  warn(
    fields: Record<
      string,
      unknown
    >,
  ): void;
}

/**
 * A pg-boss view whose `schedule()` applies {@link SCHEDULE_OVERRIDES} and whose
 * `work()` picks the poll interval from the queue's schedule. Everything else is
 * the real instance. A `work()` call that passes its own `pollingIntervalSeconds`
 * is left alone; so is a queue with no schedule.
 *
 * Relies on `schedule()` being called before `work()` for the same queue, which
 * every register function does; a queue registered the other way round simply
 * keeps the default poll, which is the old behaviour.
 */
export function withQueuePolicy<
  B extends
    BossLike,
>(
  boss: B,
  log?: QueuePolicyLogger,
  overrides: Readonly<
    Record<
      string,
      ScheduleOverride
    >
  > = SCHEDULE_OVERRIDES,
): B {
  const periods =
    new Map<
      string,
      number
    >();
  return new Proxy(
    boss,
    {
      get(
        target,
        prop,
      ) {
        const value =
          Reflect.get(
            target,
            prop,
            target,
          );
        if (
          prop ===
          'schedule'
        ) {
          return (
            name: string,
            cron: string,
            ...rest: unknown[]
          ) => {
            let effective =
              cron;
            const override =
              overrides[
                name
              ];
            if (
              override
            ) {
              if (
                override.was ===
                cron
              )
                effective =
                  override.now;
              else
                log?.warn(
                  {
                    event:
                      'jobs.schedule_override_skipped',
                    queue:
                      name,
                    registered:
                      cron,
                    expected:
                      override.was,
                  },
                );
            }
            periods.set(
              name,
              cronPeriodSeconds(
                effective,
              ),
            );
            return target.schedule(
              name,
              effective,
              ...rest,
            );
          };
        }
        if (
          prop ===
          'work'
        ) {
          return (
            name: string,
            ...args: unknown[]
          ) => {
            const period =
              periods.get(
                name,
              );
            if (
              period ===
              undefined
            )
              return target.work(
                name,
                ...args,
              );
            const poll =
              pollSecondsFor(
                period,
              );
            // work(name, handler) | work(name, options, handler)
            if (
              args.length ===
              1
            )
              return target.work(
                name,
                {
                  pollingIntervalSeconds:
                    poll,
                },
                args[0],
              );
            const [
              options,
              ...tail
            ] =
              args;
            const merged =
              {
                pollingIntervalSeconds:
                  poll,
                ...(options as object),
              };
            return target.work(
              name,
              merged,
              ...tail,
            );
          };
        }
        return typeof value ===
          'function'
          ? value.bind(
              target,
            )
          : value;
      },
    },
  );
}
