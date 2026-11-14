import {
  describe,
  expect,
  it,
} from 'vitest';
import { shopView } from '@/lib/shop/view';

const item =
  (
    id: string,
    kind:
      | 'BADGE'
      | 'BANNER',
    rarity:
      | 'common'
      | 'rare'
      | 'epic',
    price: number,
    owned = false,
  ) => ({
    id,
    kind,
    rarity,
    price,
    owned,
  });

const ITEMS =
  [
    item(
      'b-epic',
      'BADGE',
      'epic',
      600,
    ),
    item(
      'b-common-dear',
      'BADGE',
      'common',
      900,
      true,
    ),
    item(
      'b-common',
      'BADGE',
      'common',
      100,
    ),
    item(
      'b-rare',
      'BADGE',
      'rare',
      300,
      true,
    ),
    item(
      'banner',
      'BANNER',
      'common',
      50,
    ),
  ];

const ids =
  (
    list: {
      id: string;
    }[],
  ) =>
    list.map(
      (
        i,
      ) =>
        i.id,
    );

describe('shopView', () => {
  it('shows one category, ordered by rarity then price', () => {
    expect(
      ids(
        shopView(
          ITEMS,
          {
            kind: 'BADGE',
            show: 'all',
            sort: 'rarity',
          },
        ),
      ),
    ).toEqual(
      [
        'b-common',
        'b-common-dear',
        'b-rare',
        'b-epic',
      ],
    );
  });

  it('orders by price in either direction', () => {
    expect(
      ids(
        shopView(
          ITEMS,
          {
            kind: 'BADGE',
            show: 'all',
            sort: 'price_asc',
          },
        ),
      ),
    ).toEqual(
      [
        'b-common',
        'b-rare',
        'b-epic',
        'b-common-dear',
      ],
    );
    expect(
      ids(
        shopView(
          ITEMS,
          {
            kind: 'BADGE',
            show: 'all',
            sort: 'price_desc',
          },
        ),
      ),
    ).toEqual(
      [
        'b-common-dear',
        'b-epic',
        'b-rare',
        'b-common',
      ],
    );
  });

  it('narrows to owned or not owned', () => {
    expect(
      ids(
        shopView(
          ITEMS,
          {
            kind: 'BADGE',
            show: 'owned',
            sort: 'rarity',
          },
        ),
      ),
    ).toEqual(
      [
        'b-common-dear',
        'b-rare',
      ],
    );
    expect(
      ids(
        shopView(
          ITEMS,
          {
            kind: 'BADGE',
            show: 'unowned',
            sort: 'rarity',
          },
        ),
      ),
    ).toEqual(
      [
        'b-common',
        'b-epic',
      ],
    );
  });

  it('does not reorder its input', () => {
    const before =
      ids(
        ITEMS,
      );
    shopView(
      ITEMS,
      {
        kind: 'BADGE',
        show: 'all',
        sort: 'price_desc',
      },
    );
    expect(
      ids(
        ITEMS,
      ),
    ).toEqual(
      before,
    );
  });
});
