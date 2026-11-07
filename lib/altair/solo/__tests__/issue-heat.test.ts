// Issuing a run at a Heat tier: the tier must be one the SERVER's ledger says the account has earned.
// A tier above it is refused; Heat 0 never touches the ledger and keeps the exact loadout shape.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ledger = { max: null as number | null, queries: 0 };
const created: { data: Record<string, unknown> }[] = [];

vi.mock('@/lib/prisma.server', () => {
  const tx = {
    altairSoloRun: {
      updateMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args);
        return { id: 'run-1', seed: 123, expiresAt: new Date('2026-01-01T03:00:00Z') };
      }),
    },
  };
  return {
    prisma: {
      altairMetaProgress: {
        findUnique: vi.fn(async () => ({ upgrades: {}, doubleTimeUnlocked: false })),
      },
      $queryRaw: vi.fn(async () => {
        ledger.queries++;
        return [{ max: ledger.max }];
      }),
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

import { issueSoloRun } from '../issue.server';
import { maxUnlockedHeat } from '../heat.server';
import { HEAT_MAX } from '../../data/heat';

beforeEach(() => {
  ledger.max = null;
  ledger.queries = 0;
  created.length = 0;
});

describe('maxUnlockedHeat', () => {
  it('is 0 for an account with no verified victory', async () => {
    expect(await maxUnlockedHeat('u')).toBe(0);
  });
  it('is one above the highest cleared tier', async () => {
    ledger.max = 0;
    expect(await maxUnlockedHeat('u')).toBe(1);
    ledger.max = 4;
    expect(await maxUnlockedHeat('u')).toBe(5);
  });
  it('is capped at the top tier', async () => {
    ledger.max = HEAT_MAX;
    expect(await maxUnlockedHeat('u')).toBe(HEAT_MAX);
  });
});

describe('issueSoloRun with Heat', () => {
  it('a standard run never reads the ledger and carries no heat in its loadout', async () => {
    const out = await issueSoloRun('u', 'knight', false);
    expect(out.ok).toBe(true);
    expect(ledger.queries).toBe(0);
    if (out.ok) expect(out.run.loadout).not.toHaveProperty('heat');
  });

  it('refuses a tier the account has not unlocked', async () => {
    ledger.max = null;
    expect(await issueSoloRun('u', 'knight', false, 1)).toEqual({
      ok: false,
      error: 'Heat tier not unlocked',
    });
    ledger.max = 1; // cleared tier 1 -> tiers up to 2 are open
    expect(await issueSoloRun('u', 'knight', false, 3)).toEqual({
      ok: false,
      error: 'Heat tier not unlocked',
    });
    expect(created).toHaveLength(0);
  });

  it('issues a tier the ledger has earned, with the tier in the stored and returned loadout', async () => {
    ledger.max = 2;
    const out = await issueSoloRun('u', 'knight', false, 3);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.run.loadout).toMatchObject({ heat: 3 });
    expect((created[0].data.loadout as { heat?: number }).heat).toBe(3);
  });

  it('refuses a malformed or out-of-range tier before looking anything up', async () => {
    for (const bad of [-1, 1.5, HEAT_MAX + 1, Number.NaN]) {
      expect(await issueSoloRun('u', 'knight', false, bad)).toEqual({
        ok: false,
        error: 'Unknown Heat tier',
      });
    }
    expect(ledger.queries).toBe(0);
  });
});
