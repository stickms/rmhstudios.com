import {
  describe,
  expect,
  it,
} from 'vitest';
import { createRunner } from '../machines/runner';
import { ZERO_MS } from '../scoring/timing';
import {
  createSongMachine,
  cursorOf,
  marksOf,
  nextDue,
  targetTimes,
  type SongEffect,
  type SongEvent,
  type SongState,
  SKIPPED_WRONG,
} from './machine';
import { parseBars } from './notation';
import { MIC_ONSET_MS } from './scoring';
import type { Song } from './score';

// C4 D4 E4:2 | G4:4 — four notes, onsets 0, 1, 2, 4.
const SONG: Song =
  {
    id: 'tiny',
    title:
      'Tiny',
    composer:
      'Traditional',
    key: 'C',
    beatsPerBar: 4,
    bpm: 120,
    pickup: 0,
    bars: parseBars(
      'C4 D4 E4:2 | G4:4 |',
    ),
  };

type Source =
  | 'midi'
  | 'keys'
  | 'screen'
  | 'mic';

function run(
  mode:
    | 'wait'
    | 'play',
  version:
    | 'piano'
    | 'guitar' = 'piano',
) {
  const r =
    createRunner(
      createSongMachine(
        {
          song: SONG,
          version,
          mode,
        },
      ),
    );
  const effects: SongEffect[] =
    [];
  const send =
    (
      e: SongEvent,
    ) => {
      const fx =
        r.send(
          e,
        );
      effects.push(
        ...fx,
      );
      return fx;
    };
  const on =
    (
      midi: number,
      time: number,
      source: Source = 'midi',
    ) =>
      send(
        {
          type: 'note',
          note: {
            type: 'on',
            midi,
            time,
            source,
          },
        },
      );
  const off =
    (
      midi: number,
      time: number,
      source: Source = 'midi',
    ) =>
      send(
        {
          type: 'note',
          note: {
            type: 'off',
            midi,
            time,
            source,
          },
        },
      );
  return {
    get: (): SongState =>
      r.get(),
    send,
    on,
    off,
    effects,
  };
}

describe('wait for me', () => {
  it('waits on each note until it is played, then saves the run', () => {
    const m =
      run(
        'wait',
      );
    m.send(
      {
        type: 'start',
        at: 1000,
      },
    );
    expect(
      m.get()
        .kind,
    ).toBe(
      'waiting',
    );
    expect(
      cursorOf(
        m.get(),
      ),
    ).toBe(
      0,
    );
    m.on(
      60,
      1100,
    );
    expect(
      cursorOf(
        m.get(),
      ),
    ).toBe(
      1,
    );
    m.on(
      64,
      1200,
    ); // wrong: the cursor stays
    expect(
      cursorOf(
        m.get(),
      ),
    ).toBe(
      1,
    );
    m.on(
      62,
      1300,
    );
    m.on(
      64,
      1400,
    );
    expect(
      marksOf(
        m.get(),
      ).slice(
        0,
        3,
      ),
    ).toEqual(
      [
        'right',
        'wrong',
        'right',
      ],
    );
    const fx =
      m.on(
        67,
        1500,
      );
    expect(
      m.get()
        .kind,
    ).toBe(
      'saving',
    );
    expect(
      fx,
    ).toContainEqual(
      expect.objectContaining(
        {
          type: 'save',
          attempt: 1,
          run: {
            mode: 'wait',
            wrong:
              [
                0,
                1,
                0,
                0,
              ],
          },
        },
      ),
    );
    const s =
      m.get();
    expect(
      s.kind ===
        'saving' &&
        s
          .summary
          .score,
    ).toBe(
      88,
    );
  });

  it('ignores note-offs and notes timed before the run started', () => {
    const m =
      run(
        'wait',
      );
    m.send(
      {
        type: 'start',
        at: 1000,
      },
    );
    m.on(
      62,
      999,
    );
    m.off(
      62,
      1001,
    );
    expect(
      cursorOf(
        m.get(),
      ),
    ).toBe(
      0,
    );
    const s =
      m.get();
    expect(
      s.kind ===
        'waiting' &&
        s.wrong,
    ).toBe(
      0,
    );
  });

  it('takes any octave on the computer keys, the screen and the mic, the exact pitch on MIDI', () => {
    const m =
      run(
        'wait',
      );
    m.send(
      {
        type: 'start',
        at: 0,
      },
    );
    m.on(
      72,
      10,
      'keys',
    );
    expect(
      cursorOf(
        m.get(),
      ),
    ).toBe(
      1,
    );
    m.on(
      50,
      20,
      'mic',
    );
    expect(
      cursorOf(
        m.get(),
      ),
    ).toBe(
      2,
    );
    m.on(
      76,
      30,
      'midi',
    ); // E5 for E4 on MIDI is wrong
    expect(
      cursorOf(
        m.get(),
      ),
    ).toBe(
      2,
    );
  });

  it('asks guitar for the sounding pitch, an octave under the written one', () => {
    const m =
      run(
        'wait',
        'guitar',
      );
    m.send(
      {
        type: 'start',
        at: 0,
      },
    );
    m.on(
      60,
      10,
    ); // written C4 sounds C3 on guitar
    expect(
      cursorOf(
        m.get(),
      ),
    ).toBe(
      0,
    );
    m.on(
      48,
      20,
    );
    expect(
      cursorOf(
        m.get(),
      ),
    ).toBe(
      1,
    );
  });
});

describe('play along', () => {
  const T0 = 10_000;
  const BEAT = 500;
  const targets =
    [
      T0,
      T0 +
        BEAT,
      T0 +
        2 *
          BEAT,
      T0 +
        4 *
          BEAT,
    ];

  function begun(
    latencyMs = 0,
    calibrated = false,
  ) {
    const m =
      run(
        'play',
      );
    const fx =
      m.send(
        {
          type: 'start',
          at: 0,
        },
      );
    expect(
      fx,
    ).toContainEqual(
      {
        type: 'prepare',
        token: 1,
      },
    );
    expect(
      m.get()
        .kind,
    ).toBe(
      'counting',
    );
    m.send(
      {
        type: 'begin',
        token: 1,
        t0: T0,
        beatMs:
          BEAT,
        latencyMs,
        calibrated,
      },
    );
    return m;
  }

  it('places every note on the beat grid', () => {
    const m =
      begun();
    expect(
      targetTimes(
        m.get(),
      ),
    ).toEqual(
      targets,
    );
  });

  it('scores every note on time, right, with top marks', () => {
    const m =
      begun();
    targets.forEach(
      (
        t,
        i,
      ) => {
        m.send(
          {
            type: 'tick',
            at: t,
          },
        );
        expect(
          cursorOf(
            m.get(),
          ),
        ).toBe(
          i,
        );
        m.on(
          [
            60,
            62,
            64,
            67,
          ][
            i
          ] ??
            0,
          t,
        );
      },
    );
    m.send(
      {
        type: 'tick',
        at:
          T0 +
          4 *
            BEAT +
          ZERO_MS +
          MIC_ONSET_MS +
          1,
      },
    );
    const s =
      m.get();
    expect(
      s.kind,
    ).toBe(
      'saving',
    );
    expect(
      s.kind ===
        'saving' &&
        s.summary,
    ).toEqual(
      expect.objectContaining(
        {
          score: 100,
          stars: 3,
          right: 4,
        },
      ),
    );
    expect(
      m.effects,
    ).toContainEqual(
      expect.objectContaining(
        {
          type: 'halt',
        },
      ),
    );
  });

  it('scores late notes lower and marks a wrong pitch and a missed note', () => {
    const m =
      begun();
    m.on(
      60,
      targets[0] +
        150,
    );
    m.on(
      65,
      targets[1] +
        20,
    ); // F4 for D4
    // E4 never played
    m.on(
      67,
      targets[3] +
        120,
    );
    m.send(
      {
        type: 'tick',
        at:
          targets[3] +
          1000,
      },
    );
    const s =
      m.get();
    expect(
      s.kind,
    ).toBe(
      'saving',
    );
    if (
      s.kind !==
      'saving'
    )
      return;
    expect(
      s
        .summary
        .score,
    ).toBeLessThan(
      40,
    );
    expect(
      s.summary,
    ).toEqual(
      expect.objectContaining(
        {
          right: 2,
          wrong: 1,
          missed: 1,
          late: 2,
        },
      ),
    );
    expect(
      marksOf(
        s,
      ),
    ).toEqual(
      [
        'right',
        'wrong',
        'wrong',
        'right',
      ],
    );
  });

  it('with a calibrated latency, takes nothing more off a mic note (the calibration already holds its delay)', () => {
    const m =
      begun(
        30,
        true,
      );
    m.on(
      60,
      targets[0] +
        30,
    );
    m.on(
      62,
      targets[1] +
        30,
      'mic',
    );
    const s =
      m.get();
    expect(
      s.kind ===
        'playing' &&
        s.notes.slice(
          0,
          2,
        ),
    ).toEqual(
      [
        {
          outcome:
            'right',
          offMs: 0,
        },
        {
          outcome:
            'right',
          offMs: 0,
        },
      ],
    );
  });

  it('a stale begin (from a run stopped while sound woke) is ignored; only the current run begins', () => {
    const m =
      run(
        'play',
      );
    expect(
      m.send(
        {
          type: 'start',
          at: 0,
        },
      ),
    ).toContainEqual(
      {
        type: 'prepare',
        token: 1,
      },
    );
    m.send(
      {
        type: 'again',
      },
    );
    expect(
      m.send(
        {
          type: 'start',
          at: 1,
        },
      ),
    ).toContainEqual(
      {
        type: 'prepare',
        token: 2,
      },
    );
    m.send(
      {
        type: 'begin',
        token: 1,
        t0: T0,
        beatMs:
          BEAT,
        latencyMs: 0,
        calibrated: false,
      },
    );
    expect(
      m.get()
        .kind,
    ).toBe(
      'counting',
    );
    m.send(
      {
        type: 'begin',
        token: 2,
        t0: T0,
        beatMs:
          BEAT,
        latencyMs: 0,
        calibrated: false,
      },
    );
    expect(
      m.get()
        .kind,
    ).toBe(
      'playing',
    );
  });

  it('gives a note-on to the open note of its pitch before the nearest one (overlapping eighths)', () => {
    const r =
      createRunner(
        createSongMachine(
          {
            song: {
              ...SONG,
              bars: parseBars(
                'C4:0.5 D4:0.5 E4:3 | G4:4 |',
              ),
            },
            version:
              'piano',
            mode: 'play',
          },
        ),
      );
    r.send(
      {
        type: 'start',
        at: 0,
      },
    );
    r.send(
      {
        type: 'begin',
        token: 1,
        t0: T0,
        beatMs:
          BEAT,
        latencyMs: 0,
        calibrated: true,
      },
    );
    // D4 is due at T0 + 250; played at T0 + 110 it is nearer C4's beat, but it is D4.
    r.send(
      {
        type: 'note',
        note: {
          type: 'on',
          midi: 62,
          time:
            T0 +
            110,
          source:
            'midi',
        },
      },
    );
    const s =
      r.get();
    expect(
      s.kind ===
        'playing' &&
        s.notes.slice(
          0,
          2,
        ),
    ).toEqual(
      [
        null,
        {
          outcome:
            'right',
          offMs:
            -140,
        },
      ],
    );
    // A wrong pitch still goes to the nearest open note.
    r.send(
      {
        type: 'note',
        note: {
          type: 'on',
          midi: 65,
          time:
            T0 +
            20,
          source:
            'midi',
        },
      },
    );
    const t =
      r.get();
    expect(
      t.kind ===
        'playing' &&
        t
          .notes[0],
    ).toEqual(
      {
        outcome:
          'wrong',
        offMs: 20,
      },
    );
  });

  it('uncalibrated, subtracts the default latency, and the mic onset for mic notes', () => {
    const m =
      begun(
        40,
      );
    m.on(
      60,
      targets[0] +
        40,
    );
    m.on(
      62,
      targets[1] +
        40 +
        MIC_ONSET_MS,
      'mic',
    );
    const s =
      m.get();
    expect(
      s.kind ===
        'playing' &&
        s.notes.slice(
          0,
          2,
        ),
    ).toEqual(
      [
        {
          outcome:
            'right',
          offMs: 0,
        },
        {
          outcome:
            'right',
          offMs: 0,
        },
      ],
    );
  });

  it('charges a note that answers nothing, but not one in the count-in', () => {
    const m =
      begun();
    m.on(
      60,
      T0 -
        1000,
    ); // count-in: ignored
    m.on(
      60,
      targets[0],
    );
    m.on(
      60,
      targets[0] +
        250,
    ); // between notes, out of every open window: an extra
    const s =
      m.get();
    expect(
      s.kind ===
        'playing' &&
        s.extras,
    ).toBe(
      1,
    );
  });

  it('ignores notes before the run is under way', () => {
    const m =
      run(
        'play',
      );
    m.on(
      60,
      5,
    );
    m.send(
      {
        type: 'start',
        at: 0,
      },
    );
    m.on(
      60,
      6,
    );
    expect(
      m.get()
        .kind,
    ).toBe(
      'counting',
    );
  });

  it('asks for a tick at the next onset or the next window close, and none at rest', () => {
    const m =
      begun();
    expect(
      nextDue(
        m.get(),
      ),
    ).toBe(
      targets[0],
    );
    m.send(
      {
        type: 'tick',
        at: targets[0],
      },
    );
    expect(
      nextDue(
        m.get(),
      ),
    ).toBe(
      targets[1],
    );
    expect(
      nextDue(
        run(
          'play',
        ).get(),
      ),
    ).toBeNull();
  });

  it('still asks for a tick after the last note when every note was answered, and that tick ends the run', () => {
    const m =
      begun();
    targets.forEach(
      (
        t,
        i,
      ) => {
        m.send(
          {
            type: 'tick',
            at: t,
          },
        );
        m.on(
          [
            60,
            62,
            64,
            67,
          ][
            i
          ] ??
            0,
          t,
        );
      },
    );
    const due =
      nextDue(
        m.get(),
      );
    expect(
      due,
    ).not.toBeNull();
    m.send(
      {
        type: 'tick',
        at:
          due ??
          0,
      },
    );
    expect(
      m.get()
        .kind,
    ).toBe(
      'saving',
    );
  });

  it('drops a run that is stopped (away, a dialog, sound) and says why', () => {
    const m =
      begun();
    const fx =
      m.send(
        {
          type: 'stop',
          why: 'away',
        },
      );
    expect(
      fx,
    ).toContainEqual(
      {
        type: 'halt',
      },
    );
    const s =
      m.get();
    expect(
      s.kind ===
        'ready' &&
        s.stopped,
    ).toBe(
      'away',
    );
  });
});

describe('skipping a note (Wait for me)', () => {
  it('moves on, marks the note wrong and scores it nothing', () => {
    const m =
      run(
        'wait',
      );
    m.send(
      {
        type: 'start',
        at: 0,
      },
    );
    m.on(
      60,
      1,
    );
    m.send(
      {
        type: 'skip',
      },
    );
    expect(
      cursorOf(
        m.get(),
      ),
    ).toBe(
      2,
    );
    expect(
      marksOf(
        m.get(),
      ).slice(
        0,
        2,
      ),
    ).toEqual(
      [
        'right',
        'wrong',
      ],
    );
    m.on(
      64,
      3,
    );
    m.on(
      67,
      4,
    );
    const s =
      m.get();
    expect(
      s.kind ===
        'saving' &&
        s.record,
    ).toEqual(
      {
        mode: 'wait',
        wrong:
          [
            0,
            SKIPPED_WRONG,
            0,
            0,
          ],
      },
    );
    expect(
      s.kind ===
        'saving' &&
        s
          .summary
          .score,
    ).toBe(
      75,
    );
  });

  it('is ignored outside Wait for me', () => {
    const m =
      run(
        'play',
      );
    m.send(
      {
        type: 'start',
        at: 0,
      },
    );
    m.send(
      {
        type: 'skip',
      },
    );
    expect(
      m.get()
        .kind,
    ).toBe(
      'counting',
    );
  });
});

describe('saving', () => {
  function finished() {
    const m =
      run(
        'wait',
      );
    m.send(
      {
        type: 'start',
        at: 0,
      },
    );
    [
      60,
      62,
      64,
      67,
    ].forEach(
      (
        p,
        i,
      ) =>
        m.on(
          p,
          i +
            1,
        ),
    );
    return m;
  }

  it('maps answers to states and ignores a stale attempt', () => {
    const m =
      finished();
    m.send(
      {
        type: 'answered',
        attempt: 7,
        outcome:
          'saved',
      },
    );
    expect(
      m.get()
        .kind,
    ).toBe(
      'saving',
    );
    m.send(
      {
        type: 'answered',
        attempt: 1,
        outcome:
          'failed',
      },
    );
    expect(
      m.get()
        .kind,
    ).toBe(
      'failed',
    );
    const fx =
      m.send(
        {
          type: 'retry',
        },
      );
    expect(
      fx,
    ).toContainEqual(
      expect.objectContaining(
        {
          type: 'save',
          attempt: 2,
        },
      ),
    );
    m.send(
      {
        type: 'answered',
        attempt: 2,
        outcome:
          'saved',
      },
    );
    expect(
      m.get()
        .kind,
    ).toBe(
      'saved',
    );
  });

  it('says signed out on 401 and keeps nothing on unsaved', () => {
    const a =
      finished();
    a.send(
      {
        type: 'answered',
        attempt: 1,
        outcome:
          'unauthorized',
      },
    );
    expect(
      a.get()
        .kind,
    ).toBe(
      'signed-out',
    );
    const b =
      finished();
    b.send(
      {
        type: 'answered',
        attempt: 1,
        outcome:
          'unsaved',
      },
    );
    expect(
      b.get()
        .kind,
    ).toBe(
      'unsaved',
    );
  });

  it('starts again from any finished state', () => {
    const m =
      finished();
    m.send(
      {
        type: 'answered',
        attempt: 1,
        outcome:
          'saved',
      },
    );
    m.send(
      {
        type: 'again',
      },
    );
    expect(
      m.get()
        .kind,
    ).toBe(
      'ready',
    );
    expect(
      cursorOf(
        m.get(),
      ),
    ).toBe(
      -1,
    );
  });
});
