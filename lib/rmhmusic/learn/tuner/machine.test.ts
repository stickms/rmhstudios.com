import {
  describe,
  expect,
  it,
} from 'vitest';
import { ECHO_TAIL_MS } from '../input/echo-window';
import { midiToFreq } from '../pitch/notes';
import { STANDARD_TUNING } from '../theory/fretboard';
import {
  FAR_CENTS,
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
  shownNote,
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
const lockedOf =
  (
    s: TunerState,
  ) => {
    if (
      s.kind !==
      'locked'
    )
      throw new Error(
        `not locked: ${s.kind}`,
      );
    return s;
  };

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

  it('ignores a frame with a non-finite time', () => {
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
            voiced(
              440,
              Number.NaN,
            ),
        },
      ),
    ).toBe(
      s,
    );
    const locked =
      feed(
        s,
        10,
        () =>
          440,
      ).state;
    expect(
      tunerStep(
        locked,
        {
          type: 'frame',
          frame:
            voiced(
              880,
              Number.POSITIVE_INFINITY,
            ),
        },
      ),
    ).toBe(
      locked,
    );
    expect(
      tunerStep(
        locked,
        {
          type: 'frame',
          frame:
            quiet(
              Number.NaN,
            ),
        },
      ),
    ).toBe(
      locked,
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
    const l =
      lockedOf(
        run.state,
      );
    expect(
      l.target,
    ).toBe(
      69,
    );
    expect(
      Math.abs(
        l.cents,
      ),
    ).toBeLessThan(
      1,
    );
  });

  it('uses the lower median: an even window never averages two notes into a third', () => {
    // A2 then A3: the mean of the two would be D♯3, a note nobody played.
    let s =
      tunerStep(
        tunerInitial(
          'chromatic',
        ),
        {
          type: 'frame',
          frame:
            voiced(
              midiToFreq(
                45,
              ),
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
              midiToFreq(
                57,
              ),
              FRAME_MS,
            ),
        },
      );
    expect(
      s.kind ===
        'listening' &&
        s.candidate,
    ).toBe(
      45,
    );
    // Just after locking the window holds four frames: one stray frame must not pull the reading.
    const run =
      feed(
        tunerInitial(
          'chromatic',
        ),
        LOCK_FRAMES +
          1,
        (
          i,
        ) =>
          i ===
          LOCK_FRAMES
            ? 445
            : 440,
      );
    expect(
      Math.abs(
        lockedOf(
          run.state,
        )
          .cents,
      ),
    ).toBeLessThan(
      0.5,
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
    const firstLocked =
      lockedOf(
        run.seen.find(
          (
            x,
          ) =>
            x.kind ===
            'locked',
        ) ??
          run.state,
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
    const lockedAt =
      run.seen.indexOf(
        firstLocked,
      );
    expect(
      firstInTune,
    ).toBeGreaterThan(
      lockedAt,
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

  it('"hold it there" and "tune up" do not trade places at the band edge (5 in, 8 out)', () => {
    // Coming from flat, 6 cents flat is still "tune up"; 4 flat is "hold" (not yet held long).
    let run =
      feed(
        tunerInitial(
          'chromatic',
        ),
        20,
        () =>
          centsUp(
            69,
            -20,
          ),
      );
    expect(
      adviceOf(
        run.state,
      ),
    ).toBe(
      'up',
    );
    run =
      feed(
        run.state,
        12,
        () =>
          centsUp(
            69,
            -6,
          ),
        run.end,
      );
    expect(
      adviceOf(
        run.state,
      ),
    ).toBe(
      'up',
    );
    run =
      feed(
        run.state,
        6,
        () =>
          centsUp(
            69,
            -4,
          ),
        run.end,
      );
    expect(
      adviceOf(
        run.state,
      ),
    ).toBe(
      'hold',
    );
    // Wobbling between 4 and 7 cents flat stays "hold" (it never left 8).
    run =
      feed(
        run.state,
        8,
        (
          i,
        ) =>
          centsUp(
            69,
            i %
              2
              ? -7
              : -4,
          ),
        run.end,
      );
    expect(
      new Set(
        run.seen.map(
          adviceOf,
        ),
      ),
    ).toEqual(
      new Set(
        [
          'hold',
        ],
      ),
    );
    run =
      feed(
        run.state,
        12,
        () =>
          centsUp(
            69,
            -12,
          ),
        run.end,
      );
    expect(
      adviceOf(
        run.state,
      ),
    ).toBe(
      'up',
    );
  });

  it('tells "tune up" for 435 Hz (A4, about 20 cents flat) and "tune down" when sharp', () => {
    const flat =
      lockedOf(
        feed(
          tunerInitial(
            'chromatic',
          ),
          20,
          () =>
            435,
        )
          .state,
      );
    expect(
      flat.target,
    ).toBe(
      69,
    );
    expect(
      flat.cents,
    ).toBeCloseTo(
      -19.8,
      0,
    );
    expect(
      adviceOf(
        flat,
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
    ))
      expect(
        lockedOf(
          st,
        )
          .target,
      ).toBe(
        69,
      );
  });

  it('does not flicker between neighbours near a boundary (hysteresis)', () => {
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
              lockedOf(
                x,
              )
                .target,
          ),
      );
    expect(
      targets.size,
    ).toBe(
      1,
    );
  });

  it('holds the note on a tone with slight vibrato and calls it in tune', () => {
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
            lockedOf(
              x,
            )
              .target,
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
    expect(
      lockedOf(
        run.state,
      )
        .target,
    ).toBe(
      71,
    );
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
      lockedOf(
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
        )
          .state,
      );
    expect(
      flat.target,
    ).toBe(
      45,
    );
    expect(
      adviceOf(
        flat,
      ),
    ).toBe(
      'up',
    );
    // An A string a semitone low (G♯2) is still the A string, far flat — but within reach.
    const low =
      lockedOf(
        feed(
          tunerInitial(
            'guitar',
          ),
          20,
          () =>
            midiToFreq(
              44.1,
            ),
        )
          .state,
      );
    expect(
      low.target,
    ).toBe(
      45,
    );
    expect(
      low.cents,
    ).toBeCloseTo(
      -90,
      0,
    );
    expect(
      adviceOf(
        low,
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

  it('guitar preset: an octave of a string is that string (folded cents)', () => {
    // E3 (the low E's 12th fret / an octave slip) is the low E, in tune, not "D3, tune down".
    const e3 =
      feed(
        tunerInitial(
          'guitar',
        ),
        40,
        () =>
          midiToFreq(
            52,
          ),
      );
    const l =
      lockedOf(
        e3.state,
      );
    expect(
      l.target,
    ).toBe(
      40,
    );
    expect(
      Math.abs(
        l.cents,
      ),
    ).toBeLessThan(
      1,
    );
    expect(
      adviceOf(
        l,
      ),
    ).toBe(
      'in-tune',
    );
    // A4, 20 cents flat, is the A string 20 cents flat (not "E4, tune down, +480").
    const a4 =
      lockedOf(
        feed(
          tunerInitial(
            'guitar',
          ),
          20,
          () =>
            435,
        )
          .state,
      );
    expect(
      a4.target,
    ).toBe(
      45,
    );
    expect(
      a4.cents,
    ).toBeCloseTo(
      -19.8,
      0,
    );
    expect(
      adviceOf(
        a4,
      ),
    ).toBe(
      'up',
    );
    // Tuning the low E 10 cents flat, octave-slip frames keep the low E and its cents.
    const slip =
      feed(
        tunerInitial(
          'guitar',
        ),
        40,
        (
          i,
        ) =>
          centsUp(
            i %
              3
              ? 40
              : 52,
            -10,
          ),
      );
    for (const st of slip.seen.slice(
      LOCK_FRAMES +
        1,
    )) {
      expect(
        lockedOf(
          st,
        )
          .target,
      ).toBe(
        40,
      );
      expect(
        lockedOf(
          st,
        )
          .cents,
      ).toBeCloseTo(
        -10,
        0,
      );
    }
  });

  it('guitar preset: far from every string it names the note heard and gives no direction', () => {
    // F3 + 20 cents: 1.2 semitones from any E and 1.8 from any G, in every octave.
    const far =
      lockedOf(
        feed(
          tunerInitial(
            'guitar',
          ),
          20,
          () =>
            centsUp(
              53,
              20,
            ),
        )
          .state,
      );
    expect(
      adviceOf(
        far,
      ),
    ).toBe(
      'far',
    );
    expect(
      Math.abs(
        far.cents,
      ),
    ).toBeGreaterThan(
      FAR_CENTS,
    );
    expect(
      shownNote(
        far,
      ),
    ).toBe(
      53,
    );
    expect(
      far.inTune,
    ).toBe(
      false,
    );
    // Near a string again: the string and its advice come back.
    const back =
      feed(
        far,
        20,
        () =>
          midiToFreq(
            55,
          ),
        20 *
          FRAME_MS,
      );
    expect(
      adviceOf(
        back.state,
      ),
    ).not.toBe(
      'far',
    );
    expect(
      shownNote(
        back.state,
      ),
    ).toBe(
      55,
    );
  });

  it('chromatic preset is never far', () => {
    const run =
      feed(
        tunerInitial(
          'chromatic',
        ),
        20,
        () =>
          centsUp(
            53,
            20,
          ),
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
    expect(
      tunerStep(
        run.state,
        {
          type: 'preset',
          preset:
            p,
        },
      ),
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

  it('ignores the mic while its own reference tone sounds, plus the echo tail, then starts afresh', () => {
    const run =
      feed(
        tunerInitial(
          'chromatic',
        ),
        20,
        () =>
          440,
      );
    const start =
      run.end;
    const end =
      start +
      2000;
    let s =
      tunerStep(
        run.state,
        {
          type: 'reference',
          end,
        },
      );
    expect(
      s.kind,
    ).toBe(
      'muted',
    );
    // The speaker's A4 at the mic: ignored, during the tone and the tail.
    const during =
      feed(
        s,
        Math.floor(
          (end +
            ECHO_TAIL_MS -
            start) /
            FRAME_MS,
        ),
        () =>
          440,
        start,
      );
    for (const st of during.seen)
      expect(
        st.kind,
      ).toBe(
        'muted',
      );
    // A second tone while muted extends the window.
    s =
      tunerStep(
        during.state,
        {
          type: 'reference',
          end:
            end +
            1000,
        },
      );
    expect(
      s.kind ===
        'muted' &&
        s.until,
    ).toBe(
      end +
        1000 +
        ECHO_TAIL_MS,
    );
    // A shorter one never shortens it.
    expect(
      tunerStep(
        s,
        {
          type: 'reference',
          end:
            end -
            500,
        },
      ),
    ).toBe(
      s,
    );
    // After the window the reading starts from nothing (no frame from the tone survives).
    const after =
      tunerStep(
        s,
        {
          type: 'frame',
          frame:
            voiced(
              midiToFreq(
                71,
              ),
              end +
                1000 +
                ECHO_TAIL_MS,
            ),
        },
      );
    expect(
      after.kind,
    ).toBe(
      'listening',
    );
    expect(
      after.kind ===
        'listening' &&
        after
          .recent
          .length,
    ).toBe(
      1,
    );
    // A preset change while muted stays muted; a reset (the mic stopped) does not.
    const muted =
      tunerStep(
        tunerInitial(
          'chromatic',
        ),
        {
          type: 'reference',
          end: 100,
        },
      );
    expect(
      tunerStep(
        muted,
        {
          type: 'preset',
          preset:
            'guitar',
        },
      ),
    ).toEqual(
      {
        kind: 'muted',
        preset:
          'guitar',
        until:
          100 +
          ECHO_TAIL_MS,
      },
    );
    expect(
      tunerStep(
        muted,
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
