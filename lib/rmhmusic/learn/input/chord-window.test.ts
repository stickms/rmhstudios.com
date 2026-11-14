import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { matchesChord } from '../theory/chords';
import {
  CHORD_WINDOW_MS,
  createChordCollector,
  createChordWindow,
} from './chord-window';

const on =
  (
    midi: number,
    time: number,
    source:
      | 'keys'
      | 'midi'
      | 'screen'
      | 'mic' = 'midi',
  ) => ({
    type: 'on' as const,
    midi,
    time,
    source,
  });
const off =
  (
    midi: number,
    time: number,
    source:
      | 'keys'
      | 'midi'
      | 'screen' = 'midi',
  ) => ({
    type: 'off' as const,
    midi,
    time,
    source,
  });

describe('chord window', () => {
  it('is 600 ms', () => {
    expect(
      CHORD_WINDOW_MS,
    ).toBe(
      600,
    );
  });

  it('the first note opens it and notes inside 600 ms of that one join', () => {
    const w =
      createChordWindow();
    expect(
      w.push(
        on(
          60,
          1000,
        ),
      ),
    ).toBe(
      'opened',
    );
    expect(
      w.push(
        on(
          64,
          1200,
        ),
      ),
    ).toBe(
      'added',
    );
    expect(
      w.push(
        on(
          67,
          1599,
        ),
      ),
    ).toBe(
      'added',
    );
    expect(
      w.take(),
    ).toEqual(
      [
        60,
        64,
        67,
      ],
    );
  });

  it('a note 600 ms or more after the first is late and not collected', () => {
    const w =
      createChordWindow();
    w.push(
      on(
        60,
        1000,
      ),
    );
    expect(
      w.push(
        on(
          64,
          1600,
        ),
      ),
    ).toBe(
      'late',
    );
    expect(
      w.take(),
    ).toEqual(
      [
        60,
      ],
    );
  });

  it('ignores note-offs, the microphone and notes that are not numbers', () => {
    const w =
      createChordWindow();
    expect(
      w.push(
        off(
          60,
          1000,
        ),
      ),
    ).toBe(
      'ignored',
    );
    expect(
      w.push(
        on(
          60,
          1000,
          'mic',
        ),
      ),
    ).toBe(
      'ignored',
    );
    expect(
      w.push(
        on(
          Number.NaN,
          1000,
        ),
      ),
    ).toBe(
      'ignored',
    );
    expect(
      w.push(
        on(
          60,
          Number.NaN,
        ),
      ),
    ).toBe(
      'ignored',
    );
    expect(
      w.take(),
    ).toEqual(
      [],
    );
    // still closed: the next real note opens it
    expect(
      w.push(
        on(
          60,
          1000,
        ),
      ),
    ).toBe(
      'opened',
    );
  });

  it('counts a repeated pitch once', () => {
    const w =
      createChordWindow();
    w.push(
      on(
        60,
        1000,
      ),
    );
    expect(
      w.push(
        on(
          60,
          1100,
        ),
      ),
    ).toBe(
      'added',
    );
    expect(
      w.take(),
    ).toEqual(
      [
        60,
      ],
    );
  });

  it('take closes it, so the next note opens a new one; reset forgets what was collected', () => {
    const w =
      createChordWindow();
    w.push(
      on(
        60,
        1000,
      ),
    );
    w.take();
    expect(
      w.push(
        on(
          64,
          1100,
        ),
      ),
    ).toBe(
      'opened',
    );
    w.reset();
    expect(
      w.take(),
    ).toEqual(
      [],
    );
    expect(
      w.push(
        on(
          67,
          5000,
        ),
      ),
    ).toBe(
      'opened',
    );
  });

  it('keys, MIDI and on-screen keys all count', () => {
    const w =
      createChordWindow();
    w.push(
      on(
        60,
        0,
        'keys',
      ),
    );
    w.push(
      on(
        64,
        10,
        'screen',
      ),
    );
    w.push(
      on(
        67,
        20,
        'midi',
      ),
    );
    expect(
      w.take(),
    ).toEqual(
      [
        60,
        64,
        67,
      ],
    );
  });
});

describe('chord window: keys already held', () => {
  it('seeds a new window with the pitches still held, then the new note', () => {
    const w =
      createChordWindow();
    w.push(
      on(
        60,
        0,
      ),
    ); // C held from before
    w.take();
    expect(
      w.push(
        on(
          65,
          5000,
        ),
      ),
    ).toBe(
      'opened',
    );
    w.push(
      on(
        69,
        5100,
      ),
    );
    expect(
      w.take(),
    ).toEqual(
      [
        60,
        65,
        69,
      ],
    );
  });

  it('holding C while pressing F and A is F major, and right for F major', () => {
    const w =
      createChordWindow();
    // The C major chord is played and held.
    w.push(
      on(
        60,
        0,
      ),
    );
    w.push(
      on(
        64,
        20,
      ),
    );
    w.push(
      on(
        67,
        40,
      ),
    );
    w.take();
    // C is kept down; E and G are let go; then F and A.
    w.push(
      off(
        64,
        3000,
      ),
    );
    w.push(
      off(
        67,
        3010,
      ),
    );
    expect(
      w.push(
        on(
          65,
          4000,
        ),
      ),
    ).toBe(
      'opened',
    );
    w.push(
      on(
        69,
        4050,
      ),
    );
    const played =
      w.take();
    expect(
      played,
    ).toEqual(
      [
        60,
        65,
        69,
      ],
    );
    expect(
      matchesChord(
        played,
        65,
        'major',
      ),
    ).toBe(
      true,
    );
  });

  it('a held note that is not in the new chord makes it wrong: the learner must let go of it', () => {
    const w =
      createChordWindow();
    w.push(
      on(
        64,
        0,
      ),
    ); // E stays down from the C chord
    w.take();
    w.push(
      on(
        65,
        4000,
      ),
    );
    w.push(
      on(
        69,
        4050,
      ),
    );
    w.push(
      on(
        72,
        4100,
      ),
    );
    const played =
      w.take();
    expect(
      played,
    ).toEqual(
      [
        64,
        65,
        69,
        72,
      ],
    );
    expect(
      matchesChord(
        played,
        65,
        'major',
      ),
    ).toBe(
      false,
    );
  });

  it('a note let go before the next chord is not carried over', () => {
    const w =
      createChordWindow();
    w.push(
      on(
        64,
        0,
      ),
    );
    w.take();
    w.push(
      off(
        64,
        1000,
      ),
    );
    w.push(
      on(
        65,
        4000,
      ),
    );
    expect(
      w.take(),
    ).toEqual(
      [
        65,
      ],
    );
  });

  it('a held note is dropped only on its own off, per source', () => {
    const w =
      createChordWindow();
    w.push(
      on(
        60,
        0,
        'keys',
      ),
    );
    w.push(
      on(
        60,
        10,
        'midi',
      ),
    );
    w.take();
    w.push(
      off(
        60,
        500,
        'keys',
      ),
    ); // still down on the MIDI controller
    w.push(
      on(
        65,
        4000,
      ),
    );
    expect(
      w.take(),
    ).toEqual(
      [
        60,
        65,
      ],
    );
    w.push(
      off(
        60,
        5000,
        'midi',
      ),
    );
    w.push(
      on(
        65,
        6000,
      ),
    );
    expect(
      w.take(),
    ).toEqual(
      [
        65,
      ],
    );
  });

  it('a held note let go while the window is open does not count; a pressed one does, even if tapped', () => {
    const w =
      createChordWindow();
    w.push(
      on(
        64,
        0,
      ),
    );
    w.take();
    w.push(
      on(
        65,
        4000,
      ),
    );
    w.push(
      off(
        64,
        4100,
      ),
    ); // the leftover E is lifted as F goes down
    w.push(
      on(
        69,
        4120,
      ),
    );
    w.push(
      off(
        69,
        4180,
      ),
    ); // a quick tap still counts
    w.push(
      on(
        72,
        4200,
      ),
    );
    expect(
      w.take(),
    ).toEqual(
      [
        65,
        69,
        72,
      ],
    );
  });

  it('keeps holds across reset, forgets them with releaseAll, and ignores the microphone', () => {
    const w =
      createChordWindow();
    w.push(
      on(
        60,
        0,
      ),
    );
    w.push(
      on(
        61,
        0,
        'mic',
      ),
    );
    w.reset();
    w.push(
      on(
        65,
        1000,
      ),
    );
    expect(
      w.take(),
    ).toEqual(
      [
        60,
        65,
      ],
    );
    w.releaseAll();
    w.push(
      on(
        65,
        9000,
      ),
    );
    expect(
      w.take(),
    ).toEqual(
      [
        65,
      ],
    );
  });

  it('can track a note without collecting it (a dialog is open, or the answer is showing)', () => {
    const w =
      createChordWindow();
    expect(
      w.push(
        on(
          60,
          0,
        ),
        false,
      ),
    ).toBe(
      'ignored',
    );
    expect(
      w.take(),
    ).toEqual(
      [],
    );
    expect(
      w.push(
        on(
          65,
          4000,
        ),
      ),
    ).toBe(
      'opened',
    );
    expect(
      w.take(),
    ).toEqual(
      [
        60,
        65,
      ],
    );
  });
});

describe('chord collector: the window timer and the lone tap', () => {
  beforeEach(
    () =>
      vi.useFakeTimers(),
  );
  afterEach(
    () =>
      vi.useRealTimers(),
  );

  const make =
    () => {
      const attempts: number[][] =
        [];
      const few: number[][] =
        [];
      const c =
        createChordCollector(
          {
            onAttempt:
              (
                m,
              ) =>
                attempts.push(
                  m,
                ),
            onTooFew:
              (
                m,
              ) =>
                few.push(
                  m,
                ),
          },
        );
      return {
        c,
        attempts,
        few,
      };
    };

  it('answers with the notes when the window ends, not before', () => {
    const {
      c,
      attempts,
    } =
      make();
    c.feed(
      on(
        60,
        0,
      ),
      true,
    );
    c.feed(
      on(
        64,
        100,
      ),
      true,
    );
    c.feed(
      on(
        67,
        200,
      ),
      true,
    );
    vi.advanceTimersByTime(
      CHORD_WINDOW_MS -
        1,
    );
    expect(
      attempts,
    ).toEqual(
      [],
    );
    vi.advanceTimersByTime(
      1,
    );
    expect(
      attempts,
    ).toEqual(
      [
        [
          60,
          64,
          67,
        ],
      ],
    );
  });

  it('does not answer a lone tap: it says too few and starts fresh', () => {
    const {
      c,
      attempts,
      few,
    } =
      make();
    c.feed(
      on(
        60,
        0,
      ),
      true,
    );
    vi.advanceTimersByTime(
      CHORD_WINDOW_MS,
    );
    expect(
      attempts,
    ).toEqual(
      [],
    );
    expect(
      few,
    ).toEqual(
      [
        [
          60,
        ],
      ],
    );
    // The tap is let go; the next one opens a new window.
    c.feed(
      off(
        60,
        1000,
      ),
      true,
    );
    c.feed(
      on(
        64,
        2000,
      ),
      true,
    );
    c.feed(
      on(
        67,
        2100,
      ),
      true,
    );
    c.feed(
      on(
        72,
        2150,
      ),
      true,
    );
    vi.advanceTimersByTime(
      CHORD_WINDOW_MS,
    );
    expect(
      attempts,
    ).toEqual(
      [
        [
          64,
          67,
          72,
        ],
      ],
    );
  });

  it('two notes, or one pitch class in two octaves, are still not an answer', () => {
    const {
      c,
      attempts,
      few,
    } =
      make();
    c.feed(
      on(
        60,
        0,
      ),
      true,
    );
    c.feed(
      on(
        72,
        50,
      ),
      true,
    );
    c.feed(
      on(
        64,
        100,
      ),
      true,
    );
    c.feed(
      on(
        76,
        150,
      ),
      true,
    );
    vi.advanceTimersByTime(
      CHORD_WINDOW_MS,
    );
    expect(
      attempts,
    ).toEqual(
      [],
    );
    expect(
      few,
    ).toHaveLength(
      1,
    );
  });

  it('a tap that is still held counts toward the next try', () => {
    const {
      c,
      attempts,
      few,
    } =
      make();
    c.feed(
      on(
        60,
        0,
      ),
      true,
    );
    vi.advanceTimersByTime(
      CHORD_WINDOW_MS,
    );
    expect(
      few,
    ).toHaveLength(
      1,
    );
    c.feed(
      on(
        64,
        3000,
      ),
      true,
    );
    c.feed(
      on(
        67,
        3050,
      ),
      true,
    );
    vi.advanceTimersByTime(
      CHORD_WINDOW_MS,
    );
    expect(
      attempts,
    ).toEqual(
      [
        [
          60,
          64,
          67,
        ],
      ],
    );
  });

  it('cancel drops the window and its timer, and keeps what is held', () => {
    const {
      c,
      attempts,
      few,
    } =
      make();
    c.feed(
      on(
        60,
        0,
      ),
      true,
    );
    c.feed(
      on(
        64,
        10,
      ),
      true,
    );
    c.feed(
      on(
        67,
        20,
      ),
      true,
    );
    c.cancel();
    vi.advanceTimersByTime(
      5000,
    );
    expect(
      attempts,
    ).toEqual(
      [],
    );
    expect(
      few,
    ).toEqual(
      [],
    );
    c.feed(
      on(
        72,
        9000,
      ),
      true,
    );
    vi.advanceTimersByTime(
      CHORD_WINDOW_MS,
    );
    // C, E and G are still down; the new C joins them.
    expect(
      attempts,
    ).toEqual(
      [
        [
          60,
          64,
          67,
          72,
        ],
      ],
    );
  });

  it('not listening: nothing opens or answers, but holds are tracked', () => {
    const {
      c,
      attempts,
      few,
    } =
      make();
    c.feed(
      on(
        60,
        0,
      ),
      false,
    );
    vi.advanceTimersByTime(
      5000,
    );
    expect(
      attempts,
    ).toEqual(
      [],
    );
    expect(
      few,
    ).toEqual(
      [],
    );
    c.feed(
      on(
        64,
        6000,
      ),
      true,
    );
    c.feed(
      on(
        67,
        6050,
      ),
      true,
    );
    vi.advanceTimersByTime(
      CHORD_WINDOW_MS,
    );
    expect(
      attempts,
    ).toEqual(
      [
        [
          60,
          64,
          67,
        ],
      ],
    );
  });

  it('releaseAll forgets holds that will never be let go', () => {
    const {
      c,
      attempts,
      few,
    } =
      make();
    c.feed(
      on(
        60,
        0,
      ),
      false,
    );
    c.releaseAll();
    c.feed(
      on(
        65,
        6000,
      ),
      true,
    );
    vi.advanceTimersByTime(
      CHORD_WINDOW_MS,
    );
    expect(
      attempts,
    ).toEqual(
      [],
    );
    expect(
      few,
    ).toEqual(
      [
        [
          65,
        ],
      ],
    );
  });
});
