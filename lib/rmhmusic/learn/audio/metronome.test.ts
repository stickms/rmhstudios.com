import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  BPM_MAX,
  BPM_MIN,
  accentOf,
  beatIndexToPosition,
  beatIntervalS,
  clampBpm,
  createMetronome,
} from './metronome';
import type { ClickContext } from './clicks';

/** A context whose clock the test moves, recording every click's start time and pitch. */
function fakeContext() {
  const starts: number[] =
    [];
  const freqs: number[] =
    [];
  const peaks: number[] =
    [];
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
    (
      record?: (
        v: number,
      ) => void,
    ) => ({
      set value(
        v: number,
      ) {
        record?.(
          v,
        );
      },
      setValueAtTime:
        vi.fn(),
      linearRampToValueAtTime:
        vi.fn(
          (
            v: number,
          ) =>
            record?.(
              v,
            ),
        ),
      exponentialRampToValueAtTime:
        vi.fn(),
    });
  const state =
    {
      currentTime: 10,
    };
  const ctx =
    {
      get currentTime() {
        return state.currentTime;
      },
      destination:
        {},
      createOscillator:
        vi.fn(
          () => {
            const osc =
              {
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
                  vi.fn(
                    (
                      t: number,
                    ) =>
                      starts.push(
                        t,
                      ),
                  ),
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
            gain: param(
              (
                v,
              ) =>
                peaks.push(
                  v,
                ),
            ),
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
    starts,
    freqs,
    peaks,
    oscillators,
  };
}

/** Let `ms` of both clocks pass in 25 ms steps, as the real timer would. */
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

describe('metronome maths', () => {
  it('clamps the tempo to 30–240 and never returns NaN', () => {
    expect(
      clampBpm(
        1000,
      ),
    ).toBe(
      BPM_MAX,
    );
    expect(
      BPM_MAX,
    ).toBe(
      240,
    );
    expect(
      clampBpm(
        1,
      ),
    ).toBe(
      BPM_MIN,
    );
    expect(
      BPM_MIN,
    ).toBe(
      30,
    );
    expect(
      clampBpm(
        90,
      ),
    ).toBe(
      90,
    );
    expect(
      clampBpm(
        Number.NaN,
      ),
    ).toBe(
      80,
    );
    expect(
      clampBpm(
        Infinity,
      ),
    ).toBe(
      BPM_MAX,
    );
  });
  it('a beat lasts 60 / bpm seconds', () => {
    expect(
      beatIntervalS(
        120,
      ),
    ).toBeCloseTo(
      0.5,
    );
    expect(
      beatIntervalS(
        60,
      ),
    ).toBe(
      1,
    );
    expect(
      beatIntervalS(
        5000,
      ),
    ).toBeCloseTo(
      0.25,
    );
  });
  it('numbers beats within bars; a bar holds at least one beat', () => {
    expect(
      beatIndexToPosition(
        0,
        4,
      ),
    ).toEqual(
      {
        beat: 0,
        bar: 0,
      },
    );
    expect(
      beatIndexToPosition(
        5,
        4,
      ),
    ).toEqual(
      {
        beat: 1,
        bar: 1,
      },
    );
    expect(
      beatIndexToPosition(
        5,
        3,
      ),
    ).toEqual(
      {
        beat: 2,
        bar: 1,
      },
    );
    expect(
      beatIndexToPosition(
        7,
        0,
      ),
    ).toEqual(
      {
        beat: 0,
        bar: 7,
      },
    );
    expect(
      beatIndexToPosition(
        7,
        Number.NaN,
      ),
    ).toEqual(
      {
        beat: 0,
        bar: 7,
      },
    );
  });
  it('the downbeat is higher and louder', () => {
    expect(
      accentOf(
        0,
      )
        .freq,
    ).toBeGreaterThan(
      accentOf(
        1,
      )
        .freq,
    );
    expect(
      accentOf(
        0,
      )
        .peak,
    ).toBeGreaterThan(
      accentOf(
        1,
      )
        .peak,
    );
    expect(
      accentOf(
        2,
      ),
    ).toEqual(
      accentOf(
        1,
      ),
    );
  });
});

describe('createMetronome', () => {
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

  it('plays nothing and runs no timer until started', () => {
    const {
      ctx,
      starts,
    } =
      fakeContext();
    const m =
      createMetronome(
        ctx,
        {
          bpm: 120,
          beatsPerBar: 4,
        },
      );
    expect(
      m.running,
    ).toBe(
      false,
    );
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
    expect(
      starts,
    ).toEqual(
      [],
    );
    expect(
      m.beatTimes(),
    ).toEqual(
      [],
    );
  });

  it('4/4 at 120 bpm clicks 0.5 s apart, the first of each bar the accent', () => {
    const {
      ctx,
      state,
      starts,
      freqs,
      peaks,
    } =
      fakeContext();
    const m =
      createMetronome(
        ctx,
        {
          bpm: 120,
          beatsPerBar: 4,
        },
      );
    m.start(
      0.1,
    );
    expect(
      m.running,
    ).toBe(
      true,
    );
    run(
      state,
      4300,
    );
    expect(
      starts.length,
    ).toBeGreaterThanOrEqual(
      8,
    );
    for (
      let i = 1;
      i <
      9;
      i++
    )
      expect(
        starts[
          i
        ] -
          starts[
            i -
              1
          ],
      ).toBeCloseTo(
        0.5,
        6,
      );
    expect(
      starts[0],
    ).toBeCloseTo(
      10.1,
      6,
    );
    // Accent on beats 0 and 4: higher pitch, louder.
    expect(
      freqs[0],
    ).toBeGreaterThan(
      freqs[1],
    );
    expect(
      freqs[4],
    ).toBe(
      freqs[0],
    );
    expect(
      freqs[5],
    ).toBe(
      freqs[1],
    );
    expect(
      peaks[0],
    ).toBeGreaterThan(
      peaks[1],
    );
    m.stop();
  });

  it('reports each beat with its place in the bar and its time on the note clock', () => {
    const {
      ctx,
      state,
    } =
      fakeContext();
    const seen: [
      number,
      number,
      number,
    ][] =
      [];
    const m =
      createMetronome(
        ctx,
        {
          bpm: 120,
          beatsPerBar: 3,
          onBeat:
            (
              beat,
              bar,
              at,
            ) =>
              seen.push(
                [
                  beat,
                  bar,
                  at,
                ],
              ),
        },
      );
    m.start(
      0.1,
    );
    run(
      state,
      2200,
    );
    expect(
      seen
        .slice(
          0,
          5,
        )
        .map(
          ([
            b,
            bar,
          ]) => [
            b,
            bar,
          ],
        ),
    ).toEqual(
      [
        [
          0,
          0,
        ],
        [
          1,
          0,
        ],
        [
          2,
          0,
        ],
        [
          0,
          1,
        ],
        [
          1,
          1,
        ],
      ],
    );
    const times =
      m.beatTimes();
    expect(
      times.length,
    ).toBeGreaterThanOrEqual(
      5,
    );
    // `at` is the same performance-clock ms that beatTimes() holds.
    expect(
      seen.map(
        ([
          ,
          ,
          at,
        ]) =>
          at,
      ),
    ).toEqual(
      times.slice(
        0,
        seen.length,
      ),
    );
    for (
      let i = 1;
      i <
      times.length;
      i++
    )
      expect(
        times[
          i
        ] -
          times[
            i -
              1
          ],
      ).toBeCloseTo(
        500,
        3,
      );
    m.stop();
  });

  it('beatTimes maps the audio clock onto performance.now() with one offset', () => {
    const {
      ctx,
      state,
    } =
      fakeContext();
    const m =
      createMetronome(
        ctx,
        {
          bpm: 60,
          beatsPerBar: 4,
        },
      );
    vi.setSystemTime(
      5000,
    );
    const offset =
      performance.now() -
      state.currentTime *
        1000;
    m.start(
      0.2,
    );
    expect(
      m.beatTimes()[0],
    ).toBeCloseTo(
      (state.currentTime +
        0.2) *
        1000 +
        offset,
      3,
    );
    m.stop();
  });

  it('stop silences the clicks still to come, clears the timer, and is idempotent', () => {
    const {
      ctx,
      state,
      starts,
      oscillators,
    } =
      fakeContext();
    const m =
      createMetronome(
        ctx,
        {
          bpm: 120,
          beatsPerBar: 4,
        },
      );
    m.start(
      0.1,
    );
    run(
      state,
      300,
    );
    const count =
      starts.length;
    m.stop();
    expect(
      m.running,
    ).toBe(
      false,
    );
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
    for (const osc of oscillators) {
      expect(
        osc.stop,
      ).toHaveBeenCalledTimes(
        2,
      );
      expect(
        osc.disconnect,
      ).toHaveBeenCalled();
    }
    m.stop();
    run(
      state,
      3000,
    );
    expect(
      starts.length,
    ).toBe(
      count,
    );
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
  });

  it('a click that already played is not stopped again', () => {
    const {
      ctx,
      state,
      oscillators,
    } =
      fakeContext();
    const m =
      createMetronome(
        ctx,
        {
          bpm: 120,
          beatsPerBar: 4,
        },
      );
    m.start(
      0.1,
    );
    run(
      state,
      600,
    );
    oscillators[0].onended?.();
    m.stop();
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

  it('start while running does nothing; start after stop begins a new run', () => {
    const {
      ctx,
      state,
      starts,
    } =
      fakeContext();
    const m =
      createMetronome(
        ctx,
        {
          bpm: 120,
          beatsPerBar: 4,
        },
      );
    m.start(
      0.1,
    );
    const n =
      starts.length;
    m.start(
      0.1,
    );
    expect(
      starts.length,
    ).toBe(
      n,
    );
    run(
      state,
      1300,
    );
    m.stop();
    const first =
      m.beatTimes()
        .length;
    expect(
      first,
    ).toBeGreaterThan(
      2,
    );
    m.start(
      0.1,
    );
    // The new run's list starts again from its first click.
    expect(
      m.beatTimes()
        .length,
    ).toBeLessThan(
      first,
    );
    m.stop();
  });

  it('clamps bpm 1000 to 240', () => {
    const {
      ctx,
      state,
      starts,
    } =
      fakeContext();
    const m =
      createMetronome(
        ctx,
        {
          bpm: 1000,
          beatsPerBar: 4,
        },
      );
    m.start(
      0.05,
    );
    run(
      state,
      1000,
    );
    expect(
      starts[1] -
        starts[0],
    ).toBeCloseTo(
      0.25,
      6,
    );
    m.stop();
  });

  it('a stall longer than a beat skips the beats it missed: the clicks after it are distinct, ordered, on the grid', () => {
    const {
      ctx,
      state,
      starts,
      freqs,
    } =
      fakeContext();
    const m =
      createMetronome(
        ctx,
        {
          bpm: 120,
          beatsPerBar: 4,
        },
      );
    m.start(
      0.1,
    );
    // The page stalls: the audio clock moves 1.8 s with no timer firing.
    state.currentTime += 1.8;
    const stalledAt =
      state.currentTime;
    const before =
      starts.length;
    vi.advanceTimersByTime(
      25,
    );
    run(
      state,
      500,
    );
    const late =
      starts.slice(
        before,
      );
    expect(
      late.length,
    ).toBeGreaterThanOrEqual(
      1,
    );
    for (const t of late)
      expect(
        t,
      ).toBeGreaterThanOrEqual(
        stalledAt -
          0.05,
      );
    // Every click is at its own instant, later than the one before, never stacked on `now`.
    for (
      let i = 1;
      i <
      starts.length;
      i++
    )
      expect(
        starts[
          i
        ],
      ).toBeGreaterThan(
        starts[
          i -
            1
        ],
      );
    // And on the original grid (10.1 + k * 0.5), so the beat after the stall is where it belongs.
    for (const t of starts)
      expect(
        (t -
          10.1) /
          0.5,
      ).toBeCloseTo(
        Math.round(
          (t -
            10.1) /
            0.5,
        ),
        6,
      );
    // The missed beats were skipped, not squeezed in.
    expect(
      m.skipped(),
    ).toBeGreaterThanOrEqual(
      2,
    );
    const times =
      m.beatTimes();
    for (
      let i = 1;
      i <
      times.length;
      i++
    )
      expect(
        times[
          i
        ],
      ).toBeGreaterThan(
        times[
          i -
            1
        ],
      );
    // Accents stay on the downbeats of the grid: every click is the accent exactly when its grid
    // index is a multiple of four.
    starts.forEach(
      (
        t,
        k,
      ) => {
        const index =
          Math.round(
            (t -
              10.1) /
              0.5,
          );
        expect(
          freqs[
            k
          ],
        ).toBe(
          index %
            4 ===
            0
            ? 1500
            : 1000,
        );
      },
    );
    m.stop();
  });

  it('reports the skipped beats’ successors by their grid position (beat and bar)', () => {
    const {
      ctx,
      state,
    } =
      fakeContext();
    const seen: [
      number,
      number,
      number,
    ][] =
      [];
    const m =
      createMetronome(
        ctx,
        {
          bpm: 120,
          beatsPerBar: 3,
          onBeat:
            (
              beat,
              bar,
              at,
            ) =>
              seen.push(
                [
                  beat,
                  bar,
                  at,
                ],
              ),
        },
      );
    m.start(
      0.1,
    );
    state.currentTime += 3.2;
    vi.advanceTimersByTime(
      25,
    );
    run(
      state,
      500,
    );
    const [
      beat,
      bar,
    ] =
      seen.at(
        -1,
      )!;
    // 3.2 s on is 6 or 7 beats past the start: beat and bar come from the same grid index.
    expect(
      bar *
        3 +
        beat,
    ).toBeGreaterThanOrEqual(
      6,
    );
    expect(
      m.skipped(),
    ).toBeGreaterThanOrEqual(
      5,
    );
    expect(
      m.beatTimes(),
    ).toHaveLength(
      seen.length,
    );
    m.stop();
  });

  it('a click only a little late is still played, at now (not skipped)', () => {
    const {
      ctx,
      state,
      starts,
    } =
      fakeContext();
    const m =
      createMetronome(
        ctx,
        {
          bpm: 120,
          beatsPerBar: 4,
        },
      );
    m.start(
      0.1,
    );
    // Beat 1 is due at 10.6; the timer is 20 ms late for it.
    state.currentTime = 10.62;
    vi.advanceTimersByTime(
      25,
    );
    expect(
      m.skipped(),
    ).toBe(
      0,
    );
    expect(
      starts[1],
    ).toBeCloseTo(
      10.62,
      6,
    );
    m.stop();
  });

  it('start resets the skipped count', () => {
    const {
      ctx,
      state,
    } =
      fakeContext();
    const m =
      createMetronome(
        ctx,
        {
          bpm: 120,
          beatsPerBar: 4,
        },
      );
    m.start(
      0.1,
    );
    state.currentTime += 2;
    vi.advanceTimersByTime(
      25,
    );
    expect(
      m.skipped(),
    ).toBeGreaterThan(
      0,
    );
    m.stop();
    m.start(
      0.1,
    );
    expect(
      m.skipped(),
    ).toBe(
      0,
    );
    m.stop();
  });

  it('stop from inside onBeat ends the run: nothing more is scheduled, the click just scheduled is silenced', () => {
    const {
      ctx,
      state,
      starts,
      oscillators,
    } =
      fakeContext();
    const m: ReturnType<
      typeof createMetronome
    > =
      createMetronome(
        ctx,
        {
          bpm: 120,
          beatsPerBar: 4,
          onBeat:
            (
              beat,
              bar,
            ) => {
              if (
                bar ===
                  0 &&
                beat ===
                  2
              )
                m.stop();
            },
        },
      );
    m.start(
      0.1,
    );
    run(
      state,
      3000,
    );
    expect(
      m.running,
    ).toBe(
      false,
    );
    expect(
      starts,
    ).toHaveLength(
      3,
    );
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
    // Each click was cut: stop() called after the one that start() armed.
    for (const osc of oscillators)
      expect(
        osc.stop,
      ).toHaveBeenCalledTimes(
        2,
      );
  });

  it('stop from inside the very first onBeat leaves no timer', () => {
    const {
      ctx,
      state,
      starts,
    } =
      fakeContext();
    const m: ReturnType<
      typeof createMetronome
    > =
      createMetronome(
        ctx,
        {
          bpm: 120,
          beatsPerBar: 4,
          onBeat:
            () =>
              m.stop(),
        },
      );
    m.start(
      0.1,
    );
    run(
      state,
      1000,
    );
    expect(
      starts,
    ).toHaveLength(
      1,
    );
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
  });

  it('count stops the clicks after that many, even when the stop comes late', () => {
    const {
      ctx,
      state,
      starts,
    } =
      fakeContext();
    const m =
      createMetronome(
        ctx,
        {
          bpm: 120,
          beatsPerBar: 4,
          count: 6,
        },
      );
    m.start(
      0.1,
    );
    run(
      state,
      8000,
    );
    expect(
      starts,
    ).toHaveLength(
      6,
    );
    expect(
      m.beatTimes(),
    ).toHaveLength(
      6,
    );
    m.stop();
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
  });

  it('count also holds across a stall that jumps past it', () => {
    const {
      ctx,
      state,
      starts,
    } =
      fakeContext();
    const m =
      createMetronome(
        ctx,
        {
          bpm: 120,
          beatsPerBar: 4,
          count: 4,
        },
      );
    m.start(
      0.1,
    );
    state.currentTime += 30;
    vi.advanceTimersByTime(
      25,
    );
    expect(
      starts,
    ).toHaveLength(
      1,
    );
    m.stop();
  });

  it('does not schedule more than the look-ahead past now', () => {
    const {
      ctx,
      state,
      starts,
    } =
      fakeContext();
    const m =
      createMetronome(
        ctx,
        {
          bpm: 240,
          beatsPerBar: 4,
        },
      );
    m.start(
      0,
    );
    run(
      state,
      2000,
    );
    for (const t of starts)
      expect(
        t,
      ).toBeLessThanOrEqual(
        state.currentTime +
          0.1 +
          1e-9,
      );
    m.stop();
  });
});
