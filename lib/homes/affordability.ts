/**
 * RMHHomes — affordability arithmetic. Pure functions, no data, no network.
 *
 * Two questions, answered without asking the server anything:
 *
 *   • Rentals — the 30%-of-gross rule. Monthly gross × the housing ratio, less
 *     existing debt payments, is the budget; a listing over it is not
 *     affordable at the ratio the user chose.
 *   • Purchases — a full monthly payment: principal and interest from a
 *     standard amortization, plus a property-tax estimate, insurance and HOA.
 *
 * ────────────────────────────── on the income figure ─────────────────────────
 *
 * Income NEVER leaves the browser. It is not posted to an endpoint, not logged,
 * not attached to a search, and not written to any table — `INCOME_STORAGE_KEY`
 * in `localStorage` is the only place it exists. That is a deliberate product
 * constraint rather than an implementation detail: household income is the most
 * sensitive number a housing product can ask for (it is a protected-class proxy
 * and a fraud target in one field), the entire computation below is arithmetic
 * a phone does in microseconds, and there is therefore no version of this
 * feature where the server needs to know. The UI states this next to the input,
 * because a promise the user cannot see is not a promise.
 *
 * All money is whole dollars (the listing DTO already converts from the cents
 * the database stores). Rates are annual percentages — `6.5`, not `0.065`.
 */

import type { ListingType } from './types';

export type AffordabilityMode = 'rent' | 'buy';

export interface IncomeProfile {
  /** Gross ANNUAL household income, whole dollars. `0` means "not entered". */
  annualIncome: number;
  /** Existing monthly debt service (loans, cards), whole dollars. */
  monthlyDebts: number;
  /** Share of gross income budgeted for housing. `0.3` is the classic rule. */
  housingRatio: number;
  /** Cash down, whole dollars. Purchases only. */
  downPayment: number;
  /** Annual mortgage rate as a percentage, e.g. `6.5`. */
  interestRate: number;
  /** Loan term in years. */
  termYears: number;
  /** Annual property tax as a percentage of price, e.g. `1.1`. */
  propertyTaxRate: number;
  /** Annual homeowners/renters insurance, whole dollars. */
  annualInsurance: number;
  /** Monthly HOA or condo fee, whole dollars. */
  monthlyHoa: number;
}

/**
 * US-ish middle-of-the-road starting values. Every one is visible and editable
 * in the panel — they are a starting point, not a claim about the user.
 */
export const DEFAULT_INCOME_PROFILE: IncomeProfile = {
  annualIncome: 0,
  monthlyDebts: 0,
  housingRatio: 0.3,
  downPayment: 0,
  interestRate: 6.5,
  termYears: 30,
  propertyTaxRate: 1.1,
  annualInsurance: 1800,
  monthlyHoa: 0,
};

export const MIN_HOUSING_RATIO = 0.1;
export const MAX_HOUSING_RATIO = 0.6;

/* -------------------------------------------------------------------------- */
/* Rent                                                                       */
/* -------------------------------------------------------------------------- */

/** Gross income per month. Non-finite or negative input reads as zero. */
export function monthlyGross(annualIncome: number): number {
  if (!Number.isFinite(annualIncome) || annualIncome <= 0) return 0;
  return annualIncome / 12;
}

/** Whether the profile carries enough to judge anything at all. */
export function hasIncome(profile: IncomeProfile): boolean {
  return monthlyGross(profile.annualIncome) > 0;
}

/**
 * The monthly housing budget: ratio of gross, less existing debt payments,
 * floored at zero. Debts are subtracted rather than folded into a second ratio
 * because one number the user can see beats two rules they have to reconcile.
 */
export function maxMonthlyHousing(profile: IncomeProfile): number {
  const gross = monthlyGross(profile.annualIncome);
  if (gross === 0) return 0;
  const ratio = clampRatio(profile.housingRatio);
  const debts = Number.isFinite(profile.monthlyDebts) ? Math.max(0, profile.monthlyDebts) : 0;
  return Math.max(0, gross * ratio - debts);
}

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_INCOME_PROFILE.housingRatio;
  return Math.min(MAX_HOUSING_RATIO, Math.max(MIN_HOUSING_RATIO, ratio));
}

/* -------------------------------------------------------------------------- */
/* Purchase                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Standard fixed-rate amortization: `P · r / (1 − (1 + r)^−n)`.
 *
 * Two branches that a naive version gets wrong and a user notices immediately:
 * a 0% rate divides by zero in that formula (it is simply `P / n`), and a
 * non-positive term has no schedule at all, so the balance is due now.
 */
export function monthlyPayment(
  principal: number,
  annualRatePct: number,
  termYears: number,
): number {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  const n = Number.isFinite(termYears) ? Math.round(termYears * 12) : 0;
  if (n <= 0) return principal;

  const r = Number.isFinite(annualRatePct) ? annualRatePct / 100 / 12 : 0;
  if (r <= 0) return principal / n;

  const factor = Math.pow(1 + r, -n);
  return (principal * r) / (1 - factor);
}

export interface PaymentBreakdown {
  /** Sticker price. */
  price: number;
  /** Cash down, clamped to the price — you cannot put more down than it costs. */
  downPayment: number;
  loanAmount: number;
  /** Monthly principal + interest. */
  principalAndInterest: number;
  /** Of that first payment, how much is interest… */
  firstMonthInterest: number;
  /** …and how much retires principal. */
  firstMonthPrincipal: number;
  /** Monthly property-tax estimate. */
  tax: number;
  /** Monthly insurance. */
  insurance: number;
  /** Monthly HOA. */
  hoa: number;
  /** Everything above — what actually leaves the account each month. */
  total: number;
}

/** Full monthly cost of owning a listing at `price`, under this profile. */
export function purchaseBreakdown(price: number, profile: IncomeProfile): PaymentBreakdown {
  const safePrice = Number.isFinite(price) && price > 0 ? price : 0;
  const down = Math.min(
    safePrice,
    Number.isFinite(profile.downPayment) ? Math.max(0, profile.downPayment) : 0,
  );
  const loanAmount = Math.max(0, safePrice - down);

  const principalAndInterest = monthlyPayment(loanAmount, profile.interestRate, profile.termYears);
  const monthlyRate = Number.isFinite(profile.interestRate)
    ? Math.max(0, profile.interestRate) / 100 / 12
    : 0;
  const firstMonthInterest = loanAmount * monthlyRate;
  const firstMonthPrincipal = Math.max(0, principalAndInterest - firstMonthInterest);

  const taxRate = Number.isFinite(profile.propertyTaxRate)
    ? Math.max(0, profile.propertyTaxRate)
    : 0;
  const tax = (safePrice * (taxRate / 100)) / 12;
  const insurance = Number.isFinite(profile.annualInsurance)
    ? Math.max(0, profile.annualInsurance) / 12
    : 0;
  const hoa = Number.isFinite(profile.monthlyHoa) ? Math.max(0, profile.monthlyHoa) : 0;

  return {
    price: safePrice,
    downPayment: down,
    loanAmount,
    principalAndInterest,
    firstMonthInterest,
    firstMonthPrincipal,
    tax,
    insurance,
    hoa,
    total: principalAndInterest + tax + insurance + hoa,
  };
}

/* -------------------------------------------------------------------------- */
/* The verdict                                                                */
/* -------------------------------------------------------------------------- */

export interface AffordabilityVerdict {
  /**
   * `false` when there is not enough input to judge — no income entered, or a
   * "contact for price" listing. The UI must show nothing rather than a
   * confident "unaffordable" derived from a blank field, and the filter must
   * not hide listings it cannot actually rule out.
   */
  known: boolean;
  affordable: boolean;
  /** Monthly cost of this listing under the profile. */
  monthlyCost: number;
  /** The monthly housing budget the profile allows. */
  budget: number;
  /** Dollars per month above budget; `0` when within it. */
  overBy: number;
  /** Monthly cost as a share of gross monthly income; `null` without income. */
  shareOfIncome: number | null;
}

const UNKNOWN: AffordabilityVerdict = {
  known: false,
  affordable: false,
  monthlyCost: 0,
  budget: 0,
  overBy: 0,
  shareOfIncome: null,
};

function verdict(monthlyCost: number, profile: IncomeProfile): AffordabilityVerdict {
  const budget = maxMonthlyHousing(profile);
  const gross = monthlyGross(profile.annualIncome);
  return {
    known: true,
    affordable: monthlyCost <= budget,
    monthlyCost,
    budget,
    overBy: Math.max(0, monthlyCost - budget),
    shareOfIncome: gross > 0 ? monthlyCost / gross : null,
  };
}

/** Judge a monthly rent. */
export function assessRent(monthlyRent: number, profile: IncomeProfile): AffordabilityVerdict {
  if (!hasIncome(profile)) return UNKNOWN;
  if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) return UNKNOWN;
  return verdict(monthlyRent, profile);
}

/** Judge a purchase price, using the full monthly payment rather than the price. */
export function assessPurchase(price: number, profile: IncomeProfile): AffordabilityVerdict {
  if (!hasIncome(profile)) return UNKNOWN;
  if (!Number.isFinite(price) || price <= 0) return UNKNOWN;
  return verdict(purchaseBreakdown(price, profile).total, profile);
}

/** Judge a listing, picking the rule from its own type. */
export function assessListing(
  listing: { price: number; listingType: ListingType },
  profile: IncomeProfile,
): AffordabilityVerdict {
  return listing.listingType === 'SALE'
    ? assessPurchase(listing.price, profile)
    : assessRent(listing.price, profile);
}

/**
 * The highest monthly rent inside budget — the "what can I afford" number, as
 * opposed to the per-listing yes/no. Zero when no income is entered.
 */
export function maxAffordableRent(profile: IncomeProfile): number {
  return maxMonthlyHousing(profile);
}

/**
 * The highest purchase price whose full monthly payment stays inside budget.
 *
 * Solved by bisection rather than algebraically because the monthly total is
 * not a clean linear function of price — tax scales with price, insurance and
 * HOA do not, and the down payment is a fixed amount that stops mattering once
 * the loan is large. Forty iterations over a 0…$50M bracket lands well inside a
 * dollar, and it runs once per profile change, not per listing.
 */
export function maxAffordablePrice(profile: IncomeProfile): number {
  const budget = maxMonthlyHousing(profile);
  if (budget <= 0) return 0;

  let low = 0;
  let high = 50_000_000;
  if (purchaseBreakdown(high, profile).total <= budget) return high;

  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (purchaseBreakdown(mid, profile).total <= budget) low = mid;
    else high = mid;
  }
  return low;
}

/* -------------------------------------------------------------------------- */
/* Device-only persistence                                                    */
/* -------------------------------------------------------------------------- */

export const INCOME_STORAGE_KEY = 'rmh-homes-affordability';

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Pure parse of a stored profile, so the merge rules are testable without a DOM. */
export function parseIncomeProfile(raw: string | null | undefined): IncomeProfile {
  if (!raw) return { ...DEFAULT_INCOME_PROFILE };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_INCOME_PROFILE };
  }
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_INCOME_PROFILE };
  const p = parsed as Record<string, unknown>;
  return {
    annualIncome: Math.max(0, num(p.annualIncome, DEFAULT_INCOME_PROFILE.annualIncome)),
    monthlyDebts: Math.max(0, num(p.monthlyDebts, DEFAULT_INCOME_PROFILE.monthlyDebts)),
    housingRatio: clampRatio(num(p.housingRatio, DEFAULT_INCOME_PROFILE.housingRatio)),
    downPayment: Math.max(0, num(p.downPayment, DEFAULT_INCOME_PROFILE.downPayment)),
    interestRate: Math.max(0, num(p.interestRate, DEFAULT_INCOME_PROFILE.interestRate)),
    termYears: Math.max(0, num(p.termYears, DEFAULT_INCOME_PROFILE.termYears)),
    propertyTaxRate: Math.max(0, num(p.propertyTaxRate, DEFAULT_INCOME_PROFILE.propertyTaxRate)),
    annualInsurance: Math.max(0, num(p.annualInsurance, DEFAULT_INCOME_PROFILE.annualInsurance)),
    monthlyHoa: Math.max(0, num(p.monthlyHoa, DEFAULT_INCOME_PROFILE.monthlyHoa)),
  };
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadIncomeProfile(): IncomeProfile {
  const store = storage();
  if (!store) return { ...DEFAULT_INCOME_PROFILE };
  try {
    return parseIncomeProfile(store.getItem(INCOME_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_INCOME_PROFILE };
  }
}

export function persistIncomeProfile(profile: IncomeProfile): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(INCOME_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Quota / private mode. The session keeps working from memory.
  }
}

/** Wipe the stored figure. The panel offers this next to the input. */
export function clearIncomeProfile(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(INCOME_STORAGE_KEY);
  } catch {
    /* nothing to do — there is no other copy anywhere */
  }
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** `"$1,850"` — whole dollars, because cents are noise at these magnitudes. */
export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/** `"$1,850/mo"`. */
export function formatMonthly(value: number): string {
  return `${formatMoney(value)}/mo`;
}

/** `"31%"` from a 0–1 share. */
export function formatShare(share: number | null): string {
  if (share == null || !Number.isFinite(share)) return '—';
  return `${Math.round(share * 100)}%`;
}
