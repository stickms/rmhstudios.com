/**
 * Fixed-rate loan amortization.
 *
 * Money is tracked in whole cents and each period's interest is rounded to the
 * cent, the way a lender's statement is, so the schedule adds up exactly: the
 * principal column sums to the amount borrowed and the last payment is
 * whatever clears the balance.
 */

export interface LoanInput {
  /** Amount borrowed, in currency units. */
  principal: number;
  /** Nominal annual rate, in percent (6.5 for 6.5%). */
  annualRatePercent: number;
  /** Number of monthly payments. */
  months: number;
  /** Optional extra principal paid every month, in currency units. */
  extraMonthly?: number;
}

export interface ScheduleRow {
  period: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface LoanResult {
  /** The scheduled monthly payment, before any extra. */
  monthlyPayment: number;
  totalPaid: number;
  totalInterest: number;
  /** Payments actually made (fewer than `months` when paying extra). */
  payoffMonths: number;
  schedule: ScheduleRow[];
}

export type LoanValidation = 'ok' | 'principal' | 'rate' | 'months' | 'extra';

export const MAX_LOAN_MONTHS = 1200;

export function validateLoan(input: LoanInput): LoanValidation {
  if (!Number.isFinite(input.principal) || input.principal <= 0 || input.principal > 1e12) return 'principal';
  if (!Number.isFinite(input.annualRatePercent) || input.annualRatePercent < 0 || input.annualRatePercent > 100)
    return 'rate';
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > MAX_LOAN_MONTHS) return 'months';
  if (input.extraMonthly !== undefined && (!Number.isFinite(input.extraMonthly) || input.extraMonthly < 0))
    return 'extra';
  return 'ok';
}

/** The level payment that repays `principal` over `months` at a monthly rate `r` (unrounded). */
export function levelPayment(principal: number, r: number, months: number): number {
  if (r === 0) return principal / months;
  return (principal * r) / (1 - (1 + r) ** -months);
}

const cents = (n: number) => Math.round(n * 100);

export function amortize(input: LoanInput): LoanResult {
  const r = input.annualRatePercent / 100 / 12;
  const paymentCents = Math.round(levelPayment(input.principal, r, input.months) * 100);
  const extraCents = cents(input.extraMonthly ?? 0);
  let balance = cents(input.principal);
  const schedule: ScheduleRow[] = [];
  let totalPaid = 0;
  let totalInterest = 0;
  for (let period = 1; balance > 0 && period <= input.months; period++) {
    const interest = Math.round(balance * r);
    let payment = paymentCents + extraCents;
    // The last payment is exactly what is left, so the balance lands on zero.
    if (payment > balance + interest || period === input.months) payment = balance + interest;
    const principal = payment - interest;
    balance -= principal;
    totalPaid += payment;
    totalInterest += interest;
    schedule.push({
      period,
      payment: payment / 100,
      principal: principal / 100,
      interest: interest / 100,
      balance: balance / 100,
    });
  }
  return {
    monthlyPayment: paymentCents / 100,
    totalPaid: totalPaid / 100,
    totalInterest: totalInterest / 100,
    payoffMonths: schedule.length,
    schedule,
  };
}

/** Summed interest and principal per year of the loan, for a shorter table. */
export function yearlyTotals(
  schedule: readonly ScheduleRow[],
): { year: number; principal: number; interest: number; balance: number }[] {
  const out: { year: number; principal: number; interest: number; balance: number }[] = [];
  for (const row of schedule) {
    const year = Math.ceil(row.period / 12);
    let entry = out[out.length - 1];
    if (!entry || entry.year !== year) {
      entry = { year, principal: 0, interest: 0, balance: row.balance };
      out.push(entry);
    }
    entry.principal = Math.round((entry.principal + row.principal) * 100) / 100;
    entry.interest = Math.round((entry.interest + row.interest) * 100) / 100;
    entry.balance = row.balance;
  }
  return out;
}
