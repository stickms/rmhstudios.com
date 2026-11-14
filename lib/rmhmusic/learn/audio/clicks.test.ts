import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  clockOffsetMs,
  contextLatencyMs,
  scheduleClicks,
} from './clicks';

function fakeContext() {
  const oscillators: {
    stop: ReturnType<
      typeof vi.fn
    >;
    disconnect: ReturnType<
      typeof vi.fn
    >;
    onended:
      | (() => void)
      | null;
  }[] =
    [];
  const param =
    () => ({
      value: 0,
      setValueAtTime:
        vi.fn(),
      linearRampToValueAtTime:
        vi.fn(),
      exponentialRampToValueAtTime:
        vi.fn(),
    });
  const ctx =
    {
      currentTime: 10,
      destination:
        {},
      createOscillator:
        vi.fn(
          () => {
            const osc =
              {
                frequency:
                  param(),
                connect:
                  vi.fn(),
                disconnect:
                  vi.fn(),
                start:
                  vi.fn(),
                stop: vi.fn(),
                onended:
                  null as
                    | (() => void)
                    | null,
              };
            oscillators.push(
              osc,
            );
            return osc;
          },
        ),
      createGain:
        vi.fn(
          () => ({
            gain: param(),
            connect:
              vi.fn(),
            disconnect:
              vi.fn(),
          }),
        ),
    };
  return {
    ctx: ctx as unknown as Parameters<
      typeof scheduleClicks
    >[0],
    oscillators,
  };
}

const PLAN =
  {
    count: 8,
    beatS: 0.6,
    leadS: 1,
    clickS: 0.05,
  };

describe('scheduleClicks', () => {
  beforeEach(
    () =>
      vi.useFakeTimers(),
  );
  afterEach(
    () =>
      vi.useRealTimers(),
  );

  it('fires a beat per click and then the end, and leaves no timer behind', () => {
    const {
      ctx,
    } =
      fakeContext();
    const beats: number[] =
      [];
    const end =
      vi.fn();
    const run =
      scheduleClicks(
        ctx,
        PLAN,
        {
          beat: (
            i,
          ) =>
            beats.push(
              i,
            ),
          end,
        },
      );
    expect(
      run.clicks,
    ).toHaveLength(
      8,
    );
    vi.advanceTimersByTime(
      1000 +
        8 *
          600 +
        10,
    );
    expect(
      beats,
    ).toEqual(
      [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
      ],
    );
    expect(
      end,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
  });

  it('cancel (Skip, unmount) clears every timer and silences every click still to come (finding f)', () => {
    const {
      ctx,
      oscillators,
    } =
      fakeContext();
    const on =
      {
        beat: vi.fn(),
        end: vi.fn(),
      };
    const run =
      scheduleClicks(
        ctx,
        PLAN,
        on,
      );
    vi.advanceTimersByTime(
      1500,
    );
    run.cancel();
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
    for (const osc of oscillators) {
      // Once when scheduled, once more (now) when cancelled.
      expect(
        osc.stop,
      ).toHaveBeenCalledTimes(
        2,
      );
      expect(
        osc.disconnect,
      ).toHaveBeenCalled();
    }
    vi.advanceTimersByTime(
      10_000,
    );
    expect(
      on.end,
    ).not.toHaveBeenCalled();
    run.cancel();
  });

  it('a click that already played is not stopped again', () => {
    const {
      ctx,
      oscillators,
    } =
      fakeContext();
    const run =
      scheduleClicks(
        ctx,
        PLAN,
        {
          beat: () => {},
          end: () => {},
        },
      );
    oscillators[0].onended?.();
    run.cancel();
    expect(
      oscillators[0]
        .stop,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      oscillators[1]
        .stop,
    ).toHaveBeenCalledTimes(
      2,
    );
  });
});

describe('contextLatencyMs', () => {
  it('is the output latency, else the base latency, in ms; 0 when neither is known', () => {
    expect(
      contextLatencyMs(
        {
          outputLatency: 0.04,
          baseLatency: 0.01,
        },
      ),
    ).toBeCloseTo(
      40,
      6,
    );
    expect(
      contextLatencyMs(
        {
          outputLatency: 0,
          baseLatency: 0.01,
        },
      ),
    ).toBeCloseTo(
      10,
      6,
    );
    expect(
      contextLatencyMs(
        {
          baseLatency: 0.012,
        },
      ),
    ).toBeCloseTo(
      12,
      6,
    );
    expect(
      contextLatencyMs(
        {},
      ),
    ).toBe(
      0,
    );
    expect(
      contextLatencyMs(
        {
          outputLatency:
            Number.NaN,
          baseLatency:
            -1,
        },
      ),
    ).toBe(
      0,
    );
  });
});

describe('clockOffsetMs', () => {
  beforeEach(
    () => {
      vi.useFakeTimers();
      vi.advanceTimersByTime(
        5000,
      );
    },
  );
  afterEach(
    () =>
      vi.useRealTimers(),
  );

  it('without an output timestamp it is performance.now() minus the context clock', () => {
    expect(
      clockOffsetMs(
        {
          currentTime: 2,
        },
      ),
    ).toBeCloseTo(
      performance.now() -
        2000,
      6,
    );
  });

  it('with an output timestamp and a known latency it pairs the two clocks exactly, in the scheduled-time frame', () => {
    // The device is playing context time 1.9 s at page time `now - 40`; the sound is heard 40 ms
    // after it was rendered, so a click scheduled at context time c is HEARD at that page time +
    // (c - 1.9) s, and RENDERED 40 ms before that.
    const ts =
      {
        contextTime: 1.9,
        performanceTime:
          performance.now() -
          40,
      };
    const ctx =
      {
        currentTime: 2,
        outputLatency: 0.04,
        getOutputTimestamp:
          () =>
            ts,
      };
    expect(
      clockOffsetMs(
        ctx,
      ),
    ).toBeCloseTo(
      ts.performanceTime -
        1900 -
        40,
      6,
    );
  });

  it('falls back when the timestamp is unusable (zeros, stale, from the future, throws, no latency)', () => {
    const now =
      performance.now();
    const base =
      {
        currentTime: 2,
        outputLatency: 0.04,
      };
    const fallback =
      now -
      2000;
    const zeros =
      {
        ...base,
        getOutputTimestamp:
          () => ({
            contextTime: 0,
            performanceTime: 0,
          }),
      };
    expect(
      clockOffsetMs(
        zeros,
      ),
    ).toBeCloseTo(
      fallback,
      6,
    );
    const stale =
      {
        ...base,
        getOutputTimestamp:
          () => ({
            contextTime: 1,
            performanceTime:
              now -
              5000,
          }),
      };
    expect(
      clockOffsetMs(
        stale,
      ),
    ).toBeCloseTo(
      fallback,
      6,
    );
    const future =
      {
        ...base,
        getOutputTimestamp:
          () => ({
            contextTime: 1.9,
            performanceTime:
              now +
              4000,
          }),
      };
    expect(
      clockOffsetMs(
        future,
      ),
    ).toBeCloseTo(
      fallback,
      6,
    );
    const throws =
      {
        ...base,
        getOutputTimestamp:
          () => {
            throw new Error(
              'nope',
            );
          },
      };
    expect(
      clockOffsetMs(
        throws,
      ),
    ).toBeCloseTo(
      fallback,
      6,
    );
    const noLatency =
      {
        currentTime: 2,
        getOutputTimestamp:
          () => ({
            contextTime: 1.9,
            performanceTime:
              now -
              40,
          }),
      };
    expect(
      clockOffsetMs(
        noLatency,
      ),
    ).toBeCloseTo(
      fallback,
      6,
    );
  });

  it('scheduleClicks uses the same offset', () => {
    const {
      ctx,
    } =
      fakeContext();
    const stub =
      ctx as unknown as {
        outputLatency: number;
        getOutputTimestamp: () => {
          contextTime: number;
          performanceTime: number;
        };
      };
    const ts =
      {
        contextTime: 9.9,
        performanceTime:
          performance.now() -
          10,
      };
    stub.outputLatency = 0.05;
    stub.getOutputTimestamp =
      () =>
        ts;
    const run =
      scheduleClicks(
        ctx,
        {
          count: 1,
          beatS: 1,
          leadS: 1,
          clickS: 0.05,
        },
        {
          beat: () => {},
          end: () => {},
        },
      );
    // Click at context time 11 s: page time = 11000 + (heard pair's offset) - latency.
    expect(
      run
        .clicks[0],
    ).toBeCloseTo(
      11000 +
        (ts.performanceTime -
          9900) -
        50,
      6,
    );
    run.cancel();
  });
});
