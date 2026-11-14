// The single-player meta save used to store any coin balance the client sent. These pin the bound that
// replaced it (money integrity): purchases are priced and paid by the server's balance, earned coins
// are limited by a refilling allowance, and nothing legitimate is rejected for rounding.
import {
  describe,
  it,
  expect,
} from 'vitest';
import {
  reconcileMetaSave,
  priceUpgrades,
  ALLOWANCE_CAP,
  INCOME_PER_SECOND,
  FIRST_IMPORT_MAX_COINS,
  type MetaRow,
} from '../meta-guard';
import { META_UPGRADES } from '../data/meta-upgrades';

const T0 =
  new Date(
    '2026-11-03T12:00:00Z',
  );
const row =
  (
    over: Partial<MetaRow> = {},
  ): MetaRow => ({
    coins: 100,
    upgrades:
      {},
    coinAllowance:
      ALLOWANCE_CAP,
    coinAllowanceAt:
      T0,
    ...over,
  });
const first =
  META_UPGRADES[0];

describe('meta save: earned coins are bounded', () => {
  it('a client claiming 100,000,000 coins gets at most its allowance', () => {
    const out =
      reconcileMetaSave(
        row(),
        {
          coins: 100_000_000,
          upgrades:
            {},
        },
        T0,
      );
    expect(
      out,
    ).toMatchObject(
      {
        ok: true,
        coins:
          100 +
          ALLOWANCE_CAP,
        clamped: true,
        coinAllowance: 0,
      },
    );
  });

  it('an honest run payout within the allowance is accepted exactly', () => {
    const out =
      reconcileMetaSave(
        row(),
        {
          coins:
            100 +
            2400,
          upgrades:
            {},
        },
        T0,
      );
    expect(
      out,
    ).toMatchObject(
      {
        ok: true,
        coins: 2500,
        clamped: false,
        coinAllowance:
          ALLOWANCE_CAP -
          2400,
      },
    );
  });

  it('the allowance refills with real time, up to the cap, and not faster', () => {
    const spent =
      reconcileMetaSave(
        row(),
        {
          coins: 100_000_000,
          upgrades:
            {},
        },
        T0,
      );
    if (
      !spent.ok
    )
      throw new Error(
        'expected ok',
      );
    const next =
      (
        seconds: number,
        claim: number,
      ) =>
        reconcileMetaSave(
          row(
            {
              coins:
                spent.coins,
              coinAllowance:
                spent.coinAllowance,
              coinAllowanceAt:
                spent.coinAllowanceAt,
            },
          ),
          {
            coins:
              claim,
            upgrades:
              {},
          },
          new Date(
            T0.getTime() +
              seconds *
                1000,
          ),
        );
    // 10 s later only 80 more coins have accrued.
    const soon =
      next(
        10,
        100_000_000,
      );
    expect(
      soon,
    ).toMatchObject(
      {
        ok: true,
        coins:
          spent.coins +
          10 *
            INCOME_PER_SECOND,
        clamped: true,
      },
    );
    // An hour later the bucket is back to its cap, not 3600 * rate.
    const later =
      next(
        3600,
        100_000_000,
      );
    expect(
      later,
    ).toMatchObject(
      {
        ok: true,
        coins:
          spent.coins +
          ALLOWANCE_CAP,
        clamped: true,
      },
    );
  });

  it('repeating the same POST does not mint again', () => {
    const a =
      reconcileMetaSave(
        row(),
        {
          coins: 100_000_000,
          upgrades:
            {},
        },
        T0,
      );
    if (
      !a.ok
    )
      throw new Error(
        'expected ok',
      );
    const again =
      reconcileMetaSave(
        row(
          {
            coins:
              a.coins,
            coinAllowance:
              a.coinAllowance,
            coinAllowanceAt:
              a.coinAllowanceAt,
          },
        ),
        {
          coins: 100_000_000,
          upgrades:
            {},
        },
        T0,
      );
    expect(
      again,
    ).toMatchObject(
      {
        ok: true,
        coins:
          a.coins,
      },
    );
  });

  it('spending is always accepted (the client may lower its balance)', () => {
    expect(
      reconcileMetaSave(
        row(),
        {
          coins: 3,
          upgrades:
            {},
        },
        T0,
      ),
    ).toMatchObject(
      {
        ok: true,
        coins: 3,
        clamped: false,
      },
    );
  });

  it('rejects nonsense balances', () => {
    for (const coins of [
      -1,
      NaN,
      Infinity,
      100_000_001,
    ]) {
      expect(
        reconcileMetaSave(
          row(),
          {
            coins,
            upgrades:
              {},
          },
          T0,
        ),
      ).toMatchObject(
        {
          ok: false,
        },
      );
    }
  });
});

describe('meta save: purchases are priced by the server', () => {
  it('pays for an upgrade out of the server balance', () => {
    const cost =
      first
        .costs[0];
    const out =
      reconcileMetaSave(
        row(
          {
            coins:
              cost +
              5,
          },
        ),
        {
          coins: 5,
          upgrades:
            {
              [first.id]: 1,
            },
        },
        T0,
      );
    expect(
      out,
    ).toMatchObject(
      {
        ok: true,
        coins: 5,
        clamped: false,
      },
    );
  });

  it('refuses an upgrade the server balance cannot pay for', () => {
    const out =
      reconcileMetaSave(
        row(
          {
            coins:
              first
                .costs[0] -
              1,
          },
        ),
        {
          coins: 0,
          upgrades:
            {
              [first.id]: 1,
            },
        },
        T0,
      );
    expect(
      out,
    ).toMatchObject(
      {
        ok: false,
      },
    );
  });

  it('claiming the purchase for free is bounded by the allowance like any other gain', () => {
    const cost =
      first
        .costs[0];
    const out =
      reconcileMetaSave(
        row(
          {
            coins:
              cost,
          },
        ),
        {
          coins:
            cost,
          upgrades:
            {
              [first.id]: 1,
            },
        },
        T0,
      );
    expect(
      out,
    ).toMatchObject(
      {
        ok: true,
        coins:
          cost,
        clamped: false,
        coinAllowance:
          ALLOWANCE_CAP -
          cost,
      },
    );
    const greedy =
      reconcileMetaSave(
        row(
          {
            coins:
              cost,
            coinAllowance: 0,
            coinAllowanceAt:
              T0,
          },
        ),
        {
          coins:
            cost,
          upgrades:
            {
              [first.id]: 1,
            },
        },
        T0,
      );
    expect(
      greedy,
    ).toMatchObject(
      {
        ok: true,
        coins: 0,
        clamped: true,
      },
    );
  });

  it('refuses levels above the max, unknown upgrades, and levels going down', () => {
    expect(
      priceUpgrades(
        {},
        {
          [first.id]:
            first.maxLevel +
            1,
        },
      ),
    ).toHaveProperty(
      'error',
    );
    expect(
      priceUpgrades(
        {},
        {
          not_an_upgrade: 1,
        },
      ),
    ).toHaveProperty(
      'error',
    );
    expect(
      priceUpgrades(
        {
          [first.id]: 2,
        },
        {
          [first.id]: 1,
        },
      ),
    ).toHaveProperty(
      'error',
    );
    expect(
      priceUpgrades(
        {
          [first.id]: 2,
        },
        {},
      ),
    ).toHaveProperty(
      'error',
    );
    expect(
      priceUpgrades(
        {},
        {
          [first.id]: 1.5,
        },
      ),
    ).toHaveProperty(
      'error',
    );
  });

  it('prices several levels at once from the cost table', () => {
    const want =
      first
        .costs[0] +
      first
        .costs[1] +
      first
        .costs[2];
    expect(
      priceUpgrades(
        {},
        {
          [first.id]: 3,
        },
      ),
    ).toEqual(
      {
        cost: want,
      },
    );
  });

  it('keeps a retired upgrade id from an old save, but never lets one be raised', () => {
    expect(
      priceUpgrades(
        {
          old_retired: 2,
        },
        {
          old_retired: 2,
        },
      ),
    ).toEqual(
      {
        cost: 0,
      },
    );
    expect(
      priceUpgrades(
        {
          old_retired: 2,
        },
        {
          old_retired: 3,
        },
      ),
    ).toHaveProperty(
      'error',
    );
  });
});

describe('meta save: first save for an account', () => {
  it('imports progress made signed out, bounded', () => {
    const ok =
      reconcileMetaSave(
        null,
        {
          coins: 1234,
          upgrades:
            {
              [first.id]: 2,
            },
        },
        T0,
      );
    expect(
      ok,
    ).toMatchObject(
      {
        ok: true,
        coins: 1234,
        clamped: false,
      },
    );
    const greedy =
      reconcileMetaSave(
        null,
        {
          coins: 90_000_000,
          upgrades:
            {},
        },
        T0,
      );
    expect(
      greedy,
    ).toMatchObject(
      {
        ok: true,
        coins:
          FIRST_IMPORT_MAX_COINS,
        clamped: true,
      },
    );
    expect(
      reconcileMetaSave(
        null,
        {
          coins: 0,
          upgrades:
            {
              [first.id]: 99,
            },
        },
        T0,
      ),
    ).toMatchObject(
      {
        ok: false,
      },
    );
  });
});
