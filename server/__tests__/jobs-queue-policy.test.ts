import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  SCHEDULE_OVERRIDES,
  cronPeriodSeconds,
  pollSecondsFor,
  withQueuePolicy,
} from '../jobs/queue-policy';

function fakeBoss() {
  return {
    schedule:
      vi.fn(
        async (
          ..._a: unknown[]
        ) =>
          undefined,
      ),
    work: vi.fn(
      async (
        ..._a: unknown[]
      ) =>
        'worker-id',
    ),
    createQueue:
      vi.fn(
        async (
          ..._a: unknown[]
        ) =>
          undefined,
      ),
  };
}

describe('cronPeriodSeconds / pollSecondsFor', () => {
  it.each(
    [
      [
        '* * * * *',
        60,
        5,
      ],
      [
        '*/2 * * * *',
        120,
        5,
      ],
      [
        '1-59/2 * * * *',
        120,
        5,
      ],
      [
        '*/5 * * * *',
        300,
        10,
      ],
      [
        '3-59/5 * * * *',
        300,
        10,
      ],
      [
        '*/10 * * * *',
        600,
        10,
      ],
      [
        '*/15 * * * *',
        900,
        10,
      ],
      [
        '17 * * * *',
        3600,
        30,
      ],
      [
        '5 0 * * *',
        86400,
        30,
      ],
      [
        '0 14 * * 1',
        86400,
        30,
      ],
    ],
  )(
    '%s -> period %i s, poll %i s',
    (
      cron,
      period,
      poll,
    ) => {
      expect(
        cronPeriodSeconds(
          cron,
        ),
      ).toBe(
        period,
      );
      expect(
        pollSecondsFor(
          period,
        ),
      ).toBe(
        poll,
      );
    },
  );
});

describe('withQueuePolicy', () => {
  it('polls a scheduled queue at an interval chosen from its cron', async () => {
    const boss =
      fakeBoss();
    const policed =
      withQueuePolicy(
        boss,
      );
    const handler =
      async () =>
        undefined;
    await policed.schedule(
      'some.hourly',
      '17 * * * *',
      {},
      {
        tz: 'UTC',
      },
    );
    await policed.work(
      'some.hourly',
      handler,
    );
    expect(
      boss.work,
    ).toHaveBeenCalledWith(
      'some.hourly',
      {
        pollingIntervalSeconds: 30,
      },
      handler,
    );
  });

  it('leaves an unscheduled (user-fed) queue on pg-boss defaults', async () => {
    const boss =
      fakeBoss();
    const policed =
      withQueuePolicy(
        boss,
      );
    const handler =
      async () =>
        undefined;
    await policed.work(
      'engagement.progression',
      handler,
    );
    expect(
      boss.work,
    ).toHaveBeenCalledWith(
      'engagement.progression',
      handler,
    );
  });

  it('keeps a caller-supplied pollingIntervalSeconds and other options', async () => {
    const boss =
      fakeBoss();
    const policed =
      withQueuePolicy(
        boss,
      );
    const handler =
      async () =>
        undefined;
    await policed.schedule(
      'q',
      '* * * * *',
    );
    await policed.work(
      'q',
      {
        pollingIntervalSeconds: 1,
        batchSize: 3,
      },
      handler,
    );
    expect(
      boss.work,
    ).toHaveBeenCalledWith(
      'q',
      {
        pollingIntervalSeconds: 1,
        batchSize: 3,
      },
      handler,
    );
    await policed.work(
      'q',
      {
        batchSize: 3,
      },
      handler,
    );
    expect(
      boss.work,
    ).toHaveBeenLastCalledWith(
      'q',
      {
        pollingIntervalSeconds: 5,
        batchSize: 3,
      },
      handler,
    );
  });

  it('passes other methods through, bound to the real instance', async () => {
    const boss =
      fakeBoss();
    const policed =
      withQueuePolicy(
        boss,
      ) as typeof boss;
    await policed.createQueue(
      'x',
    );
    expect(
      boss.createQueue,
    ).toHaveBeenCalledWith(
      'x',
    );
  });

  it('applies a schedule override only while the registered cron still matches', async () => {
    const boss =
      fakeBoss();
    const log =
      {
        warn: vi.fn(),
      };
    const policed =
      withQueuePolicy(
        boss,
        log,
      );
    await policed.schedule(
      'economy.community-goals',
      '*/5 * * * *',
      {},
      {
        tz: 'UTC',
      },
    );
    expect(
      boss.schedule,
    ).toHaveBeenLastCalledWith(
      'economy.community-goals',
      '1-59/5 * * * *',
      {},
      {
        tz: 'UTC',
      },
    );
    // the owning module changed its own schedule: do not stomp it
    await policed.schedule(
      'economy.community-goals',
      '*/3 * * * *',
      {},
      {
        tz: 'UTC',
      },
    );
    expect(
      boss.schedule,
    ).toHaveBeenLastCalledWith(
      'economy.community-goals',
      '*/3 * * * *',
      {},
      {
        tz: 'UTC',
      },
    );
    expect(
      log.warn,
    ).toHaveBeenCalledWith(
      expect.objectContaining(
        {
          event:
            'jobs.schedule_override_skipped',
          queue:
            'economy.community-goals',
        },
      ),
    );
  });
});

/** Minute-of-hour firings for the stepped crons this worker registers. */
function minutesOf(
  cron: string,
): number[] {
  const minute =
    cron.split(
      ' ',
    )[0];
  if (
    minute ===
    '*'
  )
    return [
      ...Array(
        60,
      ).keys(),
    ];
  const m =
    /^(?:(\d+)-59|\*)\/(\d+)$/.exec(
      minute,
    );
  if (
    !m
  )
    return [];
  const start =
    m[1]
      ? Number(
          m[1],
        )
      : 0;
  const out: number[] =
    [];
  for (
    let i =
      start;
    i <
    60;
    i +=
      Number(
        m[2],
      )
  )
    out.push(
      i,
    );
  return out;
}

describe('SCHEDULE_OVERRIDES', () => {
  // The minute-level crons the worker registers, by queue, as the owning modules define them.
  const REGISTERED: Record<
    string,
    string
  > =
    {
      'outbox.drain':
        '* * * * *',
      'reminders.fire':
        '* * * * *',
      'economy.scheduled-gifts':
        '* * * * *',
      'sohumtracker.voice-alert':
        '* * * * *',
      'devplatform.recipes-poll':
        '*/2 * * * *',
      'posts.publish-scheduled':
        '*/2 * * * *',
      'study-buddy.expire':
        '*/2 * * * *',
      'search.embedding-sweep':
        '*/5 * * * *',
      'economy.community-goals':
        '*/5 * * * *',
      'communities.challenge-finalize':
        '*/5 * * * *',
      'posts.expire':
        '*/5 * * * *',
      'gifting.exchange-draws':
        '*/5 * * * *',
      'pf2ecal.reminder':
        '*/10 * * * *',
      'chat.expire-messages':
        '*/10 * * * *',
      'dunesday.daily-lineup':
        '*/10 * * * *',
      'notify.quiet-hours-flush':
        '*/15 * * * *',
    };

  function peak(
    crons: Record<
      string,
      string
    >,
  ): number {
    const per =
      Array<number>(
        60,
      ).fill(
        0,
      );
    for (const cron of Object.values(
      crons,
    ))
      for (const m of minutesOf(
        cron,
      ))
        per[
          m
        ]++;
    return Math.max(
      ...per,
    );
  }

  it('every override names the cron it replaces', () => {
    for (const [
      queue,
      o,
    ] of Object.entries(
      SCHEDULE_OVERRIDES,
    )) {
      if (
        queue in
        REGISTERED
      )
        expect(
          o.was,
          queue,
        ).toBe(
          REGISTERED[
            queue
          ],
        );
    }
  });

  it('keeps the cadence of every swept queue (only the offset moves)', () => {
    for (const [
      queue,
      o,
    ] of Object.entries(
      SCHEDULE_OVERRIDES,
    )) {
      expect(
        cronPeriodSeconds(
          o.now,
        ),
        queue,
      ).toBe(
        cronPeriodSeconds(
          o.was,
        ),
      );
    }
  });

  it('never moves a user-visible schedule', () => {
    for (const q of [
      'event.reminder',
      'email.weekly-digest',
      'pf2ecal.reminder',
      'dunesday.daily-lineup',
      'gifting.birthdays',
      'economy.wishlist-alerts',
      'outbox.drain',
      'reminders.fire',
    ]) {
      expect(
        SCHEDULE_OVERRIDES[
          q
        ],
        q,
      ).toBeUndefined();
    }
  });

  it('halves the number of minute-level handlers that start in the same minute', () => {
    const staggered =
      Object.fromEntries(
        Object.entries(
          REGISTERED,
        ).map(
          ([
            q,
            cron,
          ]) => [
            q,
            SCHEDULE_OVERRIDES[
              q
            ]
              ?.now ??
              cron,
          ],
        ),
      );
    expect(
      peak(
        REGISTERED,
      ),
    ).toBe(
      16,
    );
    expect(
      peak(
        staggered,
      ),
    ).toBeLessThanOrEqual(
      8,
    );
  });
});
