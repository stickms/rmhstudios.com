/**
 * The sentences a wrong Sprint answer and a Learning run say, under a real i18next instance with no
 * catalog (every string is its `t()` default), as `sprint-text.test.ts` does.
 */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  createInstance,
  type TFunction,
} from 'i18next';
import type { SprintPrompt } from '@/lib/rmhmusic/learn/sprint/generate';
import {
  initial,
  step,
  type SprintState,
} from '@/lib/rmhmusic/learn/sprint/machine';
import { sprintMiss } from '@/lib/rmhmusic/learn/sprint/miss';
import {
  feedbackParts,
  missSentences,
  saveSentence,
} from './sprint-text';

const i18n =
  createInstance();
void i18n.init(
  {
    lng: 'en',
    fallbackLng:
      'en',
    resources:
      {},
    initAsync: false,
    interpolation:
      {
        escapeValue: false,
      },
  },
);
const t =
  i18n.t.bind(
    i18n,
  ) as unknown as TFunction<'c-rmhmusic'>;

const n =
  (
    written: number,
    accidental:
      | -1
      | 0
      | 1 = 0,
  ) => ({
    written,
    accidental,
  });
const C4: SprintPrompt =
  {
    level:
      'note',
    kind: 'note',
    clef: 'treble',
    notes:
      [
        n(
          60,
        ),
      ],
  };

/** The feedback state after `midi` is played to a first prompt (`learning`: Learning mode). */
function missed(
  p: SprintPrompt,
  midi: number[],
  learning: boolean,
) {
  let s: SprintState =
    initial(
      {
        prompts:
          [
            p,
          ],
        mode: 'freeplay',
        scored:
          !learning,
        mic: false,
        learning,
      },
    );
  for (const e of [
    {
      type: 'start',
    },
    {
      type: 'tick',
    },
    {
      type: 'tick',
    },
    {
      type: 'tick',
    },
  ] as const)
    s =
      step(
        s,
        e,
      ).state;
  s =
    step(
      s,
      {
        type: 'shown',
        at: 0,
      },
    ).state;
  midi.forEach(
    (
      m,
      i,
    ) => {
      s =
        step(
          s,
          {
            type: 'note',
            note: {
              type: 'on',
              midi: m,
              time:
                500 +
                i *
                  10,
              source:
                'midi',
            },
          },
        ).state;
    },
  );
  s =
    step(
      s,
      {
        type: 'close',
        at: 5000,
      },
    ).state;
  if (
    s.kind !==
    'feedback'
  )
    throw new Error(
      `feedback expected, got ${s.kind}`,
    );
  const view =
    sprintMiss(
      {
        prompt:
          p,
        targets:
          s
            .targets[0] ??
          [],
        played:
          s.played,
        instrument:
          'piano',
        exact: true,
      },
    );
  return {
    s,
    facts:
      view?.facts ??
      null,
  };
}

describe('missSentences', () => {
  it('says what was played against what was written, and how far off', () => {
    const {
      facts,
    } =
      missed(
        C4,
        [
          64,
        ],
        false,
      );
    expect(
      missSentences(
        t,
        'en',
        facts!,
      ),
    ).toEqual(
      [
        'You played E4, not C4.',
        '2 steps above the right note.',
      ],
    );
    expect(
      missSentences(
        t,
        'en',
        missed(
          C4,
          [
            62,
          ],
          false,
        )
          .facts!,
      ),
    ).toEqual(
      [
        'You played D4, not C4.',
        'One step above the right note.',
      ],
    );
    expect(
      missSentences(
        t,
        'en',
        missed(
          C4,
          [
            57,
          ],
          false,
        )
          .facts!,
      )[1],
    ).toBe(
      '2 steps below the right note.',
    );
  });

  it('says an octave, and a wrong accidental, in their own words', () => {
    expect(
      missSentences(
        t,
        'en',
        missed(
          C4,
          [
            72,
          ],
          false,
        )
          .facts!,
      )[1],
    ).toBe(
      'An octave above the right note.',
    );
    expect(
      missSentences(
        t,
        'en',
        missed(
          C4,
          [
            48,
          ],
          false,
        )
          .facts!,
      )[1],
    ).toBe(
      'An octave below the right note.',
    );
    expect(
      missSentences(
        t,
        'en',
        missed(
          C4,
          [
            61,
          ],
          false,
        )
          .facts!,
      )[1],
    ).toBe(
      'Right line or space, wrong accidental.',
    );
  });

  it('lists a chord miss as the notes played against the chord', () => {
    const cmaj: SprintPrompt =
      {
        level:
          'triad',
        kind: 'chord',
        clef: 'treble',
        notes:
          [
            n(
              60,
            ),
            n(
              64,
            ),
            n(
              67,
            ),
          ],
      };
    const {
      facts,
    } =
      missed(
        cmaj,
        [
          60,
          63,
          67,
        ],
        false,
      );
    // `noteList` isolates each name for right-to-left pages; the marks are not part of what is said.
    const say =
      missSentences(
        t,
        'en',
        facts!,
      ).map(
        (
          x,
        ) =>
          x.replace(
            /[\u2066-\u2069]/g,
            '',
          ),
      );
    expect(
      say,
    ).toEqual(
      [
        'You played C, D♯, and G; the chord is C, E, and G.',
      ],
    );
  });
});

describe('feedbackParts', () => {
  it('in Test mode tells the miss and nothing about retrying', () => {
    const {
      s,
      facts,
    } =
      missed(
        C4,
        [
          64,
        ],
        false,
      );
    expect(
      feedbackParts(
        t,
        'en',
        s as never,
        'C',
        'C4',
        facts,
      ),
    ).toEqual(
      [
        'You played E4, not C4.',
        '2 steps above the right note.',
      ],
    );
  });

  it('in Learning mode adds that the prompt comes back', () => {
    const {
      s,
      facts,
    } =
      missed(
        C4,
        [
          64,
        ],
        true,
      );
    expect(
      feedbackParts(
        t,
        'en',
        s as never,
        'C',
        'C4',
        facts,
      ),
    ).toEqual(
      [
        'You played E4, not C4.',
        '2 steps above the right note.',
        'Try it again.',
      ],
    );
  });

  it('keeps the octave sentence for a right letter in the wrong octave', () => {
    const {
      s,
      facts,
    } =
      missed(
        C4,
        [
          72,
        ],
        false,
      );
    expect(
      feedbackParts(
        t,
        'en',
        s as never,
        'C',
        'C4',
        facts,
      ),
    ).toEqual(
      [
        'Right letter, wrong octave: it was C4.',
      ],
    );
  });

  it('says a retry that finally went right was right this time, not that it was fast', () => {
    const {
      s,
    } =
      missed(
        C4,
        [
          64,
        ],
        true,
      );
    if (
      s.kind !==
      'feedback'
    )
      throw new Error(
        'feedback expected',
      );
    const retried =
      {
        ...s,
        right:
          true as const,
        misses: 1,
      };
    expect(
      feedbackParts(
        t,
        'en',
        retried,
        'C',
        'C4',
        null,
      ),
    ).toEqual(
      [
        'Right this time.',
      ],
    );
  });

  it('falls back to the plain sentence when there is nothing to compare', () => {
    const {
      s,
    } =
      missed(
        C4,
        [
          64,
        ],
        false,
      );
    expect(
      feedbackParts(
        t,
        'en',
        s as never,
        'C',
        'C4',
        null,
      ),
    ).toEqual(
      [
        'Not this time: it was C.',
      ],
    );
  });
});

describe('a Learning run ends with its own line', () => {
  it('says the first tries are scored, no best is kept, and what was practised is remembered', () => {
    let s: SprintState =
      initial(
        {
          prompts:
            [
              C4,
            ],
          mode: 'freeplay',
          scored: false,
          mic: false,
          learning: true,
        },
      );
    for (const e of [
      {
        type: 'start',
      },
      {
        type: 'tick',
      },
      {
        type: 'tick',
      },
      {
        type: 'tick',
      },
    ] as const)
      s =
        step(
          s,
          e,
        ).state;
    s =
      step(
        s,
        {
          type: 'shown',
          at: 0,
        },
      ).state;
    s =
      step(
        s,
        {
          type: 'note',
          note: {
            type: 'on',
            midi: 60,
            time: 400,
            source:
              'midi',
          },
        },
      ).state;
    s =
      step(
        s,
        {
          type: 'next',
        },
      ).state;
    if (
      s.kind !==
      'complete'
    )
      throw new Error(
        `complete expected, got ${s.kind}`,
      );
    expect(
      s.why,
    ).toBe(
      'learning',
    );
    expect(
      saveSentence(
        t,
        s,
      ),
    ).toBe(
      'Learning run: your first tries are scored, but no best is kept. What you practised is remembered.',
    );
  });
});
