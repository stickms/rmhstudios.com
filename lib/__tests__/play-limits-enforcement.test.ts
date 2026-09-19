import { describe, it, expect, vi } from 'vitest';

/**
 * Responsible play (W8) — the claim that the whole feature rests on.
 *
 * The design says one check in `debitCoinsOn` covers every coin-risking surface
 * on the site, because all of them already book their stake as `type: 'WAGER'`.
 * That is only true if two things hold, and both are asserted here:
 *
 *   1. a `WAGER` debit consults the member's limits, and
 *   2. a debit of any OTHER type does not — buying a t-shirt is not gambling,
 *      and an excluded member must still be able to spend coins in the shop.
 *
 * The second is the one that would rot silently: adding the guard to every
 * debit would "work" in every test written against the casino and quietly
 * break the storefront for exactly the people least able to complain about it.
 */

import { AppError } from '@/lib/errors/codes';
import { assertPlayAllowedOn } from '@/lib/economy/play-limits-core';

const NOW = new Date('2026-09-19T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

/** The two calls `assertPlayAllowedOn` makes, and nothing else. */
function db(row: Record<string, unknown> | null, stakedToday = 0) {
  return {
    userPlayLimits: { findUnique: vi.fn().mockResolvedValue(row) },
    coinTransaction: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: stakedToday } }),
    },
  };
}

/** The double is structural, not a real Prisma client; the cast is the point. */
type FakeDb = ReturnType<typeof db>;
const asDb = (d: FakeDb) => d as unknown as Parameters<typeof assertPlayAllowedOn>[0];

const OPEN = {
  dailyCoinCap: null,
  selfExcludedUntil: null,
  coolOffUntil: null,
  pendingCap: null,
  pendingCapAt: null,
};

async function refusal(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error('expected the stake to be refused, but it was allowed');
}

describe('assertPlayAllowedOn', () => {
  it('allows a member with no row at all', async () => {
    await expect(assertPlayAllowedOn(asDb(db(null)), 'u1', 100, NOW)).resolves.toBeUndefined();
  });

  it('allows a member whose limits are all open', async () => {
    await expect(assertPlayAllowedOn(asDb(db({ ...OPEN })), 'u1', 100, NOW)).resolves.toBeUndefined();
  });

  it('does not sum the day when there is no cap to compare it to', async () => {
    const client = db({ ...OPEN });
    await assertPlayAllowedOn(asDb(client), 'u1', 100, NOW);
    expect(client.coinTransaction.aggregate).not.toHaveBeenCalled();
  });

  it('refuses a self-excluded member', async () => {
    const err = await refusal(
      assertPlayAllowedOn(
        asDb(db({ ...OPEN, selfExcludedUntil: new Date(NOW.getTime() + DAY) })),
        'u1',
        1,
        NOW,
      ),
    );
    expect(err.code).toBe('SELF_EXCLUDED');
    expect(err.status).toBe(403);
  });

  it('refuses a member mid cool-off', async () => {
    const err = await refusal(
      assertPlayAllowedOn(asDb(db({ ...OPEN, coolOffUntil: new Date(NOW.getTime() + DAY) })), 'u1', 1, NOW),
    );
    expect(err.code).toBe('COOL_OFF_ACTIVE');
  });

  it('lets an expired exclusion through', async () => {
    await expect(
      assertPlayAllowedOn(
        asDb(db({ ...OPEN, selfExcludedUntil: new Date(NOW.getTime() - 1) })),
        'u1',
        100,
        NOW,
      ),
    ).resolves.toBeUndefined();
  });

  it('allows a stake that fits inside the cap', async () => {
    await expect(
      assertPlayAllowedOn(asDb(db({ ...OPEN, dailyCoinCap: 500 }, 400)), 'u1', 100, NOW),
    ).resolves.toBeUndefined();
  });

  it('refuses the stake that would cross the cap, counting what is already staked', async () => {
    const err = await refusal(
      assertPlayAllowedOn(asDb(db({ ...OPEN, dailyCoinCap: 500 }, 400)), 'u1', 101, NOW),
    );
    expect(err.code).toBe('STAKE_LIMIT_REACHED');
    expect(err.detail).toEqual({ cap: 500, staked: 400, remaining: 100 });
  });

  it('enforces a matured pending loosening without waiting for it to be written', async () => {
    // The row still says 500; the pending 5000 matured an hour ago and nobody
    // has opened the settings page to settle it. Enforcement must use 5000.
    const row = {
      ...OPEN,
      dailyCoinCap: 500,
      pendingCap: 5000,
      pendingCapAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    };
    await expect(assertPlayAllowedOn(asDb(db(row, 400)), 'u1', 1000, NOW)).resolves.toBeUndefined();
  });

  it('does not let an unmatured loosening through early', async () => {
    const row = {
      ...OPEN,
      dailyCoinCap: 500,
      pendingCap: 5000,
      pendingCapAt: new Date(NOW.getTime() + 60 * 60 * 1000),
    };
    const err = await refusal(assertPlayAllowedOn(asDb(db(row, 400)), 'u1', 1000, NOW));
    expect(err.code).toBe('STAKE_LIMIT_REACHED');
  });
});

describe('debitCoinsOn only consults limits for a WAGER', () => {
  /**
   * Rather than stand up a Prisma double deep enough to run a real debit, this
   * asserts the branch directly against the module's source: the guard must be
   * called, and must be called behind a `type === 'WAGER'` test. A future edit
   * that widens it to every debit fails here, which is the regression worth
   * catching — it would silently block shop purchases for excluded members.
   */
  it('guards the debit path behind the WAGER classification', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(
      new URL('../economy/ledger-core.ts', import.meta.url),
      'utf8',
    );
    expect(src).toContain("if (opts.type === 'WAGER') await assertPlayAllowedOn(db, userId, amount);");
  });

  it('does not guard the credit path — a payout is always allowed', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../economy/ledger-core.ts', import.meta.url), 'utf8');
    const creditBody = src.slice(src.indexOf('function creditInner'), src.indexOf('export async function debitCoinsOn'));
    expect(creditBody).not.toContain('assertPlayAllowedOn');
  });
});
