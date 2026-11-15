/**
 * The sight reading game's sentences, under a real i18next instance with no catalog (every string
 * is its `t()` default, plurals included), as `StaffCard.test.tsx` does.
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
import { mulberry32 } from '@/lib/core/rng';
import { makeRun } from '@/lib/rmhmusic/learn/sprint/generate';
import { SPRINT_LEVELS } from '@/lib/rmhmusic/learn/sprint/levels';
import {
  initial,
  step,
} from '@/lib/rmhmusic/learn/sprint/machine';
import {
  askHint,
  feedbackLine,
  promptLabel,
  resultSentence,
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

const summary =
  (
    over: Partial<
      Parameters<
        typeof resultSentence
      >[2]
    > = {},
  ) => ({
    score: 80,
    stars:
      2 as const,
    correct: 4,
    played: 5,
    skipped: 0,
    avgMs: 1500,
    ...over,
  });

describe('sprint sentences', () => {
  it('never names the notes while a prompt is asked; names them once answered', () => {
    const NOTES =
      'NOTE-NAMES';
    for (const level of SPRINT_LEVELS) {
      for (const p of makeRun(
        level.id,
        20,
        mulberry32(
          1,
        ),
      )) {
        const asked =
          promptLabel(
            t,
            p,
            false,
            NOTES,
          );
        expect(
          asked,
        ).not.toContain(
          NOTES,
        );
        expect(
          asked,
        ).toMatch(
          /staff$/,
        );
        expect(
          promptLabel(
            t,
            p,
            true,
            NOTES,
          ),
        ).toContain(
          NOTES,
        );
      }
    }
  });

  it('says whether the octave counts on this input', () => {
    const [
      p,
    ] =
      makeRun(
        'note',
        1,
        mulberry32(
          1,
        ),
      );
    const [
      bar,
    ] =
      makeRun(
        'bar',
        1,
        mulberry32(
          1,
        ),
      );
    expect(
      askHint(
        t,
        p!,
        'midi',
        0,
      ),
    ).toBe(
      'Play the note at the written pitch.',
    );
    expect(
      askHint(
        t,
        p!,
        'keys',
        0,
      ),
    ).toBe(
      'Play the note: any octave counts.',
    );
    expect(
      askHint(
        t,
        p!,
        'screen',
        0,
      ),
    ).toBe(
      'Play the note: any octave counts.',
    );
    expect(
      askHint(
        t,
        bar!,
        'mic',
        0,
      ),
    ).toBe(
      'Play the notes in order: any octave counts.',
    );
  });

  it('wrong by the octave only says so, with the octave', () => {
    let s =
      initial(
        {
          prompts:
            makeRun(
              'note',
              1,
              mulberry32(
                1,
              ),
            ),
          mode: 'freeplay',
          scored: true,
          mic: false,
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
    const want =
      s
        .targets[0]![0]!;
    s =
      step(
        s,
        {
          type: 'note',
          note: {
            type: 'on',
            midi:
              want +
              12,
            time: 100,
            source:
              'midi',
          },
        },
      ).state;
    if (
      s.kind !==
      'feedback'
    )
      throw new Error(
        'expected feedback',
      );
    expect(
      feedbackLine(
        t,
        'en',
        s,
        'C',
        'C4',
      ),
    ).toBe(
      'Right letter, wrong octave: it was C4.',
    );
  });

  it('one sentence per result case, with plurals and no "0 prompts"', () => {
    expect(
      resultSentence(
        t,
        'en',
        summary(),
      ),
    ).toBe(
      'You scored 80: 4 of 5 prompts were right, in 1.5 s on average.',
    );
    expect(
      resultSentence(
        t,
        'en',
        summary(
          {
            played: 1,
            correct: 1,
            score: 100,
            avgMs: 900,
          },
        ),
      ),
    ).toBe(
      'You scored 100: the one prompt was right, in 0.9 s.',
    );
    expect(
      resultSentence(
        t,
        'en',
        summary(
          {
            correct: 0,
            score: 0,
            avgMs:
              null,
          },
        ),
      ),
    ).toBe(
      'You scored 0: none of the 5 prompts was right.',
    );
    expect(
      resultSentence(
        t,
        'en',
        summary(
          {
            skipped: 10,
          },
        ),
      ),
    ).toContain(
      'Chords were skipped for the microphone.',
    );
    const empty =
      resultSentence(
        t,
        'en',
        summary(
          {
            played: 0,
            skipped: 10,
            correct: 0,
            avgMs:
              null,
            score: 0,
          },
        ),
      );
    expect(
      empty,
    ).toBe(
      'No prompts were played, so this run has no score.',
    );
    expect(
      empty,
    ).not.toMatch(
      /\b0 prompts\b/,
    );
  });

  it('says plainly whether the result was kept', () => {
    const base =
      initial(
        {
          prompts:
            [],
          mode: 'daily',
          scored: true,
          mic: false,
        },
      );
    const s =
      summary();
    expect(
      saveSentence(
        t,
        {
          ...base,
          kind: 'complete',
          summary:
            s,
          why: 'unsaved',
        },
      ),
    ).toBe(
      'Not saved: results are not kept yet.',
    );
    expect(
      saveSentence(
        t,
        {
          ...base,
          kind: 'complete',
          summary:
            s,
          why: 'already-scored',
        },
      ),
    ).toContain(
      'another tab or device',
    );
    expect(
      saveSentence(
        t,
        {
          ...base,
          kind: 'complete',
          summary:
            s,
          why: 'empty',
        },
      ),
    ).toBe(
      'Not saved: there was nothing to score.',
    );
    expect(
      saveSentence(
        t,
        {
          ...base,
          kind: 'signed-out',
          summary:
            s,
        },
      ),
    ).toContain(
      'sign in',
    );
  });
});
