import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  cardHash,
  diffDecks,
  matchByFront,
  pendingCount,
} from '@/lib/study/deck-sync';

const card =
  (
    id: string,
    front: string,
    back = 'b',
    kind = 'basic',
  ) => ({
    id,
    kind,
    front,
    back,
  });
const copy =
  (
    id: string,
    origin:
      | string
      | null,
    front: string,
    back = 'b',
    hashed = {
      front,
      back,
    },
  ) => ({
    id,
    kind: 'basic',
    front,
    back,
    originCardId:
      origin,
    originHash:
      origin ===
      null
        ? null
        : cardHash(
            {
              kind: 'basic',
              ...hashed,
            },
          ),
  });

describe('cardHash', () => {
  it('is stable, 64 hex characters, and covers kind, front and back', () => {
    const base =
      cardHash(
        card(
          'x',
          'q',
          'a',
        ),
      );
    expect(
      base,
    ).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(
      cardHash(
        card(
          'other-id',
          'q',
          'a',
        ),
      ),
    ).toBe(
      base,
    );
    expect(
      cardHash(
        card(
          'x',
          'q',
          'a',
          'reversible',
        ),
      ),
    ).not.toBe(
      base,
    );
    expect(
      cardHash(
        card(
          'x',
          'q2',
          'a',
        ),
      ),
    ).not.toBe(
      base,
    );
    expect(
      cardHash(
        card(
          'x',
          'q',
          'a2',
        ),
      ),
    ).not.toBe(
      base,
    );
    // Field boundaries cannot be forged by moving text across them.
    expect(
      cardHash(
        card(
          'x',
          'qa',
          '',
        ),
      ),
    ).not.toBe(
      cardHash(
        card(
          'x',
          'q',
          'a',
        ),
      ),
    );
  });
});

describe('diffDecks', () => {
  it('finds new cards: a source card no copy card points at', () => {
    const diff =
      diffDecks(
        [
          card(
            's1',
            'q1',
          ),
          card(
            's2',
            'q2',
          ),
        ],
        [
          copy(
            'c1',
            's1',
            'q1',
          ),
        ],
      );
    expect(
      diff.added.map(
        (
          r,
        ) =>
          r.sourceCardId,
      ),
    ).toEqual(
      [
        's2',
      ],
    );
    expect(
      pendingCount(
        diff,
      ),
    ).toBe(
      1,
    );
  });

  it('finds changed cards the member did not edit', () => {
    const diff =
      diffDecks(
        [
          card(
            's1',
            'q1',
            'fixed',
          ),
        ],
        [
          copy(
            'c1',
            's1',
            'q1',
            'b',
          ),
        ],
      );
    expect(
      diff.changed,
    ).toHaveLength(
      1,
    );
    expect(
      diff
        .changed[0],
    ).toMatchObject(
      {
        cardId:
          'c1',
        sourceCardId:
          's1',
        theirs:
          {
            back: 'fixed',
          },
      },
    );
    expect(
      diff
        .changed[0]!
        .expectedHash,
    ).toBe(
      cardHash(
        {
          kind: 'basic',
          front:
            'q1',
          back: 'b',
        },
      ),
    );
    expect(
      diff.conflicts,
    ).toEqual(
      [],
    );
  });

  it('calls it a conflict when the member edited the card and the source changed', () => {
    const edited =
      copy(
        'c1',
        's1',
        'q1',
        'my edit',
        {
          front:
            'q1',
          back: 'b',
        },
      );
    const diff =
      diffDecks(
        [
          card(
            's1',
            'q1',
            'fixed',
          ),
        ],
        [
          edited,
        ],
      );
    expect(
      diff.conflicts.map(
        (
          r,
        ) =>
          r.cardId,
      ),
    ).toEqual(
      [
        'c1',
      ],
    );
    expect(
      diff.changed,
    ).toEqual(
      [],
    );
  });

  it('leaves a member edit alone while the source is unchanged', () => {
    const edited =
      copy(
        'c1',
        's1',
        'q1',
        'my edit',
        {
          front:
            'q1',
          back: 'b',
        },
      );
    expect(
      pendingCount(
        diffDecks(
          [
            card(
              's1',
              'q1',
              'b',
            ),
          ],
          [
            edited,
          ],
        ),
      ),
    ).toBe(
      0,
    );
  });

  it('treats a member who made the same edit as in step', () => {
    const same =
      copy(
        'c1',
        's1',
        'q1',
        'fixed',
        {
          front:
            'q1',
          back: 'b',
        },
      );
    expect(
      pendingCount(
        diffDecks(
          [
            card(
              's1',
              'q1',
              'fixed',
            ),
          ],
          [
            same,
          ],
        ),
      ),
    ).toBe(
      0,
    );
  });

  it('finds removed cards: an origin that is gone from the source', () => {
    const diff =
      diffDecks(
        [
          card(
            's1',
            'q1',
          ),
        ],
        [
          copy(
            'c1',
            's1',
            'q1',
          ),
          copy(
            'c2',
            's2',
            'q2',
          ),
        ],
      );
    expect(
      diff.removed.map(
        (
          r,
        ) =>
          r.cardId,
      ),
    ).toEqual(
      [
        'c2',
      ],
    );
  });

  it("never calls the member's own cards removed", () => {
    const diff =
      diffDecks(
        [
          card(
            's1',
            'q1',
          ),
        ],
        [
          copy(
            'c1',
            's1',
            'q1',
          ),
          copy(
            'mine',
            null,
            'own',
          ),
        ],
      );
    expect(
      pendingCount(
        diff,
      ),
    ).toBe(
      0,
    );
  });
});

describe('matchByFront', () => {
  it('matches exact fronts and leaves the rest unmatched', () => {
    const matches =
      matchByFront(
        [
          card(
            's1',
            'q1',
          ),
          card(
            's2',
            'q2',
          ),
        ],
        [
          copy(
            'c1',
            null,
            'q1',
          ),
          copy(
            'c2',
            null,
            'q9',
          ),
        ],
      );
    expect(
      matches,
    ).toEqual(
      [
        {
          cardId:
            'c1',
          sourceCardId:
            's1',
        },
      ],
    );
  });

  it('with duplicate fronts the first unmatched source card wins, one per copy card', () => {
    const matches =
      matchByFront(
        [
          card(
            's1',
            'same',
          ),
          card(
            's2',
            'same',
          ),
        ],
        [
          copy(
            'c1',
            null,
            'same',
          ),
          copy(
            'c2',
            null,
            'same',
          ),
          copy(
            'c3',
            null,
            'same',
          ),
        ],
      );
    expect(
      matches,
    ).toEqual(
      [
        {
          cardId:
            'c1',
          sourceCardId:
            's1',
        },
        {
          cardId:
            'c2',
          sourceCardId:
            's2',
        },
      ],
    );
  });

  it('skips source cards another copy card already claims, and cards already linked', () => {
    const matches =
      matchByFront(
        [
          card(
            's1',
            'same',
          ),
          card(
            's2',
            'same',
          ),
        ],
        [
          copy(
            'c0',
            's1',
            'same',
          ),
          copy(
            'c1',
            null,
            'same',
          ),
        ],
      );
    expect(
      matches,
    ).toEqual(
      [
        {
          cardId:
            'c1',
          sourceCardId:
            's2',
        },
      ],
    );
  });
});
