import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const started: {
  midi: number;
  released: boolean;
  sounding: boolean;
}[] =
  [];
/** Notes asked for whose sound has not begun (`audible: 'later'`), in the order asked. */
const pending: (() => void)[] =
  [];
let status:
  | 'ready'
  | 'asleep'
  | 'none' =
  'ready';
/** `now`: the synth, a note sounds during the call. `later`: a sampled engine, a test starts it. */
let audible:
  | 'now'
  | 'later' =
  'now';
vi.mock(
  './voice',
  () => ({
    soundStatus:
      () =>
        status,
    playNote:
      (
        midi: number,
        opts: {
          onStart?: () => void;
        } = {},
      ) => {
        const note =
          {
            midi,
            released: false,
            sounding: false,
          };
        started.push(
          note,
        );
        const begin =
          () => {
            if (
              note.sounding
            )
              return; // (a late begin after a release: the sequence must ignore it)
            note.sounding = true;
            opts.onStart?.();
          };
        if (
          audible ===
          'now'
        )
          begin();
        else
          pending.push(
            begin,
          );
        return () => {
          note.released = true;
        };
      },
  }),
);

import {
  CHORD_HOLD_MS,
  INTERVAL_GAP_MS,
  playChord,
  playSequence,
} from './sequence';

beforeEach(
  () => {
    started.length = 0;
    pending.length = 0;
    status =
      'ready';
    audible =
      'now';
    vi.useFakeTimers();
  },
);
afterEach(
  () => {
    vi.useRealTimers();
  },
);

describe('playSequence', () => {
  it('starts each note a gap after the last and lets each go after the hold', () => {
    playSequence(
      [
        60,
        67,
      ],
      500,
      {
        holdMs: 400,
      },
    );
    expect(
      started.map(
        (
          n,
        ) =>
          n.midi,
      ),
    ).toEqual(
      [
        60,
      ],
    );
    vi.advanceTimersByTime(
      399,
    );
    expect(
      started[0]
        .released,
    ).toBe(
      false,
    );
    vi.advanceTimersByTime(
      1,
    );
    expect(
      started[0]
        .released,
    ).toBe(
      true,
    );
    vi.advanceTimersByTime(
      100,
    );
    expect(
      started.map(
        (
          n,
        ) =>
          n.midi,
      ),
    ).toEqual(
      [
        60,
        67,
      ],
    );
    vi.advanceTimersByTime(
      400,
    );
    expect(
      started[1]
        .released,
    ).toBe(
      true,
    );
  });

  it('plays every note at once with a gap of 0 (a chord), on the call itself', () => {
    playSequence(
      [
        60,
        64,
        67,
      ],
      0,
      {
        holdMs: 1000,
      },
    );
    expect(
      started.map(
        (
          n,
        ) =>
          n.midi,
      ),
    ).toEqual(
      [
        60,
        64,
        67,
      ],
    );
    vi.advanceTimersByTime(
      1000,
    );
    expect(
      started.every(
        (
          n,
        ) =>
          n.released,
      ),
    ).toBe(
      true,
    );
  });

  it('cancel stops later notes and lets the sounding ones go, and is safe twice', () => {
    const seq =
      playSequence(
        [
          60,
          67,
        ],
        500,
        {
          holdMs: 900,
        },
      );
    seq.cancel();
    expect(
      started[0]
        .released,
    ).toBe(
      true,
    );
    vi.advanceTimersByTime(
      5000,
    );
    expect(
      started.map(
        (
          n,
        ) =>
          n.midi,
      ),
    ).toEqual(
      [
        60,
      ],
    );
    expect(
      () =>
        seq.cancel(),
    ).not.toThrow();
  });

  it('skips a note that is not a number', () => {
    playSequence(
      [
        60,
        Number.NaN,
        64,
      ],
      0,
      {
        holdMs: 100,
      },
    );
    expect(
      started.map(
        (
          n,
        ) =>
          n.midi,
      ),
    ).toEqual(
      [
        60,
        64,
      ],
    );
  });

  it('reports started, and plays nothing when sound is not ready', () => {
    expect(
      playSequence(
        [
          60,
        ],
        0,
      )
        .started,
    ).toBe(
      true,
    );
    for (const s of [
      'asleep',
      'none',
    ] as const) {
      status =
        s;
      started.length = 0;
      const seq =
        playSequence(
          [
            60,
            67,
          ],
          300,
        );
      expect(
        seq.started,
      ).toBe(
        false,
      );
      vi.advanceTimersByTime(
        2000,
      );
      expect(
        started,
      ).toEqual(
        [],
      );
      expect(
        () =>
          seq.cancel(),
      ).not.toThrow();
    }
  });
});

describe('playChord', () => {
  it('sounds every note at once and lets them ring', () => {
    const chord =
      playChord(
        [
          60,
          64,
          67,
        ],
      );
    expect(
      chord.started,
    ).toBe(
      true,
    );
    expect(
      started.map(
        (
          n,
        ) =>
          n.midi,
      ),
    ).toEqual(
      [
        60,
        64,
        67,
      ],
    );
    vi.advanceTimersByTime(
      CHORD_HOLD_MS -
        1,
    );
    expect(
      started.some(
        (
          n,
        ) =>
          n.released,
      ),
    ).toBe(
      false,
    );
    vi.advanceTimersByTime(
      1,
    );
    expect(
      started.every(
        (
          n,
        ) =>
          n.released,
      ),
    ).toBe(
      true,
    );
  });
  it('cancels like a sequence', () => {
    const chord =
      playChord(
        [
          60,
          64,
          67,
        ],
      );
    chord.cancel();
    expect(
      started.every(
        (
          n,
        ) =>
          n.released,
      ),
    ).toBe(
      true,
    );
  });
  it('is not started when sound is not ready', () => {
    status =
      'asleep';
    expect(
      playChord(
        [
          60,
          64,
          67,
        ],
      )
        .started,
    ).toBe(
      false,
    );
    expect(
      started,
    ).toEqual(
      [],
    );
  });
});

describe('the constants a per-instrument value can replace', () => {
  it("names the gap between an interval's notes and how long a chord rings", () => {
    expect(
      INTERVAL_GAP_MS,
    ).toBe(
      750,
    );
    expect(
      CHORD_HOLD_MS,
    ).toBe(
      1400,
    );
  });
});

describe('playSequence: lifecycle', () => {
  it('reports each note as it starts, and "all started" only when the last one has', () => {
    const notes: number[] =
      [];
    let all = 0;
    playSequence(
      [
        60,
        67,
      ],
      500,
      {
        onNoteStart:
          (
            i,
          ) =>
            notes.push(
              i,
            ),
        onAllStarted:
          () =>
            all++,
      },
    );
    expect(
      notes,
    ).toEqual(
      [
        0,
      ],
    );
    expect(
      all,
    ).toBe(
      0,
    );
    vi.advanceTimersByTime(
      499,
    );
    expect(
      all,
    ).toBe(
      0,
    );
    vi.advanceTimersByTime(
      1,
    );
    expect(
      notes,
    ).toEqual(
      [
        0,
        1,
      ],
    );
    expect(
      all,
    ).toBe(
      1,
    );
    vi.advanceTimersByTime(
      10_000,
    );
    expect(
      all,
    ).toBe(
      1,
    );
  });

  it('a chord has sounded when every note has started, on the call itself', () => {
    const notes: number[] =
      [];
    let all = 0;
    const chord =
      playChord(
        [
          60,
          64,
          67,
        ],
        {
          onNoteStart:
            (
              i,
            ) =>
              notes.push(
                i,
              ),
          onAllStarted:
            () =>
              all++,
        },
      );
    expect(
      chord.started,
    ).toBe(
      true,
    );
    expect(
      notes,
    ).toEqual(
      [
        0,
        1,
        2,
      ],
    );
    expect(
      all,
    ).toBe(
      1,
    );
  });

  it('cancel before the last note never reports all started, and no later note starts', () => {
    let all = 0;
    const seq =
      playSequence(
        [
          60,
          67,
        ],
        500,
        {
          onAllStarted:
            () =>
              all++,
        },
      );
    vi.advanceTimersByTime(
      300,
    );
    seq.cancel();
    vi.advanceTimersByTime(
      10_000,
    );
    expect(
      all,
    ).toBe(
      0,
    );
    expect(
      started.map(
        (
          n,
        ) =>
          n.midi,
      ),
    ).toEqual(
      [
        60,
      ],
    );
  });

  it('cancel after the end changes nothing it already reported', () => {
    let all = 0;
    const seq =
      playSequence(
        [
          60,
          67,
        ],
        100,
        {
          onAllStarted:
            () =>
              all++,
        },
      );
    vi.advanceTimersByTime(
      100,
    );
    seq.cancel();
    expect(
      all,
    ).toBe(
      1,
    );
  });

  it('never reports anything when sound is not ready', () => {
    status =
      'asleep';
    let calls = 0;
    const seq =
      playSequence(
        [
          60,
          67,
        ],
        100,
        {
          onNoteStart:
            () =>
              calls++,
          onAllStarted:
            () =>
              calls++,
        },
      );
    vi.advanceTimersByTime(
      5000,
    );
    expect(
      seq.started,
    ).toBe(
      false,
    );
    expect(
      calls,
    ).toBe(
      0,
    );
  });

  it('is not started, and reports nothing, when there is no note to play', () => {
    let all = 0;
    const seq =
      playSequence(
        [
          Number.NaN,
        ],
        100,
        {
          onAllStarted:
            () =>
              all++,
        },
      );
    expect(
      seq.started,
    ).toBe(
      false,
    );
    expect(
      playSequence(
        [],
        0,
        {
          onAllStarted:
            () =>
              all++,
        },
      )
        .started,
    ).toBe(
      false,
    );
    expect(
      all,
    ).toBe(
      0,
    );
  });

  it('with a sound that begins later, the gap and the hold run from when a note really starts', () => {
    audible =
      'later';
    const notes: number[] =
      [];
    let all = 0;
    playSequence(
      [
        60,
        67,
      ],
      500,
      {
        holdMs: 400,
        onNoteStart:
          (
            i,
          ) =>
            notes.push(
              i,
            ),
        onAllStarted:
          () =>
            all++,
      },
    );
    // A slow load: nothing is audible, so nothing is heard, however long it takes.
    vi.advanceTimersByTime(
      5000,
    );
    expect(
      notes,
    ).toEqual(
      [],
    );
    expect(
      started.map(
        (
          n,
        ) =>
          n.midi,
      ),
    ).toEqual(
      [
        60,
      ],
    );
    expect(
      all,
    ).toBe(
      0,
    );
    // The first note begins; the second is asked for a gap later, not before.
    pending.shift()?.();
    expect(
      notes,
    ).toEqual(
      [
        0,
      ],
    );
    vi.advanceTimersByTime(
      499,
    );
    expect(
      started.map(
        (
          n,
        ) =>
          n.midi,
      ),
    ).toEqual(
      [
        60,
      ],
    );
    // Its hold ran from when it began: 400 ms, so it is let go before the second is asked for.
    expect(
      started[0]
        .released,
    ).toBe(
      true,
    );
    vi.advanceTimersByTime(
      1,
    );
    expect(
      started.map(
        (
          n,
        ) =>
          n.midi,
      ),
    ).toEqual(
      [
        60,
        67,
      ],
    );
    expect(
      all,
    ).toBe(
      0,
    );
    // A second slow load; only when it begins is the question fully heard.
    vi.advanceTimersByTime(
      3000,
    );
    expect(
      all,
    ).toBe(
      0,
    );
    pending.shift()?.();
    expect(
      all,
    ).toBe(
      1,
    );
    vi.advanceTimersByTime(
      399,
    );
    expect(
      started[1]
        .released,
    ).toBe(
      false,
    );
    vi.advanceTimersByTime(
      1,
    );
    expect(
      started[1]
        .released,
    ).toBe(
      true,
    );
  });

  it('a chord of sounds that begin later has sounded when the last of them begins', () => {
    audible =
      'later';
    let all = 0;
    playChord(
      [
        60,
        64,
        67,
      ],
      {
        onAllStarted:
          () =>
            all++,
      },
    );
    expect(
      started,
    ).toHaveLength(
      3,
    );
    pending.shift()?.();
    pending.shift()?.();
    expect(
      all,
    ).toBe(
      0,
    );
    pending.shift()?.();
    expect(
      all,
    ).toBe(
      1,
    );
  });

  it('a sound that begins after cancel is ignored: no hold timer, no report', () => {
    audible =
      'later';
    let calls = 0;
    const seq =
      playSequence(
        [
          60,
          67,
        ],
        100,
        {
          onNoteStart:
            () =>
              calls++,
          onAllStarted:
            () =>
              calls++,
        },
      );
    const late =
      pending.shift();
    seq.cancel();
    expect(
      started[0]
        .released,
    ).toBe(
      true,
    );
    late?.();
    vi.advanceTimersByTime(
      5000,
    );
    expect(
      calls,
    ).toBe(
      0,
    );
    expect(
      started,
    ).toHaveLength(
      1,
    );
  });
});
