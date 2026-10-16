import { describe, expect, it } from 'vitest';
import { extractPay, formatPay, parsePay } from './pay';

describe('parsePay', () => {
  it('annualizes hourly, monthly and yearly figures', () => {
    expect(parsePay('$45/hr')).toEqual({
      currency: 'USD',
      period: 'hour',
      minAnnual: 93_600,
      maxAnnual: 93_600,
    });
    expect(parsePay('£3,000 a month')).toMatchObject({
      currency: 'GBP',
      period: 'month',
      minAnnual: 36_000,
    });
    expect(parsePay('$8,500/mo stipend')).toMatchObject({ period: 'month', maxAnnual: 102_000 });
    expect(parsePay('$80K – $95K')).toMatchObject({
      period: 'year',
      minAnnual: 80_000,
      maxAnnual: 95_000,
    });
    expect(parsePay('USD 120,000-140,000 per year')).toMatchObject({
      currency: 'USD',
      minAnnual: 120_000,
      maxAnnual: 140_000,
    });
  });

  it('refuses when there is nothing to read', () => {
    expect(parsePay('Competitive')).toBeNull();
    expect(parsePay('')).toBeNull();
    expect(parsePay(null)).toBeNull();
    expect(parsePay('$3')).toBeNull();
  });
});

describe('extractPay', () => {
  it('finds base pay inside posting prose', () => {
    expect(
      extractPay(
        'The base salary range for this role is $80,000 - $95,000 per year plus benefits.',
      ),
    ).toMatchObject({ minAnnual: 80_000, maxAnnual: 95_000 });
    expect(extractPay('Interns earn $45/hr.')).toMatchObject({ period: 'hour', maxAnnual: 93_600 });
    expect(extractPay('Pay: $80-95K')).toMatchObject({ minAnnual: 80_000, maxAnnual: 95_000 });
  });

  it('does not mistake other money for pay', () => {
    expect(extractPay('We manage $2.5 billion in assets.')).toBeNull();
    expect(extractPay('A $5,000 sign-on bonus and $1,500 relocation.')).toBeNull();
    expect(extractPay('Enjoy a $50 gift card at onboarding.')).toBeNull();
    expect(extractPay(null)).toBeNull();
  });

  it('skips a bonus to find the real range', () => {
    expect(
      extractPay('Sign-on bonus of $5,000 per year. Salary: $90,000 - $100,000 annually.'),
    ).toMatchObject({ minAnnual: 90_000 });
  });
});

describe('formatPay', () => {
  it('prints whole-thousand shorthand', () => {
    expect(formatPay({ currency: 'USD', minAnnual: 96_000, maxAnnual: 96_000 })).toBe('≈ $96k/yr');
    expect(formatPay({ currency: 'USD', minAnnual: 80_000, maxAnnual: 95_000 })).toBe(
      '≈ $80k–$95k/yr',
    );
    expect(formatPay({ currency: 'CHF', minAnnual: 90_000, maxAnnual: 90_000 })).toBe(
      '≈ CHF 90k/yr',
    );
  });
});
