/**
 * The bot's one retry policy (port of retry_test.go): it is what stands between a 429 / a DNS blip
 * and a lost Discord post or a re-billed summary, so its bounds are worth pinning.
 */
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  cronEvery,
  getBool,
  getDuration,
  getInt,
  parseGoDuration,
} from './config';
import {
  RETRY_API,
  RETRY_DB,
  RETRY_GATEWAY,
  backoff,
  parseRetryAfter,
  permanent,
  retryAfter,
  retryableStatus,
  withRetry,
} from './retry';

const noSleep =
  vi.fn(
    async () =>
      true,
  );

describe('withRetry', () => {
  it('succeeds after transient failures', async () => {
    let calls = 0;
    const out =
      await withRetry(
        'op',
        RETRY_API,
        async () => {
          calls++;
          if (
            calls <
            3
          )
            throw new Error(
              'blip',
            );
          return 'ok';
        },
        {
          sleeper:
            noSleep,
        },
      );
    expect(
      out,
    ).toBe(
      'ok',
    );
    expect(
      calls,
    ).toBe(
      3,
    );
  });

  it('stops at once on a permanent error', async () => {
    let calls = 0;
    await expect(
      withRetry(
        'op',
        RETRY_API,
        async () => {
          calls++;
          throw permanent(
            new Error(
              'bad key',
            ),
          );
        },
        {
          sleeper:
            noSleep,
        },
      ),
    ).rejects.toThrow(
      'bad key',
    );
    expect(
      calls,
    ).toBe(
      1,
    );
  });

  it('gives up at the attempt cap (total tries, not retries)', async () => {
    let calls = 0;
    await expect(
      withRetry(
        'op',
        RETRY_DB,
        async () => {
          calls++;
          throw new Error(
            'down',
          );
        },
        {
          sleeper:
            noSleep,
        },
      ),
    ).rejects.toThrow(
      'down',
    );
    expect(
      calls,
    ).toBe(
      RETRY_DB.attempts,
    );
  });

  it('does not try again once the signal is aborted (a shutdown is not a failure)', async () => {
    const ac =
      new AbortController();
    let calls = 0;
    await expect(
      withRetry(
        'op',
        RETRY_API,
        async () => {
          calls++;
          ac.abort();
          throw new Error(
            'first',
          );
        },
        {
          signal:
            ac.signal,
          sleeper:
            async () =>
              false,
        },
      ),
    ).rejects.toThrow(
      'first',
    );
    expect(
      calls,
    ).toBe(
      1,
    );
  });

  it('honours a Retry-After longer than the schedule', async () => {
    const waits: number[] =
      [];
    let calls = 0;
    await withRetry(
      'op',
      RETRY_API,
      async () => {
        if (
          calls++ ===
          0
        )
          throw retryAfter(
            new Error(
              '429',
            ),
            30_000,
          );
        return 1;
      },
      {
        sleeper:
          async (
            ms,
          ) => (
            waits.push(
              ms,
            ),
            true
          ),
        rand: () =>
          0,
      },
    );
    expect(
      waits,
    ).toEqual(
      [
        30_000,
      ],
    );
  });
});

describe('backoff', () => {
  it('is jittered in [delay/2, 1.5·delay) and capped at max', () => {
    for (const policy of [
      RETRY_API,
      RETRY_DB,
      RETRY_GATEWAY,
    ]) {
      for (
        let n = 1;
        n <=
        policy.attempts;
        n++
      ) {
        const lo =
          backoff(
            policy,
            n,
            () =>
              0,
          );
        const hi =
          backoff(
            policy,
            n,
            () =>
              0.999999,
          );
        expect(
          lo,
        ).toBeGreaterThanOrEqual(
          0,
        );
        expect(
          hi,
        ).toBeLessThan(
          policy.maxMs *
            1.5,
        );
        expect(
          hi,
        ).toBeGreaterThanOrEqual(
          lo,
        );
      }
    }
    expect(
      backoff(
        RETRY_API,
        1,
        () =>
          0,
      ),
    ).toBe(
      250,
    );
    expect(
      backoff(
        RETRY_API,
        3,
        () =>
          0,
      ),
    ).toBe(
      1000,
    );
    expect(
      backoff(
        RETRY_API,
        99,
        () =>
          0,
      ),
    ).toBe(
      4000,
    );
  });
});

describe('HTTP classification', () => {
  it('retries 408/409/429/5xx only', () => {
    for (const c of [
      408,
      409,
      429,
      500,
      502,
      503,
    ])
      expect(
        retryableStatus(
          c,
        ),
        String(
          c,
        ),
      ).toBe(
        true,
      );
    for (const c of [
      400,
      401,
      403,
      404,
      422,
    ])
      expect(
        retryableStatus(
          c,
        ),
        String(
          c,
        ),
      ).toBe(
        false,
      );
  });

  it('reads Retry-After as seconds or an HTTP date', () => {
    const now =
      Date.parse(
        '2026-11-10T12:00:00Z',
      );
    expect(
      parseRetryAfter(
        '3',
        now,
      ),
    ).toBe(
      3000,
    );
    expect(
      parseRetryAfter(
        ' 7 ',
        now,
      ),
    ).toBe(
      7000,
    );
    expect(
      parseRetryAfter(
        '-1',
        now,
      ),
    ).toBe(
      0,
    );
    expect(
      parseRetryAfter(
        '',
        now,
      ),
    ).toBe(
      0,
    );
    expect(
      parseRetryAfter(
        'soon',
        now,
      ),
    ).toBe(
      0,
    );
    expect(
      parseRetryAfter(
        'Tue, 10 Nov 2026 12:00:05 GMT',
        now,
      ),
    ).toBe(
      5000,
    );
    expect(
      parseRetryAfter(
        'Tue, 10 Nov 2026 11:59:00 GMT',
        now,
      ),
    ).toBe(
      0,
    );
  });
});

describe('Go pkg/config semantics', () => {
  it('parses Go durations and falls back on junk', () => {
    expect(
      parseGoDuration(
        '30s',
      ),
    ).toBe(
      30_000,
    );
    expect(
      parseGoDuration(
        '1h30m',
      ),
    ).toBe(
      5_400_000,
    );
    expect(
      parseGoDuration(
        '1.5h',
      ),
    ).toBe(
      5_400_000,
    );
    expect(
      parseGoDuration(
        '250ms',
      ),
    ).toBe(
      250,
    );
    expect(
      parseGoDuration(
        '10',
      ),
    ).toBeNull();
    expect(
      getDuration(
        'X',
        5,
        {
          X: 'nope',
        },
      ),
    ).toBe(
      5,
    );
    expect(
      getDuration(
        'X',
        5,
        {
          X: '',
        },
      ),
    ).toBe(
      5,
    );
    expect(
      getInt(
        'X',
        1,
        {
          X: '12x',
        },
      ),
    ).toBe(
      1,
    );
    expect(
      getBool(
        'X',
        false,
        {
          X: 'T',
        },
      ),
    ).toBe(
      true,
    );
  });

  it('turns the Go tickers into minute crons', () => {
    expect(
      cronEvery(
        60_000,
      ),
    ).toBe(
      '* * * * *',
    );
    expect(
      cronEvery(
        10 *
          60_000,
        6,
      ),
    ).toBe(
      '6-59/10 * * * *',
    );
    expect(
      cronEvery(
        30 *
          60_000,
        11,
      ),
    ).toBe(
      '11-59/30 * * * *',
    );
    expect(
      cronEvery(
        3_600_000,
        23,
      ),
    ).toBe(
      '23 * * * *',
    );
    expect(
      cronEvery(
        7 *
          60_000,
      ),
    ).toBe(
      '*/6 * * * *',
    );
    expect(
      cronEvery(
        5_000,
      ),
    ).toBe(
      '* * * * *',
    );
  });
});
