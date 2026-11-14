import {
  describe,
  expect,
  it,
} from 'vitest';
import { createRunner } from './runner';
import {
  createPlayChordMachine,
  playChordMachine,
  playChordQuestions,
  step,
  type ChordQuestion,
  type Event,
} from './play-chord';

const cMajor: ChordQuestion =
  {
    root: 60,
    quality:
      'major',
  };
const three =
  playChordQuestions(
    'chord-play-c-major',
  );

const play =
  (
    ...midis: number[]
  ): Event => ({
    type: 'answer',
    answer:
      {
        midis,
      },
  });
const next: Event =
  {
    type: 'next',
  };

describe('playChordQuestions', () => {
  it('asks C major first, then two more major chords, on natural notes only', () => {
    expect(
      three[0],
    ).toEqual(
      cMajor,
    );
    expect(
      three,
    ).toHaveLength(
      3,
    );
    for (const q of three) {
      expect(
        q.quality,
      ).toBe(
        'major',
      );
      for (const s of [
        0,
        4,
        7,
      ])
        expect(
          [
            0,
            2,
            4,
            5,
            7,
            9,
            11,
          ],
        ).toContain(
          (q.root +
            s) %
            12,
        );
    }
  });
});

describe('play-chord machine', () => {
  it('starts asking the first chord', () => {
    expect(
      playChordMachine.initial(
        three,
      ),
    ).toEqual(
      {
        kind: 'asking',
        cards:
          three,
        index: 0,
        correct: 0,
      },
    );
    expect(
      createPlayChordMachine(
        three,
      )
        .initial,
    ).toEqual(
      playChordMachine.initial(
        three,
      ),
    );
  });

  it('any voicing of the chord is right: inversion, another octave, a doubled note', () => {
    for (const midis of [
      [
        60,
        64,
        67,
      ],
      [
        64,
        67,
        72,
      ],
      [
        48,
        52,
        55,
      ],
      [
        60,
        64,
        67,
        72,
      ],
      [
        67,
        60,
        64,
      ],
    ]) {
      const r =
        step(
          playChordMachine.initial(
            three,
          ),
          play(
            ...midis,
          ),
        );
      expect(
        r.state,
        midis.join(),
      ).toMatchObject(
        {
          kind: 'feedback',
          right: true,
          correct: 1,
        },
      );
    }
  });

  it('a wrong or extra note is wrong, and keeps what was played', () => {
    for (const midis of [
      [
        60,
        63,
        67,
      ],
      [
        60,
        64,
        67,
        70,
      ],
      [
        60,
        62,
        65,
      ],
    ]) {
      const r =
        step(
          playChordMachine.initial(
            three,
          ),
          play(
            ...midis,
          ),
        );
      expect(
        r.state,
        midis.join(),
      ).toMatchObject(
        {
          kind: 'feedback',
          right: false,
          correct: 0,
        },
      );
      if (
        r
          .state
          .kind ===
        'feedback'
      )
        expect(
          r
            .state
            .answer
            .midis,
        ).toEqual(
          midis,
        );
    }
  });

  it('a lone tap or two notes is not an answer: nothing is graded and the chord stays asked', () => {
    const start =
      playChordMachine.initial(
        three,
      );
    for (const midis of [
      [],
      [
        60,
      ],
      [
        60,
        72,
      ],
      [
        60,
        64,
      ],
      [
        60,
        64,
        76,
      ],
    ]) {
      const r =
        step(
          start,
          play(
            ...midis,
          ),
        );
      expect(
        r.state,
        midis.join(),
      ).toBe(
        start,
      );
      expect(
        r.effects,
      ).toEqual(
        [],
      );
    }
    // ...and the chord can still be answered afterwards.
    expect(
      step(
        start,
        play(
          60,
          64,
          67,
        ),
      )
        .state,
    ).toMatchObject(
      {
        kind: 'feedback',
        right: true,
      },
    );
  });

  it('two answers in a row count once', () => {
    const a =
      step(
        playChordMachine.initial(
          three,
        ),
        play(
          60,
          64,
          67,
        ),
      ).state;
    expect(
      step(
        a,
        play(
          60,
          64,
          67,
        ),
      )
        .state,
    ).toBe(
      a,
    );
  });

  it('saves once past the last chord, and Retry saves again', () => {
    const answers =
      [
        play(
          60,
          64,
          67,
        ),
        play(
          65,
          69,
          72,
        ),
        play(
          67,
          71,
          74,
        ),
      ];
    let state =
      playChordMachine.initial(
        three,
      );
    let effects: unknown[] =
      [];
    for (const a of answers) {
      state =
        step(
          state,
          a,
        ).state;
      const n =
        step(
          state,
          next,
        );
      state =
        n.state;
      effects =
        n.effects;
    }
    expect(
      state,
    ).toEqual(
      {
        kind: 'saving',
        correct: 3,
        total: 3,
        attempt: 1,
      },
    );
    expect(
      effects,
    ).toEqual(
      [
        {
          type: 'complete',
          attempt: 1,
          score: 100,
          stars: 3,
        },
      ],
    );
    const failed =
      step(
        state,
        {
          type: 'answered',
          attempt: 1,
          outcome:
            'failed',
        },
      ).state;
    expect(
      step(
        failed,
        {
          type: 'retry',
        },
      )
        .effects,
    ).toEqual(
      [
        {
          type: 'complete',
          attempt: 2,
          score: 100,
          stars: 3,
        },
      ],
    );
  });

  it('runs on the shared runner: a chord in one tick answers once', () => {
    const run =
      createRunner(
        createPlayChordMachine(
          three,
        ),
      );
    run.send(
      play(
        60,
        64,
        67,
      ),
    );
    run.send(
      play(
        60,
        64,
      ),
    );
    expect(
      run.get(),
    ).toMatchObject(
      {
        kind: 'feedback',
        right: true,
        correct: 1,
      },
    );
  });
});
