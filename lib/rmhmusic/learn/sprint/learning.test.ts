import { describe, expect, it } from 'vitest';
import type { NoteEvent } from '../input/events';
import type { SprintPrompt } from './generate';
import { initial, step, type SprintEvent, type SprintState } from './machine';

const n = (written: number) => ({
  written,
  accidental: 0 as const,
});
const C4: SprintPrompt = {
  level: 'note',
  kind: 'note',
  clef: 'treble',
  notes: [n(60)],
};
const E4: SprintPrompt = {
  level: 'note',
  kind: 'note',
  clef: 'treble',
  notes: [n(64)],
};
const BAR: SprintPrompt = {
  level: 'bar',
  kind: 'bar',
  clef: 'treble',
  notes: [n(60), n(62), n(64), n(65)],
};

const on = (midi: number, time: number): SprintEvent => ({
  type: 'note',
  note: {
    type: 'on',
    midi,
    time,
    source: 'midi' satisfies NoteEvent['source'],
  },
});

function play(
  opts: {
    prompts: SprintPrompt[];
    mode?: 'freeplay' | 'daily';
    scored: boolean;
    learning: boolean;
  },
  events: SprintEvent[],
): {
  state: SprintState;
  effects: string[];
} {
  let state = initial({
    prompts: opts.prompts,
    mode: opts.mode ?? 'freeplay',
    scored: opts.scored,
    mic: false,
    learning: opts.learning,
  });
  const effects: string[] = [];
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
    ...events,
  ] as SprintEvent[]) {
    const r = step(state, e);
    state = r.state;
    effects.push(...r.effects.map((f) => f.type));
  }
  return {
    state,
    effects,
  };
}
/** A prompt drawn at `at` ms. */
const shown = (at: number): SprintEvent => ({
  type: 'shown',
  at,
});

describe('Learning mode', () => {
  it('shows a wrong answer, then asks the same prompt again with its miss remembered', () => {
    const { state } = play(
      {
        prompts: [C4, E4],
        scored: false,
        learning: true,
      },
      [
        shown(0),
        on(62, 900),
        {
          type: 'next',
        },
      ],
    );
    expect(state).toMatchObject({
      kind: 'asking',
      index: 0,
      shownAt: null,
      misses: 1,
    });
  });

  it('scores and times the FIRST attempt only, however many retries follow', () => {
    const { state } = play(
      {
        prompts: [C4],
        scored: false,
        learning: true,
      },
      [
        shown(0),
        on(62, 900), // wrong, 900 ms
        {
          type: 'next',
        },
        shown(10_000),
        on(61, 10_500), // wrong again
        {
          type: 'next',
        },
        shown(20_000),
        on(60, 20_100), // right, 100 ms after being drawn
      ],
    );
    expect(state).toMatchObject({
      kind: 'feedback',
      index: 0,
      right: true,
      misses: 2,
    });
    if (state.kind !== 'feedback') throw new Error('feedback expected');
    expect(state.results).toHaveLength(1);
    expect(state.result).toMatchObject({
      correct: false,
      ms: 900,
      points: 0,
    });
  });

  it('moves on only after the prompt is answered right, and the run summary is the first tries', () => {
    const { state, effects } = play(
      {
        prompts: [C4],
        scored: false,
        learning: true,
      },
      [
        shown(0),
        on(62, 400),
        {
          type: 'next',
        },
        shown(5000),
        on(60, 5200),
        {
          type: 'next',
        },
      ],
    );
    expect(state).toMatchObject({
      kind: 'complete',
      why: 'learning',
      summary: {
        correct: 0,
        played: 1,
        score: 0,
      },
    });
    expect(effects).toEqual(['complete']); // never a save: no best is kept
  });

  it('a right first answer is a normal one and carries on to the next prompt', () => {
    const { state } = play(
      {
        prompts: [C4, E4],
        scored: false,
        learning: true,
      },
      [
        shown(0),
        on(60, 800),
        {
          type: 'next',
        },
      ],
    );
    expect(state).toMatchObject({
      kind: 'asking',
      index: 1,
    });
    expect(
      (
        state as {
          misses?: number;
        }
      ).misses,
    ).toBeUndefined();
  });

  it('restarts a bar from its first note on a retry', () => {
    const { state } = play(
      {
        prompts: [BAR],
        scored: false,
        learning: true,
      },
      [
        shown(0),
        on(60, 300),
        on(65, 600), // wrong second note
        {
          type: 'next',
        },
      ],
    );
    expect(state).toMatchObject({
      kind: 'asking',
      index: 0,
      got: [],
      misses: 1,
    });
  });

  it('ignores the setting for the daily challenge and for a scored run', () => {
    for (const opts of [
      {
        mode: 'daily' as const,
        scored: true,
      },
      {
        mode: 'daily' as const,
        scored: false,
      },
      {
        mode: 'freeplay' as const,
        scored: true,
      },
    ]) {
      const s = initial({
        prompts: [C4],
        mode: opts.mode,
        scored: opts.scored,
        mic: false,
        learning: true,
      });
      expect('learning' in s).toBe(false);
      const { state } = play(
        {
          prompts: [C4, E4],
          ...opts,
          learning: true,
        },
        [
          shown(0),
          on(62, 900),
          {
            type: 'next',
          },
        ],
      );
      // Test mode: a miss ends the prompt.
      expect(state).toMatchObject({
        kind: 'asking',
        index: 1,
      });
    }
  });
});

describe('Test mode', () => {
  it('carries no learning fields at all', () => {
    const { state } = play(
      {
        prompts: [C4, E4],
        scored: true,
        learning: false,
      },
      [shown(0), on(62, 900)],
    );
    expect(state).toMatchObject({
      kind: 'feedback',
      index: 0,
      octaveOff: false,
    });
    expect('right' in state).toBe(false);
    expect('misses' in state).toBe(false);
    expect('learning' in state).toBe(false);
  });

  it('keeps a scored freeplay run saving as it always did', () => {
    const { state, effects } = play(
      {
        prompts: [C4],
        scored: true,
        learning: false,
      },
      [
        shown(0),
        on(60, 800),
        {
          type: 'next',
        },
      ],
    );
    expect(state).toMatchObject({
      kind: 'saving',
      attempt: 1,
    });
    expect(effects).toEqual(['complete', 'save']);
  });
});
