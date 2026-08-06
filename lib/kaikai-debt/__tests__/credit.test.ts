import { describe, it, expect } from 'vitest';
import { DEBT_EPOCH_MS } from '@/lib/kaikai-debt/debt';
import {
  CREDIT_MAX,
  CREDIT_MIN,
  CREDIT_WINDOWS,
  bandRange,
  bandTrack,
  creditAnchor,
  creditBand,
  creditFactors,
  creditScoreAt,
  creditStats,
  sampleCredit,
  type CreditInputs,
} from '@/lib/kaikai-debt/credit';

const YEAR_MS = 365.2425 * 24 * 3_600_000;

/** A ledger with a few thousand dollars on it and two years of history. */
const INPUTS: CreditInputs = {
  basisCents: 250_000,
  principalCents: 180_000,
  entryCount: 4_200,
  memberEntryCount: 90,
  oldestMs: DEBT_EPOCH_MS - 2 * YEAR_MS,
  categoriesUsed: 6,
};

const T0 = DEBT_EPOCH_MS + YEAR_MS;

describe('the score is a pure function of the clock', () => {
  it('returns the same value for the same instant, every time', () => {
    // This is the whole premise: SSR and the hydrating client evaluate the same
    // function at the same instant and must produce the same string, or React
    // throws away and re-renders the entire subtree.
    const a = creditScoreAt(INPUTS, T0);
    const b = creditScoreAt(INPUTS, T0);
    expect(a).toBe(b);
  });

  it('gives every viewer the same number — there is no per-session seed', () => {
    // Two "sessions" are just two calls; if a seed had crept in, these would
    // differ.
    const first = sampleCredit(INPUTS, T0 - 10_000, T0, 32);
    const second = sampleCredit(INPUTS, T0 - 10_000, T0, 32);
    expect(first.map((s) => s.score)).toEqual(second.map((s) => s.score));
  });

  it('stays inside the scale at every instant', () => {
    for (let i = 0; i < 4_000; i++) {
      const score = creditScoreAt(INPUTS, T0 + i * 137, { volatility: 3 });
      expect(score).toBeGreaterThanOrEqual(CREDIT_MIN);
      expect(score).toBeLessThanOrEqual(CREDIT_MAX);
    }
  });

  it('holds still when the volatility is turned all the way off', () => {
    const a = creditScoreAt(INPUTS, T0, { volatility: 0 });
    const b = creditScoreAt(INPUTS, T0 + 5_000, { volatility: 0 });
    // Not exactly equal — the anchor itself drifts as the balance compounds —
    // but the fast layer is gone entirely.
    expect(Math.abs(a - b)).toBeLessThan(1);
  });

  it('is genuinely volatile at the shipped setting', () => {
    // "Super volatile" as an assertion rather than an adjective: over ten
    // seconds the readout must move by tens of points, not by a fraction of one.
    const samples = sampleCredit(INPUTS, T0, T0 + 10_000, 200);
    const { min, max, stdev } = creditStats(samples);
    expect(max - min).toBeGreaterThan(60);
    expect(stdev).toBeGreaterThan(15);
  });

  it('gets more volatile when the stress test is turned up', () => {
    const calm = creditStats(sampleCredit(INPUTS, T0, T0 + 20_000, 300, { volatility: 0.25 }));
    const wild = creditStats(sampleCredit(INPUTS, T0, T0 + 20_000, 300, { volatility: 3 }));
    expect(wild.stdev).toBeGreaterThan(calm.stdev);
  });

  it('does not repeat on any timescale a viewer will watch', () => {
    // The wave periods are deliberately incommensurate. If they were multiples
    // of each other the readout would visibly loop.
    const a = sampleCredit(INPUTS, T0, T0 + 30_000, 120).map((s) => s.score);
    const b = sampleCredit(INPUTS, T0 + 30_000, T0 + 60_000, 120).map((s) => s.score);
    expect(a).not.toEqual(b);
  });
});

describe('the anchor is the actual ledger', () => {
  it('falls when the debt rises', () => {
    const light = creditAnchor({ ...INPUTS, basisCents: 1_000 }, T0);
    const heavy = creditAnchor({ ...INPUTS, basisCents: 10_000_000 }, T0);
    expect(heavy).toBeLessThan(light);
  });

  it('falls as the balance compounds, with the history length held fixed', () => {
    const now = creditAnchor(INPUTS, T0);
    // The oldest row moves with the clock, so this isolates the compounding
    // from the length-of-history factor below.
    const later = creditAnchor({ ...INPUTS, oldestMs: INPUTS.oldestMs + YEAR_MS }, T0 + YEAR_MS);
    expect(later).toBeLessThan(now);
  });

  it('lets length of history be the only thing that ever gives points back', () => {
    // Not a defect — the documented consequence of the model. Utilisation falls
    // off as 1/(1+u), so once the ratio is catastrophic further debt barely
    // moves it, while the history keeps lengthening at one year per year. The
    // only thing improving Kaikai's credit is that he continues to exist.
    const now = creditAnchor(INPUTS, T0);
    const aDecadeOn = creditAnchor(INPUTS, T0 + 6 * YEAR_MS);
    expect(aDecadeOn).toBeGreaterThan(now);
    // …and it must never claw its way out of the bottom band, because
    // utilisation has already taken almost everything there is to take.
    expect(creditBand(aDecadeOn)).toBe('ruinous');
  });

  it('never reaches a perfect score, however good the other factors are', () => {
    const best = creditAnchor(
      { ...INPUTS, basisCents: 1, memberEntryCount: 0, categoriesUsed: 8, oldestMs: 0 },
      T0,
    );
    // Payment history is a hard zero — there is no repayment path in the system
    // at all — so 35% of the scale is unreachable by construction.
    expect(best).toBeLessThan(CREDIT_MAX - 0.34 * (CREDIT_MAX - CREDIT_MIN));
  });
});

describe('factors', () => {
  const factors = creditFactors(INPUTS, T0);

  it('carries all five, weighted to one', () => {
    expect(factors).toHaveLength(5);
    expect(factors.reduce((sum, f) => sum + f.weight, 0)).toBeCloseTo(1, 9);
  });

  it('reports payment history as exactly zero, because it is', () => {
    expect(factors.find((f) => f.id === 'payment')!.health).toBe(0);
  });

  it('keeps every health inside [0, 1]', () => {
    for (const factor of factors) {
      expect(factor.health).toBeGreaterThanOrEqual(0);
      expect(factor.health).toBeLessThanOrEqual(1);
    }
  });

  it('never lets utilisation health reach zero, however bad the ratio', () => {
    // A reciprocal falloff: an infinitely bad ratio is still worse than a merely
    // terrible one, so the bar keeps moving as the debt compounds.
    const wrecked = creditFactors({ ...INPUTS, basisCents: 1e12 }, T0);
    const utilisation = wrecked.find((f) => f.id === 'utilization')!;
    expect(utilisation.health).toBeGreaterThan(0);
    expect(utilisation.health).toBeLessThan(0.001);
  });

  it('penalises exactly the missing share of each factor’s weight', () => {
    const span = 850 - CREDIT_MIN;
    for (const factor of factors) {
      expect(factor.penaltyPoints).toBeCloseTo((1 - factor.health) * factor.weight * span, 9);
    }
  });
});

describe('bands', () => {
  it('covers the whole scale with no gaps', () => {
    const track = bandTrack();
    const sorted = [...track].sort((a, b) => a.from - b.from);
    expect(sorted[0]!.from).toBe(CREDIT_MIN);
    expect(sorted.at(-1)!.to).toBe(CREDIT_MAX);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.from).toBe(sorted[i - 1]!.to);
    }
  });

  it('classifies a score into the band whose range contains it', () => {
    for (const score of [300, 479, 480, 579, 580, 669, 670, 799, 800, 850]) {
      const band = creditBand(score);
      const range = bandRange(band);
      expect(score).toBeGreaterThanOrEqual(range.from);
      expect(score).toBeLessThanOrEqual(range.to);
    }
  });

  it('bottoms out at ruinous', () => {
    expect(creditBand(CREDIT_MIN)).toBe('ruinous');
    expect(creditBand(-500)).toBe('ruinous');
  });
});

describe('sampling', () => {
  it('returns count + 1 samples spanning the window inclusively', () => {
    const samples = sampleCredit(INPUTS, T0, T0 + 60_000, 60);
    expect(samples).toHaveLength(61);
    expect(samples[0]!.atMs).toBe(T0);
    expect(samples.at(-1)!.atMs).toBe(T0 + 60_000);
  });

  it('lets the chart be complete on its first frame', () => {
    // The point of a pure model: history is computed, not accumulated, so the
    // one-hour window is populated immediately rather than in an hour.
    const samples = sampleCredit(INPUTS, T0 - CREDIT_WINDOWS[3], T0, 240);
    expect(samples).toHaveLength(241);
    expect(samples.every((s) => Number.isFinite(s.score))).toBe(true);
  });

  it('summarises an empty window without dividing by zero', () => {
    expect(creditStats([])).toEqual({ min: 0, max: 0, mean: 0, stdev: 0 });
  });
});
