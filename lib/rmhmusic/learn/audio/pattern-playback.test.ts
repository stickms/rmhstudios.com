import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { ClickContext } from './clicks';
import {
  PATTERN_BARS,
  createPatternPlayback,
} from './pattern-playback';

function fakeContext(
  extra: Record<
    string,
    unknown
  > = {},
) {
  const freqs: number[] =
    [];
  const state =
    {
      currentTime: 10,
    };
  const param =
    (
      rec?: (
        v: number,
      ) => void,
    ) => ({
      set value(
        v: number,
      ) {
        rec?.(
          v,
        );
      },
      setValueAtTime:
        vi.fn(),
      linearRampToValueAtTime:
        vi.fn(),
      exponentialRampToValueAtTime:
        vi.fn(),
    });
  const ctx =
    {
      ...extra,
      get currentTime() {
        return state.currentTime;
      },
      destination:
        {},
      createOscillator:
        vi.fn(
          () => ({
            frequency:
              param(
                (
                  v,
                ) =>
                  freqs.push(
                    v,
                  ),
              ),
            connect:
              vi.fn(),
            disconnect:
              vi.fn(),
            start:
              vi.fn(),
            stop: vi.fn(),
            onended:
              null,
          }),
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
    ctx: ctx as unknown as ClickContext,
    state,
    freqs,
  };
}

/** Both clocks forward by `ms`, in the timer's 25 ms steps. */
function run(
  state: {
    currentTime: number;
  },
  ms: number,
) {
  for (
    let t = 0;
    t <
    ms;
    t += 25
  ) {
    state.currentTime += 0.025;
    vi.advanceTimersByTime(
      25,
    );
  }
}

describe('createPatternPlayback', () => {
  beforeEach(
    () => {
      vi.useFakeTimers();
      vi.setSystemTime(
        0,
      );
    },
  );
  afterEach(
    () =>
      vi.useRealTimers(),
  );

  it('plays the bars and one closing downbeat, then reports it heard once', () => {
    const {
      ctx,
      state,
      freqs,
    } =
      fakeContext();
    const heard =
      vi.fn();
    const p =
      createPatternPlayback(
        {
          ctx: () =>
            ctx,
          bpm: 120,
          onHeard:
            heard,
        },
      );
    expect(
      p.start(
        3,
        3,
      ),
    ).toBe(
      true,
    );
    run(
      state,
      500,
    );
    expect(
      heard,
    ).not.toHaveBeenCalled();
    run(
      state,
      6000,
    );
    expect(
      heard,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      heard,
    ).toHaveBeenCalledWith(
      3,
    );
    // PATTERN_BARS bars of three, then the downbeat that closes the last: 7 clicks, accents at 0, 3, 6.
    expect(
      PATTERN_BARS,
    ).toBe(
      2,
    );
    expect(
      freqs,
    ).toHaveLength(
      7,
    );
    expect(
      freqs[0],
    ).toBeGreaterThan(
      freqs[1],
    );
    expect(
      freqs[3],
    ).toBe(
      freqs[0],
    );
    expect(
      freqs[6],
    ).toBe(
      freqs[0],
    );
    expect(
      freqs[4],
    ).toBe(
      freqs[1],
    );
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
  });

  it('does not start when sound is not running, and says so', () => {
    const {
      ctx,
    } =
      fakeContext();
    const p =
      createPatternPlayback(
        {
          ctx: () =>
            null,
          bpm: 120,
          onHeard:
            vi.fn(),
        },
      );
    expect(
      p.start(
        0,
        4,
      ),
    ).toBe(
      false,
    );
    const q =
      createPatternPlayback(
        {
          ctx: () =>
            ctx,
          bpm: 120,
          onHeard:
            vi.fn(),
          ready:
            () =>
              false,
        },
      );
    expect(
      q.start(
        0,
        4,
      ),
    ).toBe(
      false,
    );
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
  });

  it('cancel stops it for good: nothing is heard, no timer is left', () => {
    const {
      ctx,
      state,
    } =
      fakeContext();
    const heard =
      vi.fn();
    const p =
      createPatternPlayback(
        {
          ctx: () =>
            ctx,
          bpm: 120,
          onHeard:
            heard,
        },
      );
    p.start(
      0,
      4,
    );
    run(
      state,
      800,
    );
    p.cancel();
    p.cancel();
    run(
      state,
      10_000,
    );
    expect(
      heard,
    ).not.toHaveBeenCalled();
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
  });

  it('a new start replaces the pattern before: only the new one is heard', () => {
    const {
      ctx,
      state,
    } =
      fakeContext();
    const heard =
      vi.fn();
    const p =
      createPatternPlayback(
        {
          ctx: () =>
            ctx,
          bpm: 120,
          onHeard:
            heard,
        },
      );
    p.start(
      0,
      4,
    );
    run(
      state,
      800,
    );
    p.start(
      1,
      3,
    );
    run(
      state,
      8000,
    );
    expect(
      heard,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      heard,
    ).toHaveBeenCalledWith(
      1,
    );
  });

  it('is heard when the last click has left the speaker: the context’s output latency counts', () => {
    // The last click is at context time 13.1 s, page time 3100 ms. 300 ms of output delay and the
    // click's 50 ms put "heard" at 3450.
    const {
      ctx,
      state,
    } =
      fakeContext(
        {
          outputLatency: 0.3,
        },
      );
    const heard =
      vi.fn();
    const p =
      createPatternPlayback(
        {
          ctx: () =>
            ctx,
          bpm: 120,
          onHeard:
            heard,
        },
      );
    p.start(
      0,
      3,
    );
    run(
      state,
      3400,
    );
    expect(
      heard,
    ).not.toHaveBeenCalled();
    run(
      state,
      150,
    );
    expect(
      heard,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('a heard timer that fires very late adds no click after the pattern', () => {
    const {
      ctx,
      state,
      freqs,
    } =
      fakeContext();
    const heard =
      vi.fn();
    const p =
      createPatternPlayback(
        {
          ctx: () =>
            ctx,
          bpm: 120,
          onHeard:
            heard,
        },
      );
    p.start(
      0,
      3,
    );
    // All seven clicks are scheduled by now (the last is due at 3100 ms)…
    run(
      state,
      3000,
    );
    expect(
      freqs,
    ).toHaveLength(
      7,
    );
    // …and the page then stalls for 20 s before any timer runs.
    state.currentTime += 20;
    vi.advanceTimersByTime(
      30_000,
    );
    expect(
      freqs,
    ).toHaveLength(
      7,
    );
    expect(
      heard,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
  });

  it('cancel after the last click was scheduled, with a late timer, plays nothing more', () => {
    const {
      ctx,
      state,
      freqs,
    } =
      fakeContext();
    const heard =
      vi.fn();
    const p =
      createPatternPlayback(
        {
          ctx: () =>
            ctx,
          bpm: 120,
          onHeard:
            heard,
        },
      );
    p.start(
      0,
      3,
    );
    run(
      state,
      3000,
    );
    p.cancel();
    state.currentTime += 20;
    vi.advanceTimersByTime(
      30_000,
    );
    expect(
      freqs,
    ).toHaveLength(
      7,
    );
    expect(
      heard,
    ).not.toHaveBeenCalled();
  });
});
