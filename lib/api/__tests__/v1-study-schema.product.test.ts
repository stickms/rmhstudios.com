/** The v1 study schemas' limits and the keyset cursors (pure; no database). */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  API_BATCH_MAX,
  batchBody,
  cardPath,
  createDeckBody,
  decodeCardCursor,
  decodeDeckCursor,
  encodeCardCursor,
  encodeDeckCursor,
  externalCardPath,
  newCard,
  pageQuery,
  patchCardBody,
  patchDeckBody,
  upsertCardBody,
} from '@/lib/api/v1/study-schema';

const card =
  (
    i = 0,
  ) => ({
    front: `q${i}`,
    back: `a${i}`,
  });

describe('page query', () => {
  it('defaults to 20 and caps at 100', () => {
    expect(
      pageQuery.parse(
        {},
      )
        .limit,
    ).toBe(
      20,
    );
    expect(
      pageQuery.parse(
        {
          limit:
            '100',
        },
      )
        .limit,
    ).toBe(
      100,
    );
    expect(
      pageQuery.safeParse(
        {
          limit:
            '101',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      pageQuery.safeParse(
        {
          limit:
            '0',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      pageQuery.safeParse(
        {
          limit:
            '1.5',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      pageQuery.safeParse(
        {
          cursor:
            'x'.repeat(
              201,
            ),
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
});

describe('path ids', () => {
  it('limits ids to 64 and external ids to 100 characters', () => {
    expect(
      cardPath.safeParse(
        {
          id: 'a'.repeat(
            64,
          ),
          cardId:
            'b',
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      cardPath.safeParse(
        {
          id: 'a'.repeat(
            65,
          ),
          cardId:
            'b',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      externalCardPath.safeParse(
        {
          id: 'a',
          externalId:
            'e'.repeat(
              100,
            ),
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      externalCardPath.safeParse(
        {
          id: 'a',
          externalId:
            'e'.repeat(
              101,
            ),
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      externalCardPath.safeParse(
        {
          id: 'a',
          externalId:
            '',
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
});

describe('cards', () => {
  it('uses the editor limits and rules', () => {
    expect(
      newCard.safeParse(
        card(),
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      newCard.safeParse(
        {
          front:
            'f',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      newCard.safeParse(
        {
          front:
            'f'.repeat(
              501,
            ),
          back: 'b',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      newCard.safeParse(
        {
          front:
            'f',
          back: 'b'.repeat(
            501,
          ),
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      newCard.safeParse(
        {
          kind: 'cloze',
          front:
            'The {{c1::sun}} is a star',
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      newCard.safeParse(
        {
          kind: 'cloze',
          front:
            'no deletion here',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      newCard.safeParse(
        {
          kind: 'nope',
          ...card(),
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      newCard.safeParse(
        {
          ...card(),
          externalId:
            'e'.repeat(
              101,
            ),
        },
      )
        .success,
    ).toBe(
      false,
    );
  });

  it('refuses unknown fields so origin columns and ids cannot be set', () => {
    expect(
      newCard.safeParse(
        {
          ...card(),
          originHash:
            'x',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      newCard.safeParse(
        {
          ...card(),
          sourceId:
            'x',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      upsertCardBody.safeParse(
        {
          ...card(),
          externalId:
            'x',
        },
      )
        .success,
    ).toBe(
      false,
    );
  });

  it('a patch needs at least one field', () => {
    expect(
      patchCardBody.safeParse(
        {},
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      patchCardBody.safeParse(
        {
          back: 'b',
        },
      )
        .success,
    ).toBe(
      true,
    );
  });
});

describe('batch', () => {
  it('takes 1 to 100 cards', () => {
    expect(
      API_BATCH_MAX,
    ).toBe(
      100,
    );
    expect(
      batchBody.safeParse(
        {
          cards:
            [],
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      batchBody.safeParse(
        {
          cards:
            Array.from(
              {
                length: 100,
              },
              (
                _,
                i,
              ) =>
                card(
                  i,
                ),
            ),
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      batchBody.safeParse(
        {
          cards:
            Array.from(
              {
                length: 101,
              },
              (
                _,
                i,
              ) =>
                card(
                  i,
                ),
            ),
        },
      )
        .success,
    ).toBe(
      false,
    );
  });
});

describe('decks', () => {
  it('limits title to 100 and description to 500', () => {
    expect(
      createDeckBody.safeParse(
        {
          title:
            't'.repeat(
              100,
            ),
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      createDeckBody.safeParse(
        {
          title:
            't'.repeat(
              101,
            ),
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      createDeckBody.safeParse(
        {
          title:
            '   ',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      createDeckBody.safeParse(
        {
          title:
            't',
          description:
            'd'.repeat(
              501,
            ),
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      patchDeckBody.safeParse(
        {},
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      patchDeckBody.safeParse(
        {
          isPublic: true,
        },
      )
        .success,
    ).toBe(
      true,
    );
  });
});

describe('cursors', () => {
  it('round-trip', () => {
    const at =
      new Date(
        '2026-11-20T21:14:00.123Z',
      );
    expect(
      decodeDeckCursor(
        encodeDeckCursor(
          at,
          'deck_1',
        ),
      ),
    ).toEqual(
      {
        updatedAt:
          at,
        id: 'deck_1',
      },
    );
    expect(
      decodeCardCursor(
        encodeCardCursor(
          7,
          'card_1',
        ),
      ),
    ).toEqual(
      {
        position: 7,
        id: 'card_1',
      },
    );
  });

  it('are url-safe', () => {
    expect(
      encodeDeckCursor(
        new Date(
          0,
        ),
        'id',
      ),
    ).toMatch(
      /^[A-Za-z0-9_-]+$/,
    );
    expect(
      encodeCardCursor(
        0,
        'id',
      ),
    ).toMatch(
      /^[A-Za-z0-9_-]+$/,
    );
  });

  it('reject anything that is not one', () => {
    for (const bad of [
      '',
      '!!!',
      'bm9waXBl',
      btoa(
        '2026-99-99|id',
      ),
      btoa(
        '|id',
      ),
      btoa(
        'x|',
      ),
    ]) {
      expect(
        decodeDeckCursor(
          bad,
        ),
      ).toBeNull();
    }
    for (const bad of [
      '',
      '!!!',
      btoa(
        '-1|id',
      ),
      btoa(
        '1.5|id',
      ),
      btoa(
        'abc|id',
      ),
      btoa(
        '1|',
      ),
      btoa(
        '12345678901|id',
      ),
    ]) {
      expect(
        decodeCardCursor(
          bad,
        ),
      ).toBeNull();
    }
    expect(
      decodeCardCursor(
        encodeDeckCursor(
          new Date(
            0,
          ),
          'id',
        ),
      ),
    ).toBeNull();
  });
});
