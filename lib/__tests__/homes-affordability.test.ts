/**
 * RMHHomes — affordability arithmetic and straight-line distance.
 *
 * Everything under test here is pure: no DOM, no network, no Prisma. That is
 * the point of the feature — the income figure never leaves the browser
 * precisely because nothing below needs a server to run.
 */

import { describe, it, expect } from 'vitest';
import {
  assessListing,
  assessPurchase,
  assessRent,
  DEFAULT_INCOME_PROFILE,
  formatMoney,
  formatMonthly,
  formatShare,
  hasIncome,
  maxAffordablePrice,
  maxAffordableRent,
  maxMonthlyHousing,
  monthlyGross,
  monthlyPayment,
  parseIncomeProfile,
  purchaseBreakdown,
  type IncomeProfile,
} from '@/lib/homes/affordability';
import {
  formatDistance,
  haversineKm,
  kmToMiles,
  milesToKm,
  nearestPlace,
  straightLineProvider,
  withinKm,
} from '@/lib/homes/distance';
import {
  addSavedPlace,
  MAX_SAVED_PLACES,
  makeSavedPlace,
  parseSavedPlaces,
  removeSavedPlace,
} from '@/lib/homes/places';

const profile = (patch: Partial<IncomeProfile> = {}): IncomeProfile => ({
  ...DEFAULT_INCOME_PROFILE,
  ...patch,
});

describe('rent affordability — the 30% rule', () => {
  it('turns annual income into a monthly budget', () => {
    expect(monthlyGross(120_000)).toBe(10_000);
    expect(maxMonthlyHousing(profile({ annualIncome: 120_000 }))).toBeCloseTo(3000, 6);
  });

  it('subtracts existing debt payments from the budget', () => {
    const p = profile({ annualIncome: 120_000, monthlyDebts: 500 });
    expect(maxMonthlyHousing(p)).toBeCloseTo(2500, 6);
  });

  it('never returns a negative budget when debts exceed the ratio', () => {
    const p = profile({ annualIncome: 24_000, monthlyDebts: 5_000 });
    expect(maxMonthlyHousing(p)).toBe(0);
    expect(assessRent(900, p).affordable).toBe(false);
  });

  it('honours a ratio the user moved off 30%', () => {
    expect(maxMonthlyHousing(profile({ annualIncome: 120_000, housingRatio: 0.4 }))).toBeCloseTo(
      4000,
      6,
    );
  });

  it('clamps an absurd ratio into the allowed band', () => {
    expect(maxMonthlyHousing(profile({ annualIncome: 120_000, housingRatio: 9 }))).toBeCloseTo(
      6000,
      6,
    );
    expect(maxMonthlyHousing(profile({ annualIncome: 120_000, housingRatio: -3 }))).toBeCloseTo(
      1000,
      6,
    );
  });

  it('judges a listing against the budget', () => {
    const p = profile({ annualIncome: 60_000 });
    const under = assessRent(1_200, p);
    expect(under.known).toBe(true);
    expect(under.affordable).toBe(true);
    expect(under.overBy).toBe(0);
    expect(under.shareOfIncome).toBeCloseTo(0.24, 6);

    const over = assessRent(2_000, p);
    expect(over.affordable).toBe(false);
    expect(over.overBy).toBeCloseTo(500, 6);
  });
});

describe('affordability edge cases', () => {
  it('reports "unknown" rather than "unaffordable" with zero income', () => {
    const p = profile({ annualIncome: 0 });
    expect(hasIncome(p)).toBe(false);
    const verdict = assessRent(1_500, p);
    // The distinction is load-bearing: the filter must not hide listings it
    // cannot actually rule out.
    expect(verdict.known).toBe(false);
    expect(verdict.affordable).toBe(false);
    expect(verdict.shareOfIncome).toBeNull();
    expect(maxAffordableRent(p)).toBe(0);
    expect(maxAffordablePrice(p)).toBe(0);
  });

  it('treats a non-finite or negative income as unset', () => {
    expect(monthlyGross(Number.NaN)).toBe(0);
    expect(monthlyGross(-50_000)).toBe(0);
    expect(hasIncome(profile({ annualIncome: -1 }))).toBe(false);
  });

  it('reports "unknown" for a listing with no usable price', () => {
    const p = profile({ annualIncome: 120_000 });
    expect(assessRent(0, p).known).toBe(false);
    expect(assessPurchase(-10, p).known).toBe(false);
    expect(assessRent(Number.NaN, p).known).toBe(false);
  });
});

describe('mortgage payment', () => {
  it('matches the standard amortization formula', () => {
    // $300,000 at 6% for 30 years ≈ $1,798.65/mo.
    expect(monthlyPayment(300_000, 6, 30)).toBeCloseTo(1798.65, 1);
  });

  it('divides evenly at a 0% rate instead of dividing by zero', () => {
    expect(monthlyPayment(120_000, 0, 10)).toBeCloseTo(1000, 6);
    expect(Number.isFinite(monthlyPayment(120_000, 0, 10))).toBe(true);
  });

  it('returns zero for a zero or negative principal', () => {
    expect(monthlyPayment(0, 6, 30)).toBe(0);
    expect(monthlyPayment(-1_000, 6, 30)).toBe(0);
  });

  it('treats a zero-year term as the whole balance being due', () => {
    expect(monthlyPayment(50_000, 6, 0)).toBe(50_000);
  });
});

describe('purchase breakdown', () => {
  const p = profile({
    annualIncome: 150_000,
    downPayment: 60_000,
    interestRate: 6,
    termYears: 30,
    propertyTaxRate: 1.2,
    annualInsurance: 1_800,
    monthlyHoa: 250,
  });

  it('adds tax, insurance and HOA on top of principal and interest', () => {
    const b = purchaseBreakdown(300_000, p);
    expect(b.loanAmount).toBe(240_000);
    expect(b.principalAndInterest).toBeCloseTo(1438.92, 1);
    expect(b.tax).toBeCloseTo(300, 6); // 300k × 1.2% ÷ 12
    expect(b.insurance).toBeCloseTo(150, 6);
    expect(b.hoa).toBe(250);
    expect(b.total).toBeCloseTo(
      b.principalAndInterest + b.tax + b.insurance + b.hoa,
      6,
    );
  });

  it('splits the first payment into interest and principal', () => {
    const b = purchaseBreakdown(300_000, p);
    expect(b.firstMonthInterest).toBeCloseTo(1200, 6); // 240k × 6%/12
    expect(b.firstMonthPrincipal).toBeCloseTo(b.principalAndInterest - 1200, 6);
    expect(b.firstMonthPrincipal).toBeGreaterThan(0);
  });

  it('clamps a down payment larger than the price', () => {
    const b = purchaseBreakdown(100_000, profile({ downPayment: 500_000 }));
    expect(b.downPayment).toBe(100_000);
    expect(b.loanAmount).toBe(0);
    expect(b.principalAndInterest).toBe(0);
    // Owning outright still costs tax and insurance every month.
    expect(b.total).toBeGreaterThan(0);
  });

  it('handles a zero price without producing NaN', () => {
    const b = purchaseBreakdown(0, p);
    expect(b.total).toBeCloseTo(b.insurance + b.hoa, 6);
    expect(Number.isNaN(b.total)).toBe(false);
  });

  it('judges a purchase on the full monthly payment, not the sticker price', () => {
    const verdict = assessPurchase(300_000, p);
    expect(verdict.known).toBe(true);
    expect(verdict.monthlyCost).toBeCloseTo(purchaseBreakdown(300_000, p).total, 6);
    expect(verdict.budget).toBeCloseTo(3750, 6);
    expect(verdict.affordable).toBe(true);
  });
});

describe('the affordable ceiling', () => {
  it('finds a price whose total payment lands on the budget', () => {
    const p = profile({ annualIncome: 150_000, downPayment: 60_000 });
    const ceiling = maxAffordablePrice(p);
    const budget = maxMonthlyHousing(p);
    expect(purchaseBreakdown(ceiling, p).total).toBeLessThanOrEqual(budget + 1);
    // …and a dollar more is over it, which is what makes it a ceiling.
    expect(purchaseBreakdown(ceiling + 1_000, p).total).toBeGreaterThan(budget);
  });

  it('never goes below zero for a tiny income', () => {
    expect(maxAffordablePrice(profile({ annualIncome: 6_000 }))).toBeGreaterThanOrEqual(0);
  });
});

describe('assessListing picks the rule from the listing type', () => {
  const p = profile({ annualIncome: 90_000 });

  it('uses the rent rule for RENT', () => {
    expect(assessListing({ price: 1_500, listingType: 'RENT' }, p).monthlyCost).toBe(1_500);
  });

  it('uses the payment breakdown for SALE', () => {
    const verdict = assessListing({ price: 250_000, listingType: 'SALE' }, p);
    expect(verdict.monthlyCost).toBeCloseTo(purchaseBreakdown(250_000, p).total, 6);
    expect(verdict.monthlyCost).not.toBe(250_000);
  });
});

describe('the stored profile', () => {
  it('falls back to defaults for junk', () => {
    expect(parseIncomeProfile(null)).toEqual(DEFAULT_INCOME_PROFILE);
    expect(parseIncomeProfile('not json')).toEqual(DEFAULT_INCOME_PROFILE);
    expect(parseIncomeProfile('[1,2,3]')).toEqual(DEFAULT_INCOME_PROFILE);
  });

  it('keeps good values and repairs bad ones field by field', () => {
    const parsed = parseIncomeProfile(
      JSON.stringify({ annualIncome: 80_000, monthlyDebts: -5, interestRate: 'six' }),
    );
    expect(parsed.annualIncome).toBe(80_000);
    expect(parsed.monthlyDebts).toBe(0);
    expect(parsed.interestRate).toBe(DEFAULT_INCOME_PROFILE.interestRate);
  });
});

describe('money formatting', () => {
  it('renders whole dollars', () => {
    expect(formatMoney(1849.6)).toBe('$1,850');
    expect(formatMonthly(1200)).toBe('$1,200/mo');
    expect(formatMoney(Number.NaN)).toBe('—');
  });

  it('renders a share as a percentage', () => {
    expect(formatShare(0.312)).toBe('31%');
    expect(formatShare(null)).toBe('—');
  });
});

/* -------------------------------------------------------------------------- */
/* Distance                                                                   */
/* -------------------------------------------------------------------------- */

describe('haversine distance', () => {
  const rochester = { lat: 43.1566, lng: -77.6088 };
  const buffalo = { lat: 42.8864, lng: -78.8784 };
  const nyc = { lat: 40.7128, lng: -74.006 };

  it('is zero for a point against itself', () => {
    expect(haversineKm(rochester, rochester)).toBeCloseTo(0, 9);
  });

  it('matches known city separations', () => {
    // Rochester → Buffalo is ~107.5 km great-circle.
    expect(haversineKm(rochester, buffalo)).toBeCloseTo(107.5, 0);
    // Rochester → NYC is roughly 400 km; assert a band, not a magic number.
    const km = haversineKm(rochester, nyc);
    expect(km).toBeGreaterThan(380);
    expect(km).toBeLessThan(420);
  });

  it('is symmetric', () => {
    expect(haversineKm(rochester, buffalo)).toBeCloseTo(haversineKm(buffalo, rochester), 9);
  });

  it('handles antipodal-ish points without NaN from floating-point drift', () => {
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isNaN(km)).toBe(false);
    expect(km).toBeCloseTo(Math.PI * 6371, 3);
  });

  it('crosses the antimeridian correctly', () => {
    const km = haversineKm({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 });
    // One degree of longitude at the equator, not 359 of them.
    expect(km).toBeCloseTo(111.2, 0);
  });

  it('converts units round-trip', () => {
    expect(kmToMiles(1.609344)).toBeCloseTo(1, 9);
    expect(milesToKm(kmToMiles(42))).toBeCloseTo(42, 9);
  });
});

describe('distance helpers', () => {
  const origin = { lat: 43.1566, lng: -77.6088 };

  it('formats with dropping precision and never shows NaN', () => {
    expect(formatDistance(1.609344, 'mi')).toBe('1.0 mi');
    // Past 10 the tenth is noise, so precision drops to whole units.
    expect(formatDistance(32.18688, 'mi')).toBe('20 mi');
    expect(formatDistance(2.4, 'km')).toBe('2.4 km');
    expect(formatDistance(42, 'km')).toBe('42 km');
    expect(formatDistance(0.05, 'km')).toBe('< 0.1 km');
    expect(formatDistance(Number.NaN)).toBe('—');
    expect(formatDistance(-1)).toBe('—');
  });

  it('treats a non-positive radius as matching nothing', () => {
    expect(withinKm(origin, origin, 0)).toBe(false);
    expect(withinKm(origin, origin, -5)).toBe(false);
    expect(withinKm(origin, origin, 1)).toBe(true);
  });

  it('finds the nearest saved place, or null when there are none', () => {
    const places = [
      // Syracuse (~118 km) sits first; Buffalo (~107 km) is genuinely closer, so
      // this fails if the helper just returns the head of the list.
      { id: 'a', label: 'Syracuse', lat: 43.0481, lng: -76.1474 },
      { id: 'b', label: 'Buffalo', lat: 42.8864, lng: -78.8784 },
      { id: 'c', label: 'Toronto', lat: 43.6532, lng: -79.3832 },
    ];
    const nearest = nearestPlace(origin, places);
    expect(nearest?.place.label).toBe('Buffalo');
    expect(nearest?.km).toBeCloseTo(107.5, 0);
    expect(nearestPlace(origin, [])).toBeNull();
  });

  it('reports straight-line results through the provider seam', async () => {
    const results = await straightLineProvider.measure(origin, [
      origin,
      { lat: 42.8864, lng: -78.8784 },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].km).toBeCloseTo(0, 9);
    expect(results[1].method).toBe('straight-line');
    // The seam must not fabricate a duration it does not have — this is the
    // property that keeps the UI from ever calling it a commute time.
    expect(results[0].minutes).toBeNull();
    expect(results[1].minutes).toBeNull();
  });
});

describe('saved places', () => {
  it('drops malformed rows rather than the whole list', () => {
    const raw = JSON.stringify([
      { id: '1', label: 'Work', lat: 43.1, lng: -77.6 },
      { id: '2', label: '', lat: 43.1, lng: -77.6 },
      { id: '3', label: 'Bad', lat: 999, lng: -77.6 },
      { id: '4', label: 'Campus', lat: 43.0, lng: -77.5 },
    ]);
    const places = parseSavedPlaces(raw);
    expect(places.map((p) => p.label)).toEqual(['Work', 'Campus']);
  });

  it('returns an empty list for junk', () => {
    expect(parseSavedPlaces(null)).toEqual([]);
    expect(parseSavedPlaces('{')).toEqual([]);
    expect(parseSavedPlaces('{"a":1}')).toEqual([]);
  });

  it('refuses a place with no label or an out-of-range coordinate', () => {
    expect(makeSavedPlace({ label: '   ', lat: 1, lng: 1 })).toBeNull();
    expect(makeSavedPlace({ label: 'Work', lat: 91, lng: 0 })).toBeNull();
    expect(makeSavedPlace({ label: 'Work', lat: 0, lng: Number.NaN })).toBeNull();
    expect(makeSavedPlace({ label: 'Work', lat: 43, lng: -77 })).toMatchObject({ label: 'Work' });
  });

  it('replaces a place of the same name instead of duplicating it', () => {
    const first = makeSavedPlace({ label: 'Work', lat: 43, lng: -77 })!;
    const second = makeSavedPlace({ label: 'work', lat: 44, lng: -78 })!;
    const list = addSavedPlace(addSavedPlace([], first), second);
    expect(list).toHaveLength(1);
    expect(list[0].lat).toBe(44);
  });

  it('caps the list and drops the oldest', () => {
    let list: ReturnType<typeof addSavedPlace> = [];
    for (let i = 0; i < MAX_SAVED_PLACES + 3; i++) {
      list = addSavedPlace(list, makeSavedPlace({ label: `P${i}`, lat: 43, lng: -77 })!);
    }
    expect(list).toHaveLength(MAX_SAVED_PLACES);
    expect(list[0].label).toBe('P3');
  });

  it('removes by id', () => {
    const a = makeSavedPlace({ label: 'A', lat: 1, lng: 1 })!;
    const b = makeSavedPlace({ label: 'B', lat: 2, lng: 2 })!;
    expect(removeSavedPlace([a, b], a.id)).toEqual([b]);
    expect(removeSavedPlace([a, b], 'nope')).toHaveLength(2);
  });
});
