import { describe, expect, it } from 'vitest';
import { amortize, levelPayment, validateLoan, yearlyTotals } from '@/lib/toolbox/loan';

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

describe('amortize', () => {
  it('matches the standard 30-year mortgage payment', () => {
    // $200,000 at 6% for 360 months: $1,199.10 a month.
    const r = amortize({ principal: 200_000, annualRatePercent: 6, months: 360 });
    expect(r.monthlyPayment).toBe(1199.1);
    expect(r.payoffMonths).toBe(360);
    expect(r.schedule[0]).toEqual({ period: 1, payment: 1199.1, principal: 199.1, interest: 1000, balance: 199800.9 });
  });

  it('adds up exactly: principal sums to the loan and the balance ends at zero', () => {
    const r = amortize({ principal: 12_345.67, annualRatePercent: 7.25, months: 47 });
    expect(sum(r.schedule.map((row) => row.principal))).toBe(12_345.67);
    expect(r.schedule.at(-1)?.balance).toBe(0);
    expect(sum(r.schedule.map((row) => row.payment))).toBe(r.totalPaid);
    expect(Math.round((r.totalPaid - 12_345.67) * 100) / 100).toBe(r.totalInterest);
  });

  it('divides evenly at zero interest', () => {
    const r = amortize({ principal: 1200, annualRatePercent: 0, months: 12 });
    expect(r.monthlyPayment).toBe(100);
    expect(r.totalInterest).toBe(0);
    expect(r.payoffMonths).toBe(12);
  });

  it('pays off sooner and costs less with an extra payment', () => {
    const base = amortize({ principal: 200_000, annualRatePercent: 6, months: 360 });
    const extra = amortize({ principal: 200_000, annualRatePercent: 6, months: 360, extraMonthly: 200 });
    expect(extra.payoffMonths).toBeLessThan(base.payoffMonths);
    expect(extra.totalInterest).toBeLessThan(base.totalInterest);
    expect(extra.schedule.at(-1)?.balance).toBe(0);
  });

  it('rolls months into years', () => {
    const r = amortize({ principal: 10_000, annualRatePercent: 5, months: 24 });
    const years = yearlyTotals(r.schedule);
    expect(years).toHaveLength(2);
    expect(sum(years.map((y) => y.principal))).toBe(10_000);
    expect(years[1]?.balance).toBe(0);
  });
});

describe('levelPayment', () => {
  it('is principal over months at zero rate', () => {
    expect(levelPayment(600, 0, 6)).toBe(100);
  });
});

describe('validateLoan', () => {
  it('names the first bad field', () => {
    expect(validateLoan({ principal: 0, annualRatePercent: 5, months: 12 })).toBe('principal');
    expect(validateLoan({ principal: 1, annualRatePercent: -1, months: 12 })).toBe('rate');
    expect(validateLoan({ principal: 1, annualRatePercent: 5, months: 0.5 })).toBe('months');
    expect(validateLoan({ principal: 1, annualRatePercent: 5, months: 12, extraMonthly: -5 })).toBe('extra');
    expect(validateLoan({ principal: 1, annualRatePercent: 5, months: 12 })).toBe('ok');
  });
});
