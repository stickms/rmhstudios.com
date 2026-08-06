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
  MAX_RECEIPT_CENTS,
  MAX_STORABLE_CENTS,
  MIN_ENTRY_CENTS,
  MIN_RECEIPT_CENTS,
  SEED_DEBT_CENTS,
  accrualFactor,
  basisContribution,
  clampEntryCents,
  debtVelocityCentsPerSecond,
  describeVelocity,
  entryValueCents,
  formatDebt,
  formatMicroDigits,
  isDebtCategory,
  odometerDecimals,
  projectDebtCents,
  sampleDebtCents,
  secondsSinceEpoch,
} from '@/lib/kaikai-debt/debt';

/** A ledger with `dollars` logged at the epoch — the shape most assertions want. */
const basisOf = (dollars: number) => dollars * 100;

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

describe('the opening balance', () => {
  it('is zero — he starts clean', () => {
    // Every cent the counter shows must be traceable to a row in the log. A
    // non-zero seed would be debt nobody can account for.
    expect(SEED_DEBT_CENTS).toBe(0);
  });

  it('means an empty ledger stays at exactly zero, forever', () => {
    // Not an edge case to tolerate — the launch-day state of the page. Nothing
    // logged, nothing accruing, and no drip quietly inventing a balance.
    for (const years of [0, 0.5, 5, 100]) {
      expect(projectDebtCents(SEED_DEBT_CENTS, DEBT_EPOCH_MS + years * YEAR_MS)).toBe(0);
    }
    expect(debtVelocityCentsPerSecond(SEED_DEBT_CENTS, DEBT_EPOCH_MS + YEAR_MS)).toBe(0);
  });
});

describe('projectDebtCents', () => {
  it('returns the basis unchanged at the epoch', () => {
    expect(projectDebtCents(basisOf(500), DEBT_EPOCH_MS)).toBeCloseTo(50_000, 6);
  });

  it('never decreases as time moves forward', () => {
    // A debt clock that ticks backwards is not a joke, it is a defect report.
    let previous = -Infinity;
    for (let i = 0; i <= 400; i++) {
      const value = projectDebtCents(basisOf(500), DEBT_EPOCH_MS + i * 0.01 * YEAR_MS);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('holds flat rather than shrinking for a client whose clock is set early', () => {
    expect(projectDebtCents(basisOf(500), DEBT_EPOCH_MS - YEAR_MS)).toBeCloseTo(50_000, 6);
  });

  it('multiplies by about 3.5 a year at the shipped rate', () => {
    const start = projectDebtCents(basisOf(500), DEBT_EPOCH_MS);
    const end = projectDebtCents(basisOf(500), DEBT_EPOCH_MS + YEAR_MS);
    expect(end / start).toBeCloseTo(Math.exp(ANNUAL_INTEREST_RATE), 4);
  });
});

describe('debtVelocityCentsPerSecond', () => {
  it('is the derivative of the projection', () => {
    const basis = basisOf(500);
    const at = DEBT_EPOCH_MS + 0.6 * YEAR_MS;
    const dt = 0.001 * YEAR_MS;
    const numeric = (projectDebtCents(basis, at + dt) - projectDebtCents(basis, at)) / (dt / 1000);
    expect(debtVelocityCentsPerSecond(basis, at)).toBeCloseTo(numeric, 3);
  });
});

describe('odometerDecimals', () => {
  it('shows no sub-cent digits when nothing is accruing', () => {
    // `$0.000000` would be pretending a dead counter is alive.
    expect(odometerDecimals(0)).toBe(0);
    expect(odometerDecimals(Number.NaN)).toBe(0);
  });

  it('keeps the last digit turning across five orders of magnitude', () => {
    // The property that matters, asserted directly rather than by pinning digit
    // counts: at every realistic size of the pile, the displayed resolution is
    // fine enough that the final column actually moves.
    for (const dollars of [20, 200, 2_000, 50_000, 2_000_000]) {
      const cents = dollars * 100;
      const digits = odometerDecimals(cents);
      const perSecond = (cents * ANNUAL_INTEREST_RATE) / (365.2425 * 24 * 60 * 60);
      const ticksPerSecond = perSecond * 10 ** digits;
      expect(ticksPerSecond).toBeGreaterThan(0.5);
    }
  });

  it('drops precision as the pile grows, never adds it', () => {
    // Monotonic, so the readout's width only ever shrinks — one column at a
    // time — and never oscillates between two lengths.
    let previous = Infinity;
    for (const dollars of [10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000]) {
      const digits = odometerDecimals(dollars * 100);
      expect(digits).toBeLessThanOrEqual(previous);
      previous = digits;
    }
  });

  it('never asks for more columns than the display can carry', () => {
    expect(odometerDecimals(1)).toBeLessThanOrEqual(4);
  });
});

describe('formatMicroDigits', () => {
  it('renders the sub-cent remainder, zero-padded', () => {
    expect(formatMicroDigits(1234.5678, 4)).toBe('5678');
    expect(formatMicroDigits(1234.0071, 4)).toBe('0071');
    expect(formatMicroDigits(1234.5, 2)).toBe('50');
  });

  it('renders nothing when no columns were asked for', () => {
    expect(formatMicroDigits(1234.5678, 0)).toBe('');
  });
});

describe('describeVelocity', () => {
  it('widens the window until the figure has something in it', () => {
    // The launch-day failure this exists to prevent: an honest rate of
    // $0.0000079/s rendering as "+$0.00 every second", which reads as broken
    // rather than as young.
    for (const dollars of [5, 50, 500, 5_000, 500_000]) {
      const { cents, unit } = describeVelocity(basisOf(dollars), DEBT_EPOCH_MS);
      expect(cents).toBeGreaterThanOrEqual(1);
      expect(['second', 'minute', 'hour', 'day']).toContain(unit);
    }
  });

  it('quotes a large pile per second and a small one per day', () => {
    expect(describeVelocity(basisOf(5_000_000), DEBT_EPOCH_MS).unit).toBe('second');
    expect(describeVelocity(basisOf(5), DEBT_EPOCH_MS).unit).toBe('day');
  });

  it('reports a flat zero for an empty ledger rather than widening forever', () => {
    expect(describeVelocity(0, DEBT_EPOCH_MS)).toEqual({ cents: 0, unit: 'second' });
  });
});

describe('sampleDebtCents', () => {
  const random = seededRandom(0xc0ffee);
  const draws = Array.from({ length: 20_000 }, () => sampleDebtCents(random));
  const sorted = [...draws].sort((a, b) => a - b);
  const quantile = (q: number) => sorted[Math.floor(q * (sorted.length - 1))]!;

  it('stays inside the $5–$250 band', () => {
    // The band applies to GENERATED receipts only — the texture of his back
    // history. A debt a real person adds is priced by the appraiser and is not
    // bounded by this (see the clampEntryCents block below).
    expect(sorted[0]).toBeGreaterThanOrEqual(MIN_RECEIPT_CENTS);
    expect(sorted[sorted.length - 1]).toBeLessThanOrEqual(MAX_RECEIPT_CENTS);
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
    [1234.6, 1235],
  ])('clamps %s to %s', (input, expected) => {
    expect(clampEntryCents(input)).toBe(expected);
  });

  it('imposes NO ceiling on what a member can be owed, short of the column', () => {
    // There is deliberately no policy cap: if the appraiser says he owes you a
    // car, he owes you a car. These amounts would all have been flattened to
    // $250 under the old band.
    for (const dollars of [1_000, 50_000, 250_000, 5_000_000]) {
      expect(clampEntryCents(dollars * 100)).toBe(dollars * 100);
    }
  });

  it('saturates at the Int column rather than throwing on insert', () => {
    // The one real ceiling, and it is a storage fact, not an editorial one.
    expect(clampEntryCents(MAX_STORABLE_CENTS + 1)).toBe(MAX_STORABLE_CENTS);
    expect(clampEntryCents(1e30)).toBe(MAX_STORABLE_CENTS);
    expect(MAX_STORABLE_CENTS).toBe(2 ** 31 - 1);
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
