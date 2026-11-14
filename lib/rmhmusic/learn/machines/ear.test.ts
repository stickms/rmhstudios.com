import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  chordQuality,
  type ChordQuality,
} from '../theory/chords';
import {
  intervalOf,
  type IntervalName,
} from '../theory/intervals';
import {
  EAR_QUESTIONS,
  createEarMachine,
  dealQuestions,
  earKind,
  earMachine,
  earPool,
  makeQuestion,
  step,
  type EarName,
  type Effect,
  type Event,
  type Question,
  type State,
} from './ear';
import { getLesson } from '../content/path';
import { createRunner } from './runner';

/** A small deterministic generator (mulberry32). */
function seeded(
  seed: number,
): () => number {
  let a =
    seed >>>
    0;
  return () => {
    a =
      (a +
        0x6d2b79f5) >>>
      0;
    let t =
      a;
    t =
      Math.imul(
        t ^
          (t >>>
            15),
        t |
          1,
      );
    t ^=
      t +
      Math.imul(
        t ^
          (t >>>
            7),
        t |
          61,
      );
    return (
      ((t ^
        (t >>>
          14)) >>>
        0) /
      4294967296
    );
  };
}

const question =
  (
    answer: IntervalName,
    root = 60,
  ): Question => ({
    kind: 'interval',
    notes:
      [
        root,
        root +
          (answer ===
          'fifth'
            ? 7
            : answer ===
                'third'
              ? 4
              : 2),
      ],
    answer,
  });
const POOL: IntervalName[] =
  [
    'second',
    'third',
    'fifth',
  ];
const ten: Question[] =
  Array.from(
    {
      length: 10,
    },
    (
      _,
      i,
    ) =>
      question(
        POOL[
          i %
            3
        ],
      ),
  );

const answer =
  (
    name: EarName,
  ): Event => ({
    type: 'answer',
    answer:
      {
        name,
      },
  });
const played =
  (
    index: number,
  ): Event => ({
    type: 'played',
    index,
  });
const next: Event =
  {
    type: 'next',
  };
const replay: Event =
  {
    type: 'replay',
  };
const answered =
  (
    outcome:
      | 'saved'
      | 'failed'
      | 'unauthorized'
      | 'invalid',
    attempt = 1,
  ): Event => ({
    type: 'answered',
    attempt,
    outcome,
  });

/** Hear and answer every question, right for the first `right`. Returns the last step. */
function play(
  right: number,
): {
  state: State;
  effects: Effect[];
} {
  let state =
    earMachine.initial(
      ten,
    );
  let effects: Effect[] =
    [];
  for (
    let i = 0;
    i <
    ten.length;
    i++
  ) {
    state =
      step(
        state,
        played(
          i,
        ),
      ).state;
    state =
      step(
        state,
        answer(
          i <
            right
            ? ten[
                i
              ]
                .answer
            : ('unison' as IntervalName),
        ),
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
  return {
    state,
    effects,
  };
}

describe('makeQuestion', () => {
  it('is deterministic for a seeded rand', () => {
    const a =
      makeQuestion(
        'interval',
        POOL,
        seeded(
          7,
        ),
      );
    const b =
      makeQuestion(
        'interval',
        POOL,
        seeded(
          7,
        ),
      );
    expect(
      a,
    ).toEqual(
      b,
    );
  });
  it('asks an interval of the pool, ascending, that intervalOf names back', () => {
    const rand =
      seeded(
        1,
      );
    for (
      let i = 0;
      i <
      300;
      i++
    ) {
      const q =
        makeQuestion(
          'interval',
          POOL,
          rand,
        );
      expect(
        POOL,
      ).toContain(
        q.answer,
      );
      expect(
        q
          .notes[1],
      ).toBeGreaterThan(
        q
          .notes[0],
      );
      expect(
        intervalOf(
          q
            .notes[0],
          q
            .notes[1],
        ),
      ).toBe(
        q.answer,
      );
    }
  });
  it('keeps the root in C3 to C5 and both notes in C2 to C6', () => {
    const rand =
      seeded(
        2,
      );
    for (
      let i = 0;
      i <
      500;
      i++
    ) {
      const q =
        makeQuestion(
          'interval',
          [
            'second',
            'third',
            'fifth',
            'octave',
          ],
          rand,
        );
      expect(
        q
          .notes[0],
      ).toBeGreaterThanOrEqual(
        48,
      );
      expect(
        q
          .notes[0],
      ).toBeLessThanOrEqual(
        72,
      );
      expect(
        q
          .notes[0],
      ).toBeGreaterThanOrEqual(
        36,
      );
      expect(
        q
          .notes[1],
      ).toBeLessThanOrEqual(
        84,
      );
    }
  });
  it('reaches both ends of the root range with the extreme values of rand', () => {
    expect(
      makeQuestion(
        'interval',
        [
          'octave',
        ],
        () =>
          0,
      )
        .notes[0],
    ).toBe(
      48,
    );
    expect(
      makeQuestion(
        'interval',
        [
          'octave',
        ],
        () =>
          0.999999,
      )
        .notes[0],
    ).toBe(
      72,
    );
    expect(
      makeQuestion(
        'interval',
        [
          'octave',
        ],
        () =>
          1,
      )
        .notes[0],
    ).toBe(
      72,
    );
  });
  it('treats a rand that is not a number as 0', () => {
    expect(
      makeQuestion(
        'interval',
        [
          'fifth',
        ],
        () =>
          Number.NaN,
      )
        .notes,
    ).toEqual(
      [
        48,
        55,
      ],
    );
  });
  it('uses a given root, kept inside C2 to C6 with room for the interval', () => {
    expect(
      makeQuestion(
        'interval',
        [
          'fifth',
        ],
        seeded(
          3,
        ),
        62,
      )
        .notes,
    ).toEqual(
      [
        62,
        69,
      ],
    );
    expect(
      makeQuestion(
        'interval',
        [
          'octave',
        ],
        seeded(
          3,
        ),
        100,
      )
        .notes,
    ).toEqual(
      [
        72,
        84,
      ],
    );
    expect(
      makeQuestion(
        'interval',
        [
          'octave',
        ],
        seeded(
          3,
        ),
        0,
      )
        .notes,
    ).toEqual(
      [
        36,
        48,
      ],
    );
  });
  it('picks either size of a third', () => {
    const sizes =
      new Set<number>();
    const rand =
      seeded(
        5,
      );
    for (
      let i = 0;
      i <
      100;
      i++
    ) {
      const q =
        makeQuestion(
          'interval',
          [
            'third',
          ],
          rand,
        );
      sizes.add(
        q
          .notes[1] -
          q
            .notes[0],
      );
    }
    expect(
      [
        ...sizes,
      ].sort(),
    ).toEqual(
      [
        3,
        4,
      ],
    );
  });
  it('throws on an empty pool', () => {
    expect(
      () =>
        makeQuestion(
          'interval',
          [],
          seeded(
            1,
          ),
        ),
    ).toThrow(
      RangeError,
    );
  });
});

describe('dealQuestions', () => {
  it('deals the count asked, each name about as often, and is deterministic', () => {
    const qs =
      dealQuestions(
        'interval',
        [
          'second',
          'third',
        ],
        10,
        seeded(
          9,
        ),
      );
    expect(
      qs,
    ).toHaveLength(
      10,
    );
    const seconds =
      qs.filter(
        (
          q,
        ) =>
          q.answer ===
          'second',
      ).length;
    expect(
      seconds,
    ).toBe(
      5,
    );
    expect(
      dealQuestions(
        'interval',
        [
          'second',
          'third',
        ],
        10,
        seeded(
          9,
        ),
      ),
    ).toEqual(
      qs,
    );
  });
  it('does not alternate a two-name pool in a fixed order', () => {
    // A pattern the learner could answer without listening would be a bug.
    const orders =
      new Set<string>();
    for (
      let seed = 1;
      seed <=
      20;
      seed++
    ) {
      orders.add(
        dealQuestions(
          'interval',
          [
            'second',
            'third',
          ],
          10,
          seeded(
            seed,
          ),
        )
          .map(
            (
              q,
            ) =>
              q
                .answer[0],
          )
          .join(
            '',
          ),
      );
    }
    expect(
      orders.size,
    ).toBeGreaterThan(
      10,
    );
  });
  it('is empty for a count of 0 or less', () => {
    expect(
      dealQuestions(
        'interval',
        POOL,
        0,
        seeded(
          1,
        ),
      ),
    ).toEqual(
      [],
    );
    expect(
      dealQuestions(
        'interval',
        POOL,
        Number.NaN,
        seeded(
          1,
        ),
      ),
    ).toEqual(
      [],
    );
  });
});

describe('earPool and earKind', () => {
  it("take a lesson's pool field and mode, from the path", () => {
    expect(
      earPool(
        getLesson(
          'ear-second-third',
        ),
      ),
    ).toEqual(
      [
        'second',
        'third',
      ],
    );
    expect(
      earPool(
        getLesson(
          'ear-fifth-octave',
        ),
      ),
    ).toEqual(
      [
        'third',
        'fifth',
        'octave',
      ],
    );
    expect(
      earPool(
        getLesson(
          'ear-major-minor',
        ),
      ),
    ).toEqual(
      [
        'major',
        'minor',
      ],
    );
    expect(
      earKind(
        getLesson(
          'ear-second-third',
        ),
      ),
    ).toBe(
      'interval',
    );
    expect(
      earKind(
        getLesson(
          'ear-fifth-octave',
        ),
      ),
    ).toBe(
      'interval',
    );
    expect(
      earKind(
        getLesson(
          'ear-major-minor',
        ),
      ),
    ).toBe(
      'chord',
    );
  });
  it('fall back safely for a lesson that is missing or has no pool', () => {
    expect(
      earKind(
        undefined,
      ),
    ).toBe(
      'interval',
    );
    expect(
      earPool(
        undefined,
      ),
    ).toEqual(
      [
        'second',
        'third',
      ],
    );
    expect(
      earPool(
        {
          mode: 'ear-chord',
        },
      ),
    ).toEqual(
      [
        'major',
        'minor',
      ],
    );
    expect(
      earPool(
        {
          mode: 'ear-interval',
          pool: [],
        },
      ),
    ).toEqual(
      [
        'second',
        'third',
      ],
    );
  });
  it('drops a name that is not one of its kind', () => {
    expect(
      earPool(
        {
          mode: 'ear-chord',
          pool: [
            'major',
            'fifth',
          ],
        },
      ),
    ).toEqual(
      [
        'major',
      ],
    );
    expect(
      earPool(
        {
          mode: 'ear-interval',
          pool: [
            'fifth',
            'minor',
          ],
        },
      ),
    ).toEqual(
      [
        'fifth',
      ],
    );
  });
});

describe('dealQuestions: the remainder', () => {
  const NAMES: IntervalName[] =
    [
      'second',
      'third',
      'fifth',
    ];
  const counts =
    (
      seed: number,
      count = 10,
    ) => {
      const c =
        {
          second: 0,
          third: 0,
          fifth: 0,
        };
      for (const q of dealQuestions(
        'interval',
        NAMES,
        count,
        seeded(
          seed,
        ),
      )) {
        c[
          q.answer as keyof typeof c
        ]++;
      }
      return c;
    };
  it('keeps a three-name pool even to within one over many seeds', () => {
    for (
      let seed = 1;
      seed <=
      300;
      seed++
    ) {
      const c =
        Object.values(
          counts(
            seed,
          ),
        );
      expect(
        Math.max(
          ...c,
        ) -
          Math.min(
            ...c,
          ),
        `seed ${seed}`,
      ).toBeLessThanOrEqual(
        1,
      );
      expect(
        c.reduce(
          (
            a,
            b,
          ) =>
            a +
            b,
          0,
        ),
      ).toBe(
        10,
      );
    }
  });
  it('does not always give the extra question to the first name', () => {
    const extra =
      new Set<string>();
    for (
      let seed = 1;
      seed <=
      300;
      seed++
    ) {
      const c =
        counts(
          seed,
        );
      for (const name of NAMES)
        if (
          c[
            name as keyof typeof c
          ] ===
          4
        )
          extra.add(
            name,
          );
    }
    expect(
      [
        ...extra,
      ].sort(),
    ).toEqual(
      [
        'fifth',
        'second',
        'third',
      ],
    );
  });
  it('shares two extras between two names of a four-name pool', () => {
    const names: ChordQuality[] =
      [
        'major',
        'minor',
        'diminished',
        'augmented',
      ];
    const got =
      new Set<string>();
    for (
      let seed = 1;
      seed <=
      200;
      seed++
    ) {
      const qs =
        dealQuestions(
          'chord',
          names,
          10,
          seeded(
            seed,
          ),
        );
      const c =
        names.map(
          (
            n,
          ) =>
            qs.filter(
              (
                q,
              ) =>
                q.answer ===
                n,
            )
              .length,
        );
      expect(
        Math.max(
          ...c,
        ) -
          Math.min(
            ...c,
          ),
      ).toBeLessThanOrEqual(
        1,
      );
      got.add(
        c.join(),
      );
    }
    expect(
      got.size,
    ).toBeGreaterThan(
      2,
    );
  });
});

describe("chord questions (the same machine and generator, kind 'chord')", () => {
  const QUALITIES: ChordQuality[] =
    [
      'major',
      'minor',
    ];

  it('asks a root-position triad of the pool that chordQuality names back', () => {
    const rand =
      seeded(
        11,
      );
    for (
      let i = 0;
      i <
      300;
      i++
    ) {
      const q =
        makeQuestion(
          'chord',
          QUALITIES,
          rand,
        );
      expect(
        q.kind,
      ).toBe(
        'chord',
      );
      expect(
        q.notes,
      ).toHaveLength(
        3,
      );
      expect(
        QUALITIES,
      ).toContain(
        q.answer,
      );
      expect(
        chordQuality(
          q.notes,
        ),
      ).toBe(
        q.answer,
      );
    }
  });
  it('keeps the root in C3 to C5 and every note in C2 to C6, whatever the quality', () => {
    const rand =
      seeded(
        12,
      );
    for (
      let i = 0;
      i <
      500;
      i++
    ) {
      const q =
        makeQuestion(
          'chord',
          [
            'major',
            'minor',
            'diminished',
            'augmented',
          ],
          rand,
        );
      expect(
        q
          .notes[0],
      ).toBeGreaterThanOrEqual(
        48,
      );
      expect(
        q
          .notes[0],
      ).toBeLessThanOrEqual(
        72,
      );
      expect(
        q
          .notes[2],
      ).toBeLessThanOrEqual(
        84,
      );
    }
    expect(
      makeQuestion(
        'chord',
        [
          'augmented',
        ],
        () =>
          1,
        100,
      )
        .notes,
    ).toEqual(
      [
        76,
        80,
        84,
      ],
    );
  });
  it('is deterministic for a seeded rand, and deals each quality equally', () => {
    expect(
      makeQuestion(
        'chord',
        QUALITIES,
        seeded(
          4,
        ),
      ),
    ).toEqual(
      makeQuestion(
        'chord',
        QUALITIES,
        seeded(
          4,
        ),
      ),
    );
    const qs =
      dealQuestions(
        'chord',
        QUALITIES,
        10,
        seeded(
          6,
        ),
      );
    expect(
      qs.filter(
        (
          q,
        ) =>
          q.answer ===
          'major',
      ),
    ).toHaveLength(
      5,
    );
    expect(
      qs.every(
        (
          q,
        ) =>
          q.kind ===
          'chord',
      ),
    ).toBe(
      true,
    );
  });
  it('does not mix the kinds: an interval name is not a chord quality', () => {
    expect(
      () =>
        makeQuestion(
          'chord',
          [
            'fifth',
          ] as never,
          seeded(
            1,
          ),
        ),
    ).toThrow(
      RangeError,
    );
    expect(
      () =>
        makeQuestion(
          'interval',
          [
            'major',
          ] as never,
          seeded(
            1,
          ),
        ),
    ).toThrow(
      RangeError,
    );
  });
  it('the machine runs a chord session: hear, answer by quality, replay plays all three notes', () => {
    const qs =
      dealQuestions(
        'chord',
        QUALITIES,
        10,
        seeded(
          8,
        ),
      );
    let s =
      earMachine.initial(
        qs,
      );
    expect(
      step(
        s,
        {
          type: 'answer',
          answer:
            {
              name: qs[0]
                .answer,
            },
        },
      )
        .state,
    ).toBe(
      s,
    );
    const r =
      step(
        s,
        replay,
      );
    expect(
      r.effects,
    ).toEqual(
      [
        {
          type: 'play',
          index: 0,
          kind: 'chord',
          notes:
            qs[0]
              .notes,
        },
      ],
    );
    s =
      step(
        s,
        played(
          0,
        ),
      ).state;
    const right =
      step(
        s,
        {
          type: 'answer',
          answer:
            {
              name: qs[0]
                .answer,
            },
        },
      );
    expect(
      right.state,
    ).toMatchObject(
      {
        kind: 'feedback',
        right: true,
        correct: 1,
      },
    );
    const other =
      qs[0]
        .answer ===
      'major'
        ? 'minor'
        : 'major';
    expect(
      step(
        s,
        {
          type: 'answer',
          answer:
            {
              name: other,
            },
        },
      )
        .state,
    ).toMatchObject(
      {
        kind: 'feedback',
        right: false,
      },
    );
  });
});

describe('ear machine: hearing and answering', () => {
  it('starts asking the first question, not yet heard', () => {
    const s =
      earMachine.initial(
        ten,
      );
    expect(
      s,
    ).toEqual(
      {
        kind: 'asking',
        cards:
          ten,
        index: 0,
        correct: 0,
        heard: false,
      },
    );
    expect(
      createEarMachine(
        ten,
      )
        .initial,
    ).toEqual(
      s,
    );
    expect(
      EAR_QUESTIONS,
    ).toBe(
      10,
    );
  });

  it('ignores an answer to a question the learner has not heard', () => {
    const s =
      earMachine.initial(
        ten,
      );
    const r =
      step(
        s,
        answer(
          'second',
        ),
      );
    expect(
      r.state,
    ).toBe(
      s,
    );
    expect(
      r.effects,
    ).toEqual(
      [],
    );
  });

  it('accepts the answer once the sound has played for this question', () => {
    const heard =
      step(
        earMachine.initial(
          ten,
        ),
        played(
          0,
        ),
      ).state;
    expect(
      heard,
    ).toMatchObject(
      {
        kind: 'asking',
        heard: true,
      },
    );
    const r =
      step(
        heard,
        answer(
          'second',
        ),
      );
    expect(
      r.state,
    ).toMatchObject(
      {
        kind: 'feedback',
        right: true,
        correct: 1,
      },
    );
  });

  it('ignores a "played" for another question or one already heard', () => {
    const s =
      earMachine.initial(
        ten,
      );
    expect(
      step(
        s,
        played(
          3,
        ),
      )
        .state,
    ).toBe(
      s,
    );
    const heard =
      step(
        s,
        played(
          0,
        ),
      ).state;
    expect(
      step(
        heard,
        played(
          0,
        ),
      )
        .state,
    ).toBe(
      heard,
    );
  });

  it('a wrong answer shows the right one and counts nothing', () => {
    const heard =
      step(
        earMachine.initial(
          ten,
        ),
        played(
          0,
        ),
      ).state;
    const {
      state,
    } =
      step(
        heard,
        answer(
          'fifth',
        ),
      );
    expect(
      state,
    ).toMatchObject(
      {
        kind: 'feedback',
        right: false,
        correct: 0,
        answer:
          {
            name: 'fifth',
          },
      },
    );
    if (
      state.kind !==
      'feedback'
    )
      throw new Error(
        'feedback expected',
      );
    expect(
      state
        .cards[
        state
          .index
      ]
        .answer,
    ).toBe(
      'second',
    );
  });

  it('two answers in a row count once', () => {
    let s =
      step(
        earMachine.initial(
          ten,
        ),
        played(
          0,
        ),
      ).state;
    s =
      step(
        s,
        answer(
          'second',
        ),
      ).state;
    const again =
      step(
        s,
        answer(
          'second',
        ),
      );
    expect(
      again.state,
    ).toBe(
      s,
    );
    expect(
      again.state,
    ).toMatchObject(
      {
        correct: 1,
      },
    );
  });

  it('the next question is asked unheard, and needs its own sound', () => {
    let s =
      step(
        earMachine.initial(
          ten,
        ),
        played(
          0,
        ),
      ).state;
    s =
      step(
        s,
        answer(
          'second',
        ),
      ).state;
    s =
      step(
        s,
        next,
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'asking',
        index: 1,
        heard: false,
      },
    );
    expect(
      step(
        s,
        answer(
          'third',
        ),
      )
        .state,
    ).toBe(
      s,
    );
  });
});

describe('ear machine: replay', () => {
  it('plays the current question again and changes nothing', () => {
    const s =
      step(
        earMachine.initial(
          ten,
        ),
        played(
          0,
        ),
      ).state;
    const r =
      step(
        s,
        replay,
      );
    expect(
      r.state,
    ).toBe(
      s,
    );
    expect(
      r.effects,
    ).toEqual(
      [
        {
          type: 'play',
          index: 0,
          kind: 'interval',
          notes:
            ten[0]
              .notes,
        },
      ],
    );
  });

  it('plays the question before it has been heard (that is how it is heard)', () => {
    const s =
      earMachine.initial(
        ten,
      );
    const r =
      step(
        s,
        replay,
      );
    expect(
      r.state,
    ).toBe(
      s,
    );
    expect(
      r.effects,
    ).toHaveLength(
      1,
    );
  });

  it('is unlimited and never changes the score', () => {
    let s =
      step(
        earMachine.initial(
          ten,
        ),
        played(
          0,
        ),
      ).state;
    for (
      let i = 0;
      i <
      25;
      i++
    )
      s =
        step(
          s,
          replay,
        ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'asking',
        index: 0,
        correct: 0,
        heard: true,
      },
    );
  });

  it('plays the answered question again from the feedback, still changing nothing', () => {
    let s =
      step(
        earMachine.initial(
          ten,
        ),
        played(
          0,
        ),
      ).state;
    s =
      step(
        s,
        answer(
          'third',
        ),
      ).state;
    const r =
      step(
        s,
        replay,
      );
    expect(
      r.state,
    ).toBe(
      s,
    );
    expect(
      r.effects,
    ).toEqual(
      [
        {
          type: 'play',
          index: 0,
          kind: 'interval',
          notes:
            ten[0]
              .notes,
        },
      ],
    );
  });

  it('does nothing once the session is over', () => {
    const {
      state,
    } =
      play(
        10,
      );
    expect(
      step(
        state,
        replay,
      ),
    ).toEqual(
      {
        state,
        effects:
          [],
      },
    );
  });
});

describe('ear machine: a stale played', () => {
  it('is ignored for another question, a later one, and once the question is answered or the session over', () => {
    const start =
      earMachine.initial(
        ten,
      );
    expect(
      step(
        start,
        played(
          1,
        ),
      )
        .state,
    ).toBe(
      start,
    );
    expect(
      step(
        start,
        played(
          -1,
        ),
      )
        .state,
    ).toBe(
      start,
    );
    const heard =
      step(
        start,
        played(
          0,
        ),
      ).state;
    const answered1 =
      step(
        heard,
        answer(
          ten[0]
            .answer,
        ),
      ).state;
    expect(
      step(
        answered1,
        played(
          0,
        ),
      )
        .state,
    ).toBe(
      answered1,
    );
    const {
      state:
        over,
    } =
      play(
        10,
      );
    expect(
      step(
        over,
        played(
          0,
        ),
      )
        .state,
    ).toBe(
      over,
    );
    const failed =
      step(
        over,
        answered(
          'failed',
        ),
      ).state;
    const retried =
      step(
        failed,
        {
          type: 'retry',
        },
      ).state;
    expect(
      step(
        retried,
        played(
          9,
        ),
      )
        .state,
    ).toBe(
      retried,
    );
  });
  it('a question reached by Next starts unheard, so an old played cannot open it', () => {
    let s =
      step(
        earMachine.initial(
          ten,
        ),
        played(
          0,
        ),
      ).state;
    s =
      step(
        s,
        answer(
          ten[0]
            .answer,
        ),
      ).state;
    s =
      step(
        s,
        next,
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'asking',
        index: 1,
        heard: false,
      },
    );
    expect(
      step(
        s,
        played(
          0,
        ),
      )
        .state,
    ).toBe(
      s,
    );
    expect(
      step(
        s,
        answer(
          ten[1]
            .answer,
        ),
      )
        .state,
    ).toBe(
      s,
    );
  });
});

describe('ear machine: the result', () => {
  it('saves once past the last question, with the score and stars', () => {
    const {
      state,
      effects,
    } =
      play(
        7,
      );
    expect(
      state,
    ).toEqual(
      {
        kind: 'saving',
        correct: 7,
        total: 10,
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
          score: 70,
          stars: 1,
        },
      ],
    );
  });

  it('saved, signed out, failed then Retry with attempt 2', () => {
    const {
      state,
    } =
      play(
        10,
      );
    expect(
      step(
        state,
        answered(
          'saved',
        ),
      )
        .state,
    ).toEqual(
      {
        kind: 'saved',
        correct: 10,
        total: 10,
        stars: 3,
      },
    );
    expect(
      step(
        state,
        answered(
          'unauthorized',
        ),
      )
        .state
        .kind,
    ).toBe(
      'signed-out',
    );
    const failed =
      step(
        state,
        answered(
          'failed',
        ),
      ).state;
    expect(
      failed.kind,
    ).toBe(
      'failed',
    );
    const retried =
      step(
        failed,
        {
          type: 'retry',
        },
      );
    expect(
      retried.state,
    ).toMatchObject(
      {
        kind: 'saving',
        attempt: 2,
      },
    );
    expect(
      retried.effects,
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

  it('ignores a stale save answer', () => {
    const {
      state,
    } =
      play(
        10,
      );
    const failed =
      step(
        state,
        answered(
          'failed',
        ),
      ).state;
    const retried =
      step(
        failed,
        {
          type: 'retry',
        },
      ).state;
    expect(
      step(
        retried,
        answered(
          'saved',
          1,
        ),
      )
        .state,
    ).toBe(
      retried,
    );
  });

  it('runs on the shared runner: a double tap in one tick answers once', () => {
    const run =
      createRunner(
        createEarMachine(
          ten,
        ),
      );
    run.send(
      {
        type: 'played',
        index: 0,
      },
    );
    run.send(
      answer(
        'second',
      ),
    );
    run.send(
      answer(
        'second',
      ),
    );
    expect(
      run.get(),
    ).toMatchObject(
      {
        kind: 'feedback',
        correct: 1,
      },
    );
  });
});
