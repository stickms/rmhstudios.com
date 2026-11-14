import {
  describe,
  expect,
  it,
} from 'vitest';
import { habitPostsPerDay } from '@/lib/rmhark-ai/bot-stats';
import {
  POLITICAL_LEANS,
  POSTING_HABITS,
  composePersona,
  hasPoliticalLean,
  pickPoliticalLean,
  readPoliticalLean,
  rollPersona,
  withPoliticalLean,
} from '@/lib/rmhark-ai/persona';

const TOTAL =
  POLITICAL_LEANS.reduce(
    (
      s,
      l,
    ) =>
      s +
      l.weight,
    0,
  );
const WEIGHTS =
  {
    apolitical: 30,
    progressive: 14,
    liberal: 14,
    moderate: 12,
    conservative: 14,
    libertarian: 8,
    populist: 8,
  } as const;

describe('political lean axis', () => {
  it('has the seven leans with their weights, summing to 100', () => {
    expect(
      TOTAL,
    ).toBe(
      100,
    );
    for (const l of POLITICAL_LEANS)
      expect(
        l.weight,
      ).toBe(
        WEIGHTS[
          l
            .id
        ],
      );
    expect(
      POLITICAL_LEANS,
    ).toHaveLength(
      7,
    );
  });

  it('rules are plain prose: no party, politician or one-line labels with brackets', () => {
    for (const l of POLITICAL_LEANS) {
      expect(
        l
          .rules
          .length,
      ).toBeGreaterThan(
        80,
      );
      expect(
        l.label,
      ).not.toMatch(
        /[()\n]/,
      );
      expect(
        l.rules,
      ).not.toMatch(
        /\n/,
      );
      expect(
        l.rules,
      ).not.toMatch(
        /democrat|republican|labour|tory|trump|biden|maga/i,
      );
    }
  });

  it('pickPoliticalLean follows the cumulative weights at the boundaries', () => {
    expect(
      pickPoliticalLean(
        0,
      )
        .id,
    ).toBe(
      'apolitical',
    );
    expect(
      pickPoliticalLean(
        0.2999,
      )
        .id,
    ).toBe(
      'apolitical',
    );
    expect(
      pickPoliticalLean(
        0.3001,
      )
        .id,
    ).toBe(
      'progressive',
    );
    expect(
      pickPoliticalLean(
        0.4399,
      )
        .id,
    ).toBe(
      'progressive',
    );
    expect(
      pickPoliticalLean(
        0.4401,
      )
        .id,
    ).toBe(
      'liberal',
    );
    expect(
      pickPoliticalLean(
        0.5801,
      )
        .id,
    ).toBe(
      'moderate',
    );
    expect(
      pickPoliticalLean(
        0.7001,
      )
        .id,
    ).toBe(
      'conservative',
    );
    expect(
      pickPoliticalLean(
        0.8401,
      )
        .id,
    ).toBe(
      'libertarian',
    );
    expect(
      pickPoliticalLean(
        0.9201,
      )
        .id,
    ).toBe(
      'populist',
    );
    expect(
      pickPoliticalLean(
        0.9999,
      )
        .id,
    ).toBe(
      'populist',
    );
    // Out-of-range or broken draws clamp rather than throw.
    expect(
      pickPoliticalLean(
        1,
      )
        .id,
    ).toBe(
      'populist',
    );
    expect(
      pickPoliticalLean(
        -3,
      )
        .id,
    ).toBe(
      'apolitical',
    );
    expect(
      pickPoliticalLean(
        Number.NaN,
      )
        .id,
    ).toBe(
      'apolitical',
    );
  });
});

describe('composePersona with a lean', () => {
  it('emits exactly one POLITICS line and still parses ACTIVITY', () => {
    for (const lean of POLITICAL_LEANS) {
      for (const h of POSTING_HABITS) {
        const text =
          composePersona(
            {
              ...rollPersona(),
              habit:
                h,
              politics:
                lean,
            },
          );
        const lines =
          text
            .split(
              '\n',
            )
            .filter(
              (
                l,
              ) =>
                l.startsWith(
                  'POLITICS (',
                ),
            );
        expect(
          lines,
        ).toEqual(
          [
            `POLITICS (${lean.label}): ${lean.rules}`,
          ],
        );
        expect(
          habitPostsPerDay(
            text,
          ),
        ).toBe(
          h.postsPerDay,
        );
        expect(
          readPoliticalLean(
            text,
          ),
        ).toBe(
          lean.id,
        );
      }
    }
  });

  it('a lean line never trips the legacy whole-text habit match', () => {
    for (const lean of POLITICAL_LEANS) {
      expect(
        habitPostsPerDay(
          `THEME: x.\n${`POLITICS (${lean.label}): ${lean.rules}`}`,
        ),
      ).toBe(
        5,
      );
    }
  });

  it('a fresh roll carries a lean', () => {
    for (
      let i = 0;
      i <
      50;
      i++
    )
      expect(
        readPoliticalLean(
          composePersona(
            rollPersona(),
          ),
        ),
      ).not.toBeNull();
  });
});

describe('withPoliticalLean', () => {
  const legacy =
    'THEME: vintage synths.\nACTIVITY: posts a few times a day about their day and interests.';

  it('is deterministic per seed and appends one line', () => {
    const a =
      withPoliticalLean(
        legacy,
        'user_123',
      );
    expect(
      withPoliticalLean(
        legacy,
        'user_123',
      ),
    ).toBe(
      a,
    );
    expect(
      a.startsWith(
        `${legacy}\n`,
      ),
    ).toBe(
      true,
    );
    expect(
      a
        .split(
          '\n',
        )
        .filter(
          (
            l,
          ) =>
            l.startsWith(
              'POLITICS (',
            ),
        ),
    ).toHaveLength(
      1,
    );
    expect(
      readPoliticalLean(
        a,
      ),
    ).not.toBeNull();
    expect(
      habitPostsPerDay(
        a,
      ),
    ).toBe(
      5,
    );
  });

  it('leaves a persona that already has a lean unchanged, whatever the seed', () => {
    const own =
      composePersona(
        {
          ...rollPersona(),
          politics:
            POLITICAL_LEANS[3],
        },
      );
    expect(
      hasPoliticalLean(
        own,
      ),
    ).toBe(
      true,
    );
    for (const seed of [
      'a',
      'b',
      'c',
    ])
      expect(
        withPoliticalLean(
          own,
          seed,
        ),
      ).toBe(
        own,
      );
    // Idempotent on its own output.
    const once =
      withPoliticalLean(
        legacy,
        's',
      );
    expect(
      withPoliticalLean(
        once,
        'other',
      ),
    ).toBe(
      once,
    );
  });

  it('reads nothing from a persona with no line', () => {
    expect(
      readPoliticalLean(
        legacy,
      ),
    ).toBeNull();
    expect(
      readPoliticalLean(
        'POLITICS (made up): x',
      ),
    ).toBeNull();
  });

  it('over many ids lands near the stated weights', () => {
    const N = 20000;
    const counts =
      new Map<
        string,
        number
      >();
    for (
      let i = 0;
      i <
      N;
      i++
    ) {
      const id =
        readPoliticalLean(
          withPoliticalLean(
            legacy,
            `cm${i.toString(36)}x${i * 7919}`,
          ),
        );
      expect(
        id,
      ).not.toBeNull();
      counts.set(
        id ??
          '',
        (counts.get(
          id ??
            '',
        ) ??
          0) +
          1,
      );
    }
    for (const l of POLITICAL_LEANS) {
      const share =
        ((counts.get(
          l.id,
        ) ??
          0) /
          N) *
        100;
      expect(
        Math.abs(
          share -
            l.weight,
        ),
      ).toBeLessThan(
        1.5,
      );
    }
  });
});
