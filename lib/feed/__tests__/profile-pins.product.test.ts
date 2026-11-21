/** The pure rules of pinned posts (sprint 05 #19): order, the limit, the neighbour swap and which move rows show. */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  PIN_LIMIT,
  moveOptions,
  nextPinnedAt,
  pinLimitMessage,
  pinPlace,
  pinsAreFull,
  sortPins,
  swapWithNeighbour,
} from '@/lib/feed/profile-pins';
import { movePinBodySchema } from '@/lib/feed/profile-pins-schema';

const at =
  (
    s: number,
  ) =>
    new Date(
      Date.UTC(
        2026,
        0,
        1,
        0,
        0,
        s,
      ),
    );
const pins =
  [
    {
      id: 'c',
      pinnedAt:
        at(
          30,
        ),
    },
    {
      id: 'a',
      pinnedAt:
        at(
          10,
        ),
    },
    {
      id: 'b',
      pinnedAt:
        at(
          20,
        ),
    },
  ];

describe('the limit', () => {
  it('is three, and full at three', () => {
    expect(
      PIN_LIMIT,
    ).toBe(
      3,
    );
    expect(
      pinsAreFull(
        2,
      ),
    ).toBe(
      false,
    );
    expect(
      pinsAreFull(
        3,
      ),
    ).toBe(
      true,
    );
  });

  it('the refusal names the limit', () => {
    expect(
      pinLimitMessage(),
    ).toBe(
      'You can pin up to 3 posts. Unpin one first.',
    );
  });
});

describe('order', () => {
  it('earlier pinnedAt is higher, ties fall back to the id', () => {
    expect(
      sortPins(
        pins,
      ).map(
        (
          p,
        ) =>
          p.id,
      ),
    ).toEqual(
      [
        'a',
        'b',
        'c',
      ],
    );
    expect(
      sortPins(
        [
          {
            id: 'z',
            pinnedAt:
              at(
                1,
              ),
          },
          {
            id: 'y',
            pinnedAt:
              at(
                1,
              ),
          },
        ],
      ).map(
        (
          p,
        ) =>
          p.id,
      ),
    ).toEqual(
      [
        'y',
        'z',
      ],
    );
  });

  it('places a post among the pins', () => {
    expect(
      pinPlace(
        pins,
        'b',
      ),
    ).toEqual(
      {
        order: 2,
        count: 3,
      },
    );
    expect(
      pinPlace(
        pins,
        'x',
      ),
    ).toEqual(
      {
        order:
          null,
        count: 3,
      },
    );
  });

  it('a new pin is stamped after the last one, never before it', () => {
    expect(
      nextPinnedAt(
        pins,
        at(
          100,
        ),
      ).getTime(),
    ).toBe(
      at(
        100,
      ).getTime(),
    );
    expect(
      nextPinnedAt(
        pins,
        at(
          5,
        ),
      ).getTime(),
    ).toBe(
      at(
        30,
      ).getTime() +
        1,
    );
    expect(
      nextPinnedAt(
        [],
        at(
          5,
        ),
      ).getTime(),
    ).toBe(
      at(
        5,
      ).getTime(),
    );
  });
});

describe('moving', () => {
  it('swaps the two pinnedAt values', () => {
    expect(
      swapWithNeighbour(
        pins,
        'b',
        'up',
      ),
    ).toEqual(
      {
        moved:
          {
            id: 'b',
            pinnedAt:
              at(
                10,
              ),
          },
        neighbour:
          {
            id: 'a',
            pinnedAt:
              at(
                20,
              ),
          },
      },
    );
    expect(
      swapWithNeighbour(
        pins,
        'b',
        'down',
      ),
    ).toEqual(
      {
        moved:
          {
            id: 'b',
            pinnedAt:
              at(
                30,
              ),
          },
        neighbour:
          {
            id: 'c',
            pinnedAt:
              at(
                20,
              ),
          },
      },
    );
  });

  it('is nothing at either end or for a post that is not pinned', () => {
    expect(
      swapWithNeighbour(
        pins,
        'a',
        'up',
      ),
    ).toBeNull();
    expect(
      swapWithNeighbour(
        pins,
        'c',
        'down',
      ),
    ).toBeNull();
    expect(
      swapWithNeighbour(
        pins,
        'x',
        'up',
      ),
    ).toBeNull();
  });

  it('offers only the moves that can happen', () => {
    expect(
      moveOptions(
        {
          order: 1,
          count: 3,
        },
      ),
    ).toEqual(
      {
        up: false,
        down: true,
      },
    );
    expect(
      moveOptions(
        {
          order: 2,
          count: 3,
        },
      ),
    ).toEqual(
      {
        up: true,
        down: true,
      },
    );
    expect(
      moveOptions(
        {
          order: 3,
          count: 3,
        },
      ),
    ).toEqual(
      {
        up: true,
        down: false,
      },
    );
    expect(
      moveOptions(
        {
          order: 1,
          count: 1,
        },
      ),
    ).toEqual(
      {
        up: false,
        down: false,
      },
    );
    expect(
      moveOptions(
        {
          order:
            null,
          count: 2,
        },
      ),
    ).toEqual(
      {
        up: false,
        down: false,
      },
    );
  });
});

describe('the move body', () => {
  it('takes up or down and nothing else', () => {
    expect(
      movePinBodySchema.safeParse(
        {
          direction:
            'up',
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      movePinBodySchema.safeParse(
        {
          direction:
            'down',
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      movePinBodySchema.safeParse(
        {
          direction:
            'left',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      movePinBodySchema.safeParse(
        {},
      )
        .success,
    ).toBe(
      false,
    );
  });
});
