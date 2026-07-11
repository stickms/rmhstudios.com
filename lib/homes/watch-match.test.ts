import { describe, expect, it } from 'vitest';
import { listingMatchesWatch, type MatchableListing, type WatchCriteria } from './watch-match';

const LISTING: MatchableListing = {
  listingType: 'RENT',
  propertyType: 'APARTMENT',
  priceCents: 185000,
  beds: 2,
  baths: 1,
  petsAllowed: true,
  lat: 43.16,
  lng: -77.61,
};

function watch(over: Partial<WatchCriteria> = {}): WatchCriteria {
  return {
    listingType: null,
    propertyTypes: [],
    lat: null,
    lng: null,
    radiusKm: null,
    minPriceCents: null,
    maxPriceCents: null,
    minBeds: null,
    minBaths: null,
    petsRequired: false,
    ...over,
  };
}

describe('listingMatchesWatch', () => {
  it('matches an empty (any) watch', () => {
    expect(listingMatchesWatch(watch(), LISTING)).toBe(true);
  });

  it('honors listing type', () => {
    expect(listingMatchesWatch(watch({ listingType: 'SALE' }), LISTING)).toBe(false);
    expect(listingMatchesWatch(watch({ listingType: 'RENT' }), LISTING)).toBe(true);
  });

  it('honors property types', () => {
    expect(listingMatchesWatch(watch({ propertyTypes: ['HOUSE'] }), LISTING)).toBe(false);
    expect(listingMatchesWatch(watch({ propertyTypes: ['APARTMENT'] }), LISTING)).toBe(true);
  });

  it('honors price bounds (in cents)', () => {
    expect(listingMatchesWatch(watch({ maxPriceCents: 150000 }), LISTING)).toBe(false);
    expect(listingMatchesWatch(watch({ minPriceCents: 200000 }), LISTING)).toBe(false);
    expect(
      listingMatchesWatch(watch({ minPriceCents: 100000, maxPriceCents: 200000 }), LISTING),
    ).toBe(true);
  });

  it('honors beds/baths and pets', () => {
    expect(listingMatchesWatch(watch({ minBeds: 3 }), LISTING)).toBe(false);
    expect(listingMatchesWatch(watch({ minBaths: 2 }), LISTING)).toBe(false);
    expect(
      listingMatchesWatch(watch({ petsRequired: true }), { ...LISTING, petsAllowed: false }),
    ).toBe(false);
  });

  it('honors a geographic radius', () => {
    const near = watch({ lat: 43.16, lng: -77.61, radiusKm: 10 });
    expect(listingMatchesWatch(near, LISTING)).toBe(true);
    const far = watch({ lat: 40.71, lng: -74.0, radiusKm: 10 }); // NYC vs Rochester
    expect(listingMatchesWatch(far, LISTING)).toBe(false);
  });
});
