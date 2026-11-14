import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  once,
  registerAll,
  type Registration,
} from '../jobs/registry';

const logger =
  () => ({
    info: vi.fn(),
    error:
      vi.fn(),
  });

describe('registerAll', () => {
  it('registers in order and logs jobs.started for each', async () => {
    const order: string[] =
      [];
    const log =
      logger();
    const entries: Registration<string>[] =
      [
        'a',
        'b',
        'c',
      ].map(
        (
          queue,
        ) => ({
          queue,
          register:
            async (
              boss,
            ) =>
              void order.push(
                `${queue}:${boss}`,
              ),
        }),
      );
    const result =
      await registerAll(
        'boss',
        entries,
        log,
      );
    expect(
      order,
    ).toEqual(
      [
        'a:boss',
        'b:boss',
        'c:boss',
      ],
    );
    expect(
      result,
    ).toEqual(
      {
        started:
          [
            'a',
            'b',
            'c',
          ],
        failed:
          [],
      },
    );
    expect(
      log.info.mock.calls.map(
        ([
          f,
        ]) =>
          f,
      ),
    ).toEqual(
      [
        {
          event:
            'jobs.started',
          queue:
            'a',
        },
        {
          event:
            'jobs.started',
          queue:
            'b',
        },
        {
          event:
            'jobs.started',
          queue:
            'c',
        },
      ],
    );
    expect(
      log.error,
    ).not.toHaveBeenCalled();
  });

  it('one failing registration does not stop the others', async () => {
    const ran: string[] =
      [];
    const log =
      logger();
    const entries: Registration<null>[] =
      [
        {
          queue:
            'ok.before',
          register:
            async () =>
              void ran.push(
                'before',
              ),
        },
        {
          queue:
            'broken',
          register:
            async () => {
              throw new Error(
                'queue create failed',
              );
            },
        },
        {
          // a synchronous throw must be isolated too
          queue:
            'broken.sync',
          register:
            (() => {
              throw new Error(
                'sync boom',
              );
            }) as unknown as () => Promise<void>,
        },
        {
          queue:
            'ok.after',
          register:
            async () =>
              void ran.push(
                'after',
              ),
        },
      ];
    const result =
      await registerAll(
        null,
        entries,
        log,
      );
    expect(
      ran,
    ).toEqual(
      [
        'before',
        'after',
      ],
    );
    expect(
      result.started,
    ).toEqual(
      [
        'ok.before',
        'ok.after',
      ],
    );
    expect(
      result.failed,
    ).toEqual(
      [
        'broken',
        'broken.sync',
      ],
    );
    expect(
      log.error,
    ).toHaveBeenCalledWith(
      {
        event:
          'jobs.register_failed',
        queue:
          'broken',
        err: 'queue create failed',
      },
    );
    expect(
      log.error,
    ).toHaveBeenCalledWith(
      {
        event:
          'jobs.register_failed',
        queue:
          'broken.sync',
        err: 'sync boom',
      },
    );
    expect(
      log.info,
    ).toHaveBeenCalledTimes(
      2,
    );
  });

  it('stops registering once told to (a shutdown signal mid-boot)', async () => {
    const log =
      logger();
    let stop = false;
    const entries: Registration<null>[] =
      [
        {
          queue:
            'first',
          register:
            async () => {
              stop = true;
            },
        },
        {
          queue:
            'second',
          register:
            vi.fn(
              async () =>
                undefined,
            ),
        },
      ];
    const result =
      await registerAll(
        null,
        entries,
        log,
        () =>
          stop,
      );
    expect(
      result.started,
    ).toEqual(
      [
        'first',
      ],
    );
    expect(
      entries[1]
        .register,
    ).not.toHaveBeenCalled();
  });
});

describe('once', () => {
  it('runs the loader once for concurrent and later callers', async () => {
    const load =
      vi.fn(
        async () => ({
          handler: 1,
        }),
      );
    const get =
      once(
        load,
      );
    const [
      a,
      b,
    ] =
      await Promise.all(
        [
          get(),
          get(),
        ],
      );
    const c =
      await get();
    expect(
      load,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      a,
    ).toBe(
      b,
    );
    expect(
      c,
    ).toBe(
      a,
    );
  });

  it('does not cache a failed load: the next call retries', async () => {
    const load =
      vi
        .fn<
          () => Promise<string>
        >()
        .mockRejectedValueOnce(
          new Error(
            'MODULE_NOT_FOUND',
          ),
        )
        .mockResolvedValue(
          'loaded',
        );
    const get =
      once(
        load,
      );
    await expect(
      get(),
    ).rejects.toThrow(
      'MODULE_NOT_FOUND',
    );
    await expect(
      get(),
    ).resolves.toBe(
      'loaded',
    );
    expect(
      load,
    ).toHaveBeenCalledTimes(
      2,
    );
  });
});
