/**
 * RMH Capital's credit assessment.
 *
 * The score is *derived*, which is the whole reason it needs a test: nothing
 * stores it, nothing validates it, and it renders as a plausible three-digit
 * number no matter how wrong it is. A mapping that silently inverted, saturated
 * or drifted out of the 300–850 range would look exactly like a working rating.
 *
 * Three properties carry the feature:
 *
 *  - **The range holds.** It is a borrowed scale; the moment it prints 287 or
 *    912 it stops being the familiar one and becomes a made-up number.
 *  - **It falls as the debt rises, and never the other way.** A rating that ever
 *    ticks up is a rating the page has to explain.
 *  - **The quoted rate matches the number's actual motion.** The prose beside
 *    the readout is derived independently of the digits, so the only thing
 *    keeping them honest is that both come from the same growth model — which is
 *    exactly the kind of coupling that rots without a check.
 */

import { describe, expect, it } from 'vitest';
import {
  CREDIT_DECADE_PENALTY,
  CREDIT_SCORE_MAX,
  CREDIT_SCORE_MIN,
  creditBand,
  creditPointsPerYear,
  creditScore,
  creditScoreDecimals,
  creditVelocityPointsPerSecond,
  formatCreditScore,
  projectCreditScore,
} from '../credit';
import { DEBT_EPOCH_MS, basisContribution, projectDebtCents } from '../debt';

const YEAR_MS = 365.2425 * 24 * 60 * 60 * 1000;

describe('creditScore', () => {
  it('is a clean 850 on an empty ledger', () => {
    expect(creditScore(0)).toBe(CREDIT_SCORE_MAX);
  });

  it('charges one decade penalty per tenfold increase', () => {
    // Measured well above $1, where the `1 +` offset in the mapping has washed
    // out. That offset exists only to keep log10 finite at zero.
    const at10k = creditScore(10_000 * 100);
    const at100k = creditScore(100_000 * 100);
    const at1m = creditScore(1_000_000 * 100);

    expect(at10k - at100k).toBeCloseTo(CREDIT_DECADE_PENALTY, 1);
    expect(at100k - at1m).toBeCloseTo(CREDIT_DECADE_PENALTY, 1);
  });

  it('charges slightly less than a full penalty while the debt is small', () => {
    // The `1 +` offset is not free: at two figures it softens the first decade
    // by a fraction of a point. Asserted rather than ignored, because the
    // alternative reading — that the penalty is exact at every scale — is what
    // the test above would otherwise imply.
    const step = creditScore(10 * 100) - creditScore(100 * 100);
    expect(step).toBeLessThan(CREDIT_DECADE_PENALTY);
    expect(step).toBeGreaterThan(CREDIT_DECADE_PENALTY - 5);
  });

  it('never leaves the borrowed range, at any debt anyone could log', () => {
    const totals = [0, 1, 100, 10_000, 1e6, 1e9, 1e12, 1e18, Number.MAX_SAFE_INTEGER];
    for (const cents of totals) {
      const score = creditScore(cents);
      expect(score).toBeGreaterThanOrEqual(CREDIT_SCORE_MIN);
      expect(score).toBeLessThanOrEqual(CREDIT_SCORE_MAX);
    }
  });

  it('falls monotonically — the rating never improves', () => {
    let previous = Infinity;
    for (let cents = 0; cents < 1e9; cents = cents * 3 + 100) {
      const score = creditScore(cents);
      expect(score).toBeLessThanOrEqual(previous);
      previous = score;
    }
  });

  it('floors a negative total rather than returning NaN', () => {
    // Cannot happen — the counter only grows — but a NaN here would paint the
    // whole readout as garbage rather than failing visibly.
    expect(creditScore(-500)).toBe(CREDIT_SCORE_MAX);
    expect(Number.isNaN(creditScore(Number.NaN))).toBe(false);
  });

  it('pins at the floor once the debt is absurd, instead of going below it', () => {
    expect(creditScore(1e15)).toBe(CREDIT_SCORE_MIN);
  });
});

describe('creditBand', () => {
  it('grades a clean borrower AAA and a bottomed-out one D', () => {
    expect(creditBand(CREDIT_SCORE_MAX).grade).toBe('AAA');
    expect(creditBand(CREDIT_SCORE_MIN).grade).toBe('D');
  });

  it('returns a band for every score in and beyond the range', () => {
    for (let score = 200; score <= 900; score += 7) {
      const band = creditBand(score);
      expect(band.grade).toBeTruthy();
      expect(band.tier).toBeTruthy();
    }
  });

  it('degrades monotonically — a lower score is never a better grade', () => {
    const seen: string[] = [];
    for (let score = CREDIT_SCORE_MAX; score >= CREDIT_SCORE_MIN; score -= 1) {
      const { grade } = creditBand(score);
      if (seen[seen.length - 1] !== grade) seen.push(grade);
    }
    expect(seen).toEqual(['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D']);
  });
});

describe('the live rating', () => {
  /** A basis that puts a round $1,000 on the books at the epoch. */
  const basis = basisContribution(1_000 * 100, DEBT_EPOCH_MS);

  it('agrees with the debt counter it is derived from', () => {
    const at = DEBT_EPOCH_MS + YEAR_MS;
    expect(projectCreditScore(basis, at)).toBe(creditScore(projectDebtCents(basis, at)));
  });

  it('quotes a fall that matches how far the score actually moves in a year', () => {
    const start = DEBT_EPOCH_MS + YEAR_MS;
    const quoted = creditPointsPerYear(basis, start);
    const measured = projectCreditScore(basis, start) - projectCreditScore(basis, start + YEAR_MS);

    // The quote is an instantaneous derivative and the measurement is a whole
    // year of it, so they differ by the curvature over that year — a couple of
    // points out of ~33. Close enough that the prose cannot be quietly wrong,
    // loose enough not to pin the rate to four decimals.
    expect(quoted).toBeGreaterThan(0);
    expect(quoted).toBeCloseTo(measured, 0);
  });

  it('reports a falling rating as a negative velocity', () => {
    expect(creditVelocityPointsPerSecond(basis, DEBT_EPOCH_MS + YEAR_MS)).toBeLessThan(0);
  });

  it('stops quoting a rate once the score is pinned at the floor', () => {
    // Far enough out that the debt is astronomical and the score has bottomed.
    const at = DEBT_EPOCH_MS + 40 * YEAR_MS;
    expect(projectCreditScore(basis, at)).toBe(CREDIT_SCORE_MIN);
    expect(creditVelocityPointsPerSecond(basis, at)).toBe(0);
    expect(creditPointsPerYear(basis, at)).toBe(0);
  });

  it('says nothing is moving on an empty ledger', () => {
    expect(creditVelocityPointsPerSecond(0, DEBT_EPOCH_MS + YEAR_MS)).toBe(0);
    expect(creditScoreDecimals(0, DEBT_EPOCH_MS + YEAR_MS)).toBe(0);
  });
});

describe('creditScoreDecimals', () => {
  it('shows enough precision for the readout to visibly move', () => {
    // The whole point of the tail: a rating that falls ~33 points a year does
    // not change its whole-point digits at a rate anyone could perceive, so
    // without decimals the "live" readout is indistinguishable from a constant.
    const digits = creditScoreDecimals(
      basisContribution(1_000 * 100, DEBT_EPOCH_MS),
      DEBT_EPOCH_MS + YEAR_MS,
    );
    expect(digits).toBeGreaterThan(0);
    expect(digits).toBeLessThanOrEqual(6);
  });

  it('never asks for more columns than the readout can carry', () => {
    for (let years = 0; years < 30; years += 1) {
      const digits = creditScoreDecimals(
        basisContribution(50 * 100, DEBT_EPOCH_MS),
        DEBT_EPOCH_MS + years * YEAR_MS,
      );
      expect(Number.isInteger(digits)).toBe(true);
      expect(digits).toBeGreaterThanOrEqual(0);
      expect(digits).toBeLessThanOrEqual(6);
    }
  });
});

describe('formatCreditScore', () => {
  it('shows whole points, unrounded', () => {
    // Floor, not round: a score of 731.9 is not yet 732, and a rating that
    // rounds UP is one that flatters him.
    expect(formatCreditScore(731.9)).toBe('731');
    expect(formatCreditScore(CREDIT_SCORE_MAX)).toBe('850');
  });
});
