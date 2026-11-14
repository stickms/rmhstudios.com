import {
  describe,
  expect,
  it,
} from 'vitest';
import { noteLetter } from '../theory/clef';
import {
  DECKS,
  buildSession,
  cardId,
  isKnownCardId,
  parseCardId,
  type Deck,
} from './decks';

/** A small deterministic generator (mulberry32) so a failing shuffle can be replayed. */
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

const NATURAL_PITCH_CLASSES =
  new Set(
    [
      0,
      2,
      4,
      5,
      7,
      9,
      11,
    ],
  );

describe('decks', () => {
  it('has the five decks with matching ids', () => {
    expect(
      Object.keys(
        DECKS,
      ).sort(),
    ).toEqual(
      [
        'bass-all',
        'middle-c',
        'treble-all',
        'treble-lines',
        'treble-spaces',
      ],
    );
    for (const [
      id,
      deck,
    ] of Object.entries(
      DECKS,
    ))
      expect(
        deck.id,
      ).toBe(
        id,
      );
  });

  it('uses natural notes only, with no duplicates', () => {
    for (const deck of Object.values(
      DECKS,
    )) {
      expect(
        new Set(
          deck.midis,
        )
          .size,
      ).toBe(
        deck
          .midis
          .length,
      );
      for (const midi of deck.midis)
        expect(
          NATURAL_PITCH_CLASSES.has(
            midi %
              12,
          ),
        ).toBe(
          true,
        );
    }
  });

  it('holds the notes each name promises', () => {
    expect(
      DECKS[
        'treble-lines'
      ]
        .midis,
    ).toEqual(
      [
        64,
        67,
        71,
        74,
        77,
      ],
    );
    expect(
      DECKS[
        'treble-spaces'
      ]
        .midis,
    ).toEqual(
      [
        65,
        69,
        72,
        76,
      ],
    );
    expect(
      DECKS[
        'treble-all'
      ]
        .midis[0],
    ).toBe(
      60,
    );
    expect(
      DECKS[
        'treble-all'
      ].midis.at(
        -1,
      ),
    ).toBe(
      81,
    );
    expect(
      DECKS[
        'bass-all'
      ]
        .midis[0],
    ).toBe(
      40,
    );
    expect(
      DECKS[
        'bass-all'
      ].midis.at(
        -1,
      ),
    ).toBe(
      60,
    );
    expect(
      DECKS[
        'middle-c'
      ]
        .midis,
    ).toEqual(
      [
        59,
        60,
        62,
        72,
      ],
    );
    expect(
      DECKS[
        'middle-c'
      ]
        .midis,
    ).toContain(
      60,
    );
  });

  it('puts every deck on its clef', () => {
    expect(
      DECKS[
        'bass-all'
      ]
        .clef,
    ).toBe(
      'bass',
    );
    expect(
      DECKS[
        'treble-all'
      ]
        .clef,
    ).toBe(
      'treble',
    );
  });
});

describe('buildSession', () => {
  const lines =
    DECKS[
      'treble-lines'
    ];

  it('makes `count` cards from the deck, with ids like treble:64', () => {
    const cards =
      buildSession(
        lines,
        10,
        seeded(
          1,
        ),
      );
    expect(
      cards,
    ).toHaveLength(
      10,
    );
    for (const c of cards) {
      expect(
        lines.midis,
      ).toContain(
        c.midi,
      );
      expect(
        c.clef,
      ).toBe(
        'treble',
      );
      expect(
        c.id,
      ).toBe(
        `treble:${c.midi}`,
      );
      expect(
        c.id,
      ).toBe(
        cardId(
          c.clef,
          c.midi,
        ),
      );
    }
  });

  it('never shows the same card twice in a row', () => {
    for (
      let seed = 1;
      seed <=
      200;
      seed++
    ) {
      const cards =
        buildSession(
          lines,
          40,
          seeded(
            seed,
          ),
        );
      for (
        let i = 1;
        i <
        cards.length;
        i++
      )
        expect(
          cards[
            i
          ]
            .id,
        ).not.toBe(
          cards[
            i -
              1
          ]
            .id,
        );
    }
  });

  it('never repeats back to back on the smallest deck that can avoid it', () => {
    const two: Deck =
      {
        id: 'two',
        clef: 'treble',
        midis:
          [
            64,
            65,
          ],
      };
    for (
      let seed = 1;
      seed <=
      100;
      seed++
    ) {
      const cards =
        buildSession(
          two,
          21,
          seeded(
            seed,
          ),
        );
      for (
        let i = 1;
        i <
        cards.length;
        i++
      )
        expect(
          cards[
            i
          ]
            .id,
        ).not.toBe(
          cards[
            i -
              1
          ]
            .id,
        );
    }
  });

  it('shows every card of a small deck before repeating any', () => {
    for (
      let seed = 1;
      seed <=
      100;
      seed++
    ) {
      const cards =
        buildSession(
          lines,
          10,
          seeded(
            seed,
          ),
        );
      expect(
        new Set(
          cards
            .slice(
              0,
              5,
            )
            .map(
              (
                c,
              ) =>
                c.id,
            ),
        )
          .size,
      ).toBe(
        5,
      );
      expect(
        new Set(
          cards
            .slice(
              5,
              10,
            )
            .map(
              (
                c,
              ) =>
                c.id,
            ),
        )
          .size,
      ).toBe(
        5,
      );
    }
  });

  it('is deterministic for a given rand', () => {
    expect(
      buildSession(
        lines,
        12,
        seeded(
          7,
        ),
      ),
    ).toEqual(
      buildSession(
        lines,
        12,
        seeded(
          7,
        ),
      ),
    );
  });

  it('copes with rand values at the edges', () => {
    const cards =
      buildSession(
        lines,
        10,
        () =>
          0.9999999,
      );
    expect(
      cards,
    ).toHaveLength(
      10,
    );
    expect(
      buildSession(
        lines,
        10,
        () =>
          1,
      ),
    ).toHaveLength(
      10,
    );
    expect(
      buildSession(
        lines,
        10,
        () =>
          Number.NaN,
      ),
    ).toHaveLength(
      10,
    );
    expect(
      buildSession(
        lines,
        10,
        () =>
          -1,
      ),
    ).toHaveLength(
      10,
    );
  });

  it('returns nothing for a zero, negative or non-finite count, and for an empty deck', () => {
    expect(
      buildSession(
        lines,
        0,
        seeded(
          1,
        ),
      ),
    ).toEqual(
      [],
    );
    expect(
      buildSession(
        lines,
        -3,
        seeded(
          1,
        ),
      ),
    ).toEqual(
      [],
    );
    expect(
      buildSession(
        lines,
        Number.NaN,
        seeded(
          1,
        ),
      ),
    ).toEqual(
      [],
    );
    expect(
      buildSession(
        lines,
        Infinity,
        seeded(
          1,
        ),
      ),
    ).toEqual(
      [],
    );
    expect(
      buildSession(
        {
          id: 'x',
          clef: 'bass',
          midis:
            [],
        },
        5,
        seeded(
          1,
        ),
      ),
    ).toEqual(
      [],
    );
  });

  it('only repeats the card when the deck has one card', () => {
    const one: Deck =
      {
        id: 'one',
        clef: 'treble',
        midis:
          [
            60,
          ],
      };
    expect(
      buildSession(
        one,
        3,
        seeded(
          1,
        ),
      ).map(
        (
          c,
        ) =>
          c.midi,
      ),
    ).toEqual(
      [
        60,
        60,
        60,
      ],
    );
  });

  it('can be answered by letter for every card it deals', () => {
    for (const c of buildSession(
      DECKS[
        'bass-all'
      ],
      30,
      seeded(
        3,
      ),
    )) {
      expect(
        noteLetter(
          c.midi,
        ),
      ).toMatch(
        /^[A-G]$/,
      );
    }
  });
});

describe('isKnownCardId / parseCardId', () => {
  it('knows every card of every deck', () => {
    for (const deck of Object.values(
      DECKS,
    )) {
      for (const midi of deck.midis) {
        const id =
          cardId(
            deck.clef,
            midi,
          );
        expect(
          isKnownCardId(
            id,
          ),
        ).toBe(
          true,
        );
        expect(
          parseCardId(
            id,
          ),
        ).toEqual(
          {
            id,
            clef: deck.clef,
            midi,
          },
        );
      }
    }
  });

  it.each(
    [
      '',
      'treble',
      'treble:',
      'treble:61', // a sharp: no deck has it
      'treble:100',
      'bass:64', // E4 is above the bass deck
      'alto:60',
      'treble:064',
      'treble:64 ',
      ' treble:64',
      'treble:64.0',
      'constructor',
      '__proto__',
      'x'.repeat(
        65,
      ),
    ],
  )(
    'rejects %j',
    (
      id,
    ) => {
      expect(
        isKnownCardId(
          id,
        ),
      ).toBe(
        false,
      );
      expect(
        parseCardId(
          id,
        ),
      ).toBeNull();
    },
  );
});
