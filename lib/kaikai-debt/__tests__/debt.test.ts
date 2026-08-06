/**
 * The debt counter's arithmetic.
 *
 * Everything under test here is pure, and all of it is load-bearing in a way
 * that fails *silently* if it drifts:
 *
 *  - The **basis factorisation** is the only reason the client can draw an exact
 *    total without holding the ledger. If `basisContribution` and
 *    `accrualFactor` ever stop being inverses, the counter is still smooth, still
 *    plausible, and quietly wrong — there is no symptom to notice.
 *  - **Monotonicity** is the difference between a debt clock and a bug report.
 *  - The **amount distribution** is the joke. A change that pushes the median
 *    from $8 to $120 does not break anything; it just stops being funny, which
 *    no other check in the repo would catch.
 *
 * None of this touches Prisma, the network, or a model.
 */

import { describe, expect, it } from 'vitest';
import {
  ANNUAL_INTEREST_RATE,
  DEBT_EPOCH_MS,
  MAX_ENTRY_CENTS,
  MIN_ENTRY_CENTS,
  SEED_DEBT_CENTS,
  accrualFactor,
  basisContribution,
  clampEntryCents,
  debtVelocityCentsPerSecond,
  entryValueCents,
  formatDebt,
  isDebtCategory,
  projectDebtCents,
  sampleDebtCents,
  secondsSinceEpoch,
} from '@/lib/kaikai-debt/debt';

const YEAR_MS = 365.2425 * 24 * 60 * 60 * 1000;

/** A deterministic stand-in for `Math.random`, cycling a fixed low-discrepancy set. */
function seededRandom(seed = 1): () => number {
  let state = seed;
  return () => {
    // xorshift32 — reproducible across runs and platforms, unlike Math.random.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

describe('secondsSinceEpoch', () => {
  it('is zero at the epoch', () => {
    expect(secondsSinceEpoch(DEBT_EPOCH_MS)).toBe(0);
  });

  it('floors at zero before the epoch', () => {
    // The floor is what gives back-dated generated receipts a factor of exactly
    // 1. Without it they would be inflated by reverse compounding, and one page
    // of scrolling would add more to the counter than the entire opening
    // balance.
    expect(secondsSinceEpoch(DEBT_EPOCH_MS - 10 * YEAR_MS)).toBe(0);
  });

  it('counts forward in seconds', () => {
    expect(secondsSinceEpoch(DEBT_EPOCH_MS + 90_000)).toBe(90);
  });
});

describe('accrualFactor', () => {
  it('is 1 at the epoch', () => {
    expect(accrualFactor(DEBT_EPOCH_MS)).toBe(1);
  });

  it('is e^r after one year', () => {
    expect(accrualFactor(DEBT_EPOCH_MS + YEAR_MS)).toBeCloseTo(Math.exp(ANNUAL_INTEREST_RATE), 6);
  });

  it('is 1 for any pre-epoch instant', () => {
    expect(accrualFactor(DEBT_EPOCH_MS - YEAR_MS)).toBe(1);
  });
});

describe('the basis factorisation', () => {
  /**
   * The whole architecture rests on this identity. If it holds, the server can
   * collapse an unbounded ledger into one scalar and the client can expand it
   * back exactly; if it does not, every number on the page is subtly off.
   */
  it('round-trips an entry to its own face value at its own timestamp', () => {
    const at = DEBT_EPOCH_MS + 0.37 * YEAR_MS;
    const contribution = basisContribution(1234, at);
    expect(contribution * accrualFactor(at)).toBeCloseTo(1234, 6);
  });

  it('matches a term-by-term sum of exponentials', () => {
    const entries = [
      { cents: 500, at: DEBT_EPOCH_MS },
      { cents: 2500, at: DEBT_EPOCH_MS + 0.2 * YEAR_MS },
      { cents: 800, at: DEBT_EPOCH_MS + 0.55 * YEAR_MS },
      // A pre-epoch receipt, the shape the infinite scroll generates.
      { cents: 1500, at: DEBT_EPOCH_MS - 3 * YEAR_MS },
    ];
    const now = DEBT_EPOCH_MS + 1.4 * YEAR_MS;

    const direct = entries.reduce((sum, e) => sum + entryValueCents(e.cents, e.at, now), 0);
    const viaBasis =
      entries.reduce((sum, e) => sum + basisContribution(e.cents, e.at), 0) * accrualFactor(now);

    expect(viaBasis).toBeCloseTo(direct, 6);
  });

  it('lets a new entry be folded in with a single addition', () => {
    // This is exactly what the SSE handler does: `basis += contribution(entry)`.
    const now = DEBT_EPOCH_MS + 0.5 * YEAR_MS;
    const before = basisContribution(1000, DEBT_EPOCH_MS);
    const after = before + basisContribution(700, now);

    expect(projectDebtCents(after, now)).toBeCloseTo(projectDebtCents(before, now) + 700, 6);
  });
});

describe('projectDebtCents', () => {
  it('returns the basis unchanged at the epoch', () => {
    expect(projectDebtCents(SEED_DEBT_CENTS, DEBT_EPOCH_MS)).toBeCloseTo(SEED_DEBT_CENTS, 6);
  });

  it('never decreases as time moves forward', () => {
    // A debt clock that ticks backwards is not a joke, it is a defect report.
    let previous = -Infinity;
    for (let i = 0; i <= 400; i++) {
      const value = projectDebtCents(SEED_DEBT_CENTS, DEBT_EPOCH_MS + i * 0.01 * YEAR_MS);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('holds flat rather than shrinking for a client whose clock is set early', () => {
    const early = projectDebtCents(SEED_DEBT_CENTS, DEBT_EPOCH_MS - YEAR_MS);
    expect(early).toBeCloseTo(SEED_DEBT_CENTS, 6);
  });

  it('multiplies by about 3.5 a year at the shipped rate', () => {
    const start = projectDebtCents(SEED_DEBT_CENTS, DEBT_EPOCH_MS);
    const end = projectDebtCents(SEED_DEBT_CENTS, DEBT_EPOCH_MS + YEAR_MS);
    expect(end / start).toBeCloseTo(Math.exp(ANNUAL_INTEREST_RATE), 4);
  });
});

describe('debtVelocityCentsPerSecond', () => {
  it('is the derivative of the projection', () => {
    const at = DEBT_EPOCH_MS + 0.6 * YEAR_MS;
    const dt = 0.001 * YEAR_MS;
    const numeric =
      (projectDebtCents(SEED_DEBT_CENTS, at + dt) - projectDebtCents(SEED_DEBT_CENTS, at)) /
      (dt / 1000);
    expect(debtVelocityCentsPerSecond(SEED_DEBT_CENTS, at)).toBeCloseTo(numeric, 1);
  });

  it('moves the cents column several times a second at the opening balance', () => {
    // The page's core claim is that interest ALONE makes the digits roll. If
    // this drops below ~1, the counter reads as frozen and the temptation to
    // bolt on a fake per-second drip comes back.
    const rate = debtVelocityCentsPerSecond(SEED_DEBT_CENTS, DEBT_EPOCH_MS);
    expect(rate).toBeGreaterThan(1);
  });
});

describe('sampleDebtCents', () => {
  const random = seededRandom(0xc0ffee);
  const draws = Array.from({ length: 20_000 }, () => sampleDebtCents(random));
  const sorted = [...draws].sort((a, b) => a - b);
  const quantile = (q: number) => sorted[Math.floor(q * (sorted.length - 1))]!;

  it('stays inside the $5–$250 band', () => {
    expect(sorted[0]).toBeGreaterThanOrEqual(MIN_ENTRY_CENTS);
    expect(sorted[sorted.length - 1]).toBeLessThanOrEqual(MAX_ENTRY_CENTS);
  });

  it('returns whole cents', () => {
    expect(draws.every(Number.isInteger)).toBe(true);
  });

  it('clusters near the $5 floor', () => {
    // "More around $5" as an executable statement: the median is a snack, and
    // three quarters of everything he owes is under twenty dollars.
    expect(quantile(0.5)).toBeLessThan(1500);
    expect(quantile(0.75)).toBeLessThan(3000);
  });

  it('still reaches the top of the band occasionally', () => {
    // A distribution that never produces a big one is not skewed, it is capped.
    expect(quantile(0.999)).toBeGreaterThan(15_000);
  });

  it('is reproducible for a given seed', () => {
    expect(Array.from({ length: 5 }, () => sampleDebtCents(seededRandom(7)))).toEqual(
      Array.from({ length: 5 }, () => sampleDebtCents(seededRandom(7))),
    );
  });
});

describe('clampEntryCents', () => {
  it.each([
    [0, MIN_ENTRY_CENTS],
    [-9000, MIN_ENTRY_CENTS],
    [1_000_000_000, MAX_ENTRY_CENTS],
    [1234.6, 1235],
  ])('clamps %s to %s', (input, expected) => {
    expect(clampEntryCents(input)).toBe(expected);
  });

  it('floors EVERY non-finite amount to the minimum, including Infinity', () => {
    // The model supplies this number, so non-finite means "the appraisal came
    // back garbage". Infinity clamping to MAX would be the tidier reading of
    // "clamp", and it is the wrong one: garbage would then buy the largest
    // entry the ledger allows. The conservative direction is the floor, and it
    // is the same answer for every non-finite input — `NaN`, `Infinity`, and a
    // string the model quoted that coerced badly.
    expect(clampEntryCents(Number.NaN)).toBe(MIN_ENTRY_CENTS);
    expect(clampEntryCents(Number.POSITIVE_INFINITY)).toBe(MIN_ENTRY_CENTS);
    expect(clampEntryCents(Number.NEGATIVE_INFINITY)).toBe(MIN_ENTRY_CENTS);
  });
});

describe('formatDebt', () => {
  it.each([
    [0, '$0.00'],
    [500, '$5.00'],
    [123_456, '$1,234.56'],
    [100_000_000, '$1,000,000.00'],
  ])('formats %s cents as %s', (cents, expected) => {
    expect(formatDebt(cents)).toBe(expected);
  });

  it('always renders exactly two decimals, so the odometer never changes width', () => {
    expect(formatDebt(1234.987)).toBe('$12.35');
    expect(formatDebt(1000)).toBe('$10.00');
  });
});

describe('isDebtCategory', () => {
  it('accepts a known category', () => {
    expect(isDebtCategory('food')).toBe(true);
  });

  it('rejects anything else, including near-misses from the model', () => {
    for (const value of ['snacks', '', null, undefined, 42, 'FOOD']) {
      expect(isDebtCategory(value)).toBe(false);
    }
  });
});
