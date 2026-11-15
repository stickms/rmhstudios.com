import {
  describe,
  expect,
  it,
} from 'vitest';
import { midiToFreq } from '../pitch/notes';
import { STANDARD_TUNING } from '../theory/fretboard';
import {
  FRAME_MS,
  HOLD_MS,
  IN_TUNE_CENTS,
  IN_TUNE_EXIT_CENTS,
  IN_TUNE_HOLD_MS,
  LOCK_FRAMES,
  MIN_CLARITY,
  MIN_RMS,
  adviceOf,
  createTunerMachine,
  tunerInitial,
  tunerStep,
  tunerTargets,
  type TunerFrame,
  type TunerPreset,
  type TunerState,
} from './machine';

const voiced =
  (
    freq: number,
    time: number,
    extra: Partial<TunerFrame> = {},
  ): TunerFrame => ({
    time,
    freq,
    clarity: 0.97,
    rms: 0.1,
    ...extra,
  });
const quiet =
  (
    time: number,
  ): TunerFrame => ({
    time,
    freq: null,
    clarity: 0,
    rms: 0.001,
  });

/** Feed `count` frames of `freqAt(i, time)` every FRAME_MS from `start`; returns every state seen. */
function feed(
  state: TunerState,
  count: number,
  freqAt: (
    i: number,
    time: number,
  ) =>
    | number
    | null,
  start = 0,
): {
  state: TunerState;
  seen: TunerState[];
  end: number;
} {
  const seen: TunerState[] =
    [];
  let s =
    state;
  let time =
    start;
  for (
    let i = 0;
    i <
    count;
    i++
  ) {
    time =
      start +
      i *
        FRAME_MS;
    const f =
      freqAt(
        i,
        time,
      );
    s =
      tunerStep(
        s,
        {
          type: 'frame',
          frame:
            f ===
            null
              ? quiet(
                  time,
                )
              : voiced(
                  f,
                  time,
                ),
        },
      );
    seen.push(
      s,
    );
  }
  return {
    state:
      s,
    seen,
    end:
      time +
      FRAME_MS,
  };
}

const centsUp =
  (
    midi: number,
    cents: number,
  ) =>
    midiToFreq(
      midi +
        cents /
          100,
    );

describe('tuner machine', () => {
  it('starts silent and stays silent on silence and on frames under the floors', () => {
    let s =
      tunerInitial(
        'chromatic',
      );
    expect(
      s.kind,
    ).toBe(
      'silent',
    );
    s =
      tunerStep(
        s,
        {
          type: 'frame',
          frame:
            quiet(
              0,
            ),
        },
      );
    s =
      tunerStep(
        s,
        {
          type: 'frame',
          frame:
            voiced(
              440,
              25,
              {
                clarity:
                  MIN_CLARITY -
                  0.05,
              },
            ),
        },
      );
    s =
      tunerStep(
        s,
        {
          type: 'frame',
          frame:
            voiced(
              440,
              50,
              {
                rms:
                  MIN_RMS /
                  2,
              },
            ),
        },
      );
    s =
      tunerStep(
        s,
        {
          type: 'frame',
          frame:
            voiced(
              Number.NaN,
              75,
            ),
        },
      );
    expect(
      s.kind,
    ).toBe(
      'silent',
    );
  });

  it('listens first, then locks A4 on a steady 440 Hz within a cent', () => {
    let s =
      tunerInitial(
        'chromatic',
      );
    s =
      tunerStep(
        s,
        {
          type: 'frame',
          frame:
            voiced(
              440,
              0,
            ),
        },
      );
    expect(
      s.kind,
    ).toBe(
      'listening',
    );
    const run =
      feed(
        s,
        LOCK_FRAMES,
        () =>
          440,
        FRAME_MS,
      );
    expect(
      run
        .state
        .kind,
    ).toBe(
      'locked',
    );
    if (
      run
        .state
        .kind !==
      'locked'
    )
      throw new Error(
        'not locked',
      );
    expect(
      run
        .state
        .target,
    ).toBe(
      69,
    );
    expect(
      Math.abs(
        run
          .state
          .cents,
      ),
    ).toBeLessThan(
      1,
    );
  });

  it('says in tune only after the hold time inside ±5 cents', () => {
    const run =
      feed(
        tunerInitial(
          'chromatic',
        ),
        40,
        () =>
          centsUp(
            69,
            3,
          ),
      );
    const locked =
      run.seen.filter(
        (
          x,
        ) =>
          x.kind ===
          'locked',
      );
    const firstLocked =
      locked[0];
    if (
      !firstLocked ||
      firstLocked.kind !==
        'locked'
    )
      throw new Error(
        'never locked',
      );
    expect(
      firstLocked.inTune,
    ).toBe(
      false,
    );
    expect(
      adviceOf(
        firstLocked,
      ),
    ).toBe(
      'hold',
    );
    const firstInTune =
      run.seen.findIndex(
        (
          x,
        ) =>
          x.kind ===
            'locked' &&
          x.inTune,
      );
    expect(
      firstInTune,
    ).toBeGreaterThan(
      0,
    );
    const lockedAt =
      run.seen.indexOf(
        firstLocked,
      );
    expect(
      (firstInTune -
        lockedAt) *
        FRAME_MS,
    ).toBeGreaterThanOrEqual(
      IN_TUNE_HOLD_MS,
    );
    expect(
      adviceOf(
        run.state,
      ),
    ).toBe(
      'in-tune',
    );
  });

  it('stays in tune within the exit band and leaves it past the exit band', () => {
    let run =
      feed(
        tunerInitial(
          'chromatic',
        ),
        40,
        () =>
          440,
      );
    expect(
      adviceOf(
        run.state,
      ),
    ).toBe(
      'in-tune',
    );
    const between =
      (IN_TUNE_CENTS +
        IN_TUNE_EXIT_CENTS) /
      2;
    run =
      feed(
        run.state,
        20,
        () =>
          centsUp(
            69,
            between,
          ),
        run.end,
      );
    expect(
      adviceOf(
        run.state,
      ),
    ).toBe(
      'in-tune',
    );
    run =
      feed(
        run.state,
        20,
        () =>
          centsUp(
            69,
            IN_TUNE_EXIT_CENTS +
              6,
          ),
        run.end,
      );
    expect(
      adviceOf(
        run.state,
      ),
    ).toBe(
      'down',
    );
  });

  it('tells "tune up" for 435 Hz (A4, about 20 cents flat) and "tune down" when sharp', () => {
    const flat =
      feed(
        tunerInitial(
          'chromatic',
        ),
        20,
        () =>
          435,
      );
    if (
      flat
        .state
        .kind !==
      'locked'
    )
      throw new Error(
        'not locked',
      );
    expect(
      flat
        .state
        .target,
    ).toBe(
      69,
    );
    expect(
      flat
        .state
        .cents,
    ).toBeCloseTo(
      -19.8,
      0,
    );
    expect(
      adviceOf(
        flat.state,
      ),
    ).toBe(
      'up',
    );
    const sharp =
      feed(
        tunerInitial(
          'chromatic',
        ),
        20,
        () =>
          446,
      );
    expect(
      adviceOf(
        sharp.state,
      ),
    ).toBe(
      'down',
    );
  });

  it('ignores a lone octave slip (median of recent frames)', () => {
    const run =
      feed(
        tunerInitial(
          'chromatic',
        ),
        30,
        (
          i,
        ) =>
          i ===
          15
            ? 880
            : 440,
      );
    for (const st of run.seen.slice(
      LOCK_FRAMES +
        1,
    )) {
      expect(
        st.kind,
      ).toBe(
        'locked',
      );
      if (
        st.kind ===
        'locked'
      )
        expect(
          st.target,
        ).toBe(
          69,
        );
    }
  });

  it('does not flicker between neighbours near a boundary (hysteresis)', () => {
    // A4 + 45 / 55 cents, alternating: a plain nearest-note reading would flip A4 / A#4.
    const run =
      feed(
        tunerInitial(
          'chromatic',
        ),
        60,
        (
          i,
        ) =>
          centsUp(
            69,
            i %
              2
              ? 55
              : 45,
          ),
      );
    const targets =
      new Set(
        run.seen
          .filter(
            (
              x,
            ) =>
              x.kind ===
              'locked',
          )
          .map(
            (
              x,
            ) =>
              x.kind ===
              'locked'
                ? x.target
                : 0,
          ),
      );
    expect(
      targets.size,
    ).toBe(
      1,
    );
  });

  it('holds the note on a tone with slight vibrato and calls it in tune', () => {
    // ±10 cents at 5 Hz around 440.
    const run =
      feed(
        tunerInitial(
          'chromatic',
        ),
        120,
        (
          _i,
          t,
        ) =>
          centsUp(
            69,
            10 *
              Math.sin(
                (2 *
                  Math.PI *
                  5 *
                  t) /
                  1000,
              ),
          ),
      );
    const locked =
      run.seen.filter(
        (
          x,
        ) =>
          x.kind ===
          'locked',
      );
    expect(
      locked.length,
    ).toBeGreaterThan(
      100,
    );
    expect(
      new Set(
        locked.map(
          (
            x,
          ) =>
            x.kind ===
            'locked'
              ? x.target
              : 0,
        ),
      ),
    ).toEqual(
      new Set(
        [
          69,
        ],
      ),
    );
    expect(
      adviceOf(
        run.state,
      ),
    ).toBe(
      'in-tune',
    );
  });

  it('moves to a new note that is played and held', () => {
    let run =
      feed(
        tunerInitial(
          'chromatic',
        ),
        20,
        () =>
          440,
      );
    run =
      feed(
        run.state,
        20,
        () =>
          midiToFreq(
            71,
          ),
        run.end,
      );
    if (
      run
        .state
        .kind !==
      'locked'
    )
      throw new Error(
        'not locked',
      );
    expect(
      run
        .state
        .target,
    ).toBe(
      71,
    );
    // The new note starts out of the "in tune" hold: it has to be earned again.
    const moved =
      run.seen.find(
        (
          x,
        ) =>
          x.kind ===
            'locked' &&
          x.target ===
            71,
      );
    expect(
      moved?.kind ===
        'locked' &&
        moved.inTune,
    ).toBe(
      false,
    );
  });

  it('holds the reading through a short gap and goes silent after HOLD_MS', () => {
    let run =
      feed(
        tunerInitial(
          'chromatic',
        ),
        20,
        () =>
          440,
      );
    const gapFrames =
      Math.floor(
        HOLD_MS /
          FRAME_MS,
      ) -
      2;
    run =
      feed(
        run.state,
        gapFrames,
        () =>
          null,
        run.end,
      );
    expect(
      run
        .state
        .kind,
    ).toBe(
      'locked',
    );
    run =
      feed(
        run.state,
        4,
        () =>
          null,
        run.end,
      );
    expect(
      run
        .state
        .kind,
    ).toBe(
      'silent',
    );
  });

  it('guitar preset: targets are the six strings of standard tuning', () => {
    expect(
      tunerTargets(
        'guitar',
      ),
    ).toEqual(
      STANDARD_TUNING,
    );
    expect(
      tunerTargets(
        'chromatic',
      ),
    ).toBeNull();
  });

  it('guitar preset: tune up against A2 for a flat A string, in tune on the string', () => {
    const flat =
      feed(
        tunerInitial(
          'guitar',
        ),
        20,
        () =>
          centsUp(
            45,
            -20,
          ),
      );
    if (
      flat
        .state
        .kind !==
      'locked'
    )
      throw new Error(
        'not locked',
      );
    expect(
      flat
        .state
        .target,
    ).toBe(
      45,
    );
    expect(
      adviceOf(
        flat.state,
      ),
    ).toBe(
      'up',
    );
    // A string tuned a semitone low (G#2) is still the A string, far flat.
    const low =
      feed(
        tunerInitial(
          'guitar',
        ),
        20,
        () =>
          midiToFreq(
            44,
          ),
      );
    if (
      low
        .state
        .kind !==
      'locked'
    )
      throw new Error(
        'not locked',
      );
    expect(
      low
        .state
        .target,
    ).toBe(
      45,
    );
    expect(
      low
        .state
        .cents,
    ).toBeCloseTo(
      -100,
      0,
    );
    expect(
      adviceOf(
        low.state,
      ),
    ).toBe(
      'up',
    );
    const exact =
      feed(
        tunerInitial(
          'guitar',
        ),
        40,
        () =>
          midiToFreq(
            STANDARD_TUNING[5] ??
              64,
          ),
      );
    expect(
      adviceOf(
        exact.state,
      ),
    ).toBe(
      'in-tune',
    );
  });

  it('guitar preset: 435 Hz is nearest the high E string, so it says tune down', () => {
    const run =
      feed(
        tunerInitial(
          'guitar',
        ),
        20,
        () =>
          435,
      );
    if (
      run
        .state
        .kind !==
      'locked'
    )
      throw new Error(
        'not locked',
      );
    expect(
      run
        .state
        .target,
    ).toBe(
      64,
    );
    expect(
      adviceOf(
        run.state,
      ),
    ).toBe(
      'down',
    );
  });

  it('a preset change starts listening afresh with the new targets; reset goes silent', () => {
    const run =
      feed(
        tunerInitial(
          'chromatic',
        ),
        20,
        () =>
          440,
      );
    const p: TunerPreset =
      'guitar';
    const s =
      tunerStep(
        run.state,
        {
          type: 'preset',
          preset:
            p,
        },
      );
    expect(
      s,
    ).toEqual(
      tunerInitial(
        'guitar',
      ),
    );
    expect(
      tunerStep(
        run.state,
        {
          type: 'reset',
        },
      ),
    ).toEqual(
      tunerInitial(
        'chromatic',
      ),
    );
  });

  it('is a { initial, step } machine with no effects', () => {
    const m =
      createTunerMachine(
        'chromatic',
      );
    expect(
      m.initial,
    ).toEqual(
      tunerInitial(
        'chromatic',
      ),
    );
    expect(
      m.step(
        m.initial,
        {
          type: 'frame',
          frame:
            voiced(
              440,
              0,
            ),
        },
      )
        .effects,
    ).toEqual(
      [],
    );
  });

  it('returns the same state object when nothing changes (no re-render on silence)', () => {
    const s =
      tunerInitial(
        'chromatic',
      );
    expect(
      tunerStep(
        s,
        {
          type: 'frame',
          frame:
            quiet(
              0,
            ),
        },
      ),
    ).toBe(
      s,
    );
  });
});
