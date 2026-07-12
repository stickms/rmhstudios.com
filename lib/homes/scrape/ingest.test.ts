import { describe, expect, it } from 'vitest';
import { assessListing } from './ingest';
import type { HomeSourceConfig, NormalizedListing } from './types';

const SOURCE: HomeSourceConfig = {
  id: 'src1',
  key: 'craigslist:rochester:apa',
  provider: 'CRAIGSLIST',
  label: 'Craigslist Rochester — Rentals',
  region: 'rochester',
  category: 'apa',
  url: null,
  listingType: 'RENT',
  defaultCity: 'Rochester',
  defaultState: 'NY',
  defaultLat: 43.1566,
  defaultLng: -77.6088,
};

function listing(over: Partial<NormalizedListing> = {}): NormalizedListing {
  return {
    externalId: '7712345678',
    title: 'Sunny 2BR near the park',
    descriptionHtml: '<p>Great place. Cats OK.</p>',
    url: 'https://rochester.craigslist.org/apa/d/x/7712345678.html',
    price: 1850,
    beds: 2,
    baths: 1,
    sqft: 900,
    propertyType: 'APARTMENT',
    petsAllowed: true,
    locationRaw: 'Park Ave',
    lat: 43.2,
    lng: -77.6,
    imageUrls: ['https://cdn/x.jpg'],
    postedAt: new Date('2026-07-08T09:30:00Z'),
    ...over,
  };
}

describe('assessListing', () => {
  it('maps a fully-populated listing', () => {
    const a = assessListing(listing(), SOURCE)!;
    expect(a).toMatchObject({
      externalId: '7712345678',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      priceCents: 185000,
      beds: 2,
      baths: 1,
      sqft: 900,
      petsAllowed: true,
      city: 'Rochester',
      state: 'NY',
      lat: 43.2,
      lng: -77.6,
    });
    expect(a.description).toContain('Great place');
  });

  it('falls back to the source center when the listing has no coords', () => {
    const a = assessListing(listing({ lat: null, lng: null }), SOURCE)!;
    expect(a.lat).toBe(SOURCE.defaultLat);
    expect(a.lng).toBe(SOURCE.defaultLng);
  });

  it('drops listings with no coords and no source default', () => {
    const bare = { ...SOURCE, defaultLat: null, defaultLng: null };
    expect(assessListing(listing({ lat: null, lng: null }), bare)).toBeNull();
  });

  it('applies sensible defaults for missing facts', () => {
    const a = assessListing(
      listing({
        price: null,
        beds: null,
        baths: null,
        sqft: null,
        propertyType: null,
        petsAllowed: null,
      }),
      SOURCE,
    )!;
    expect(a.priceCents).toBe(0); // → "Contact for price" downstream
    expect(a.beds).toBe(0);
    expect(a.baths).toBe(1);
    expect(a.sqft).toBeNull();
    expect(a.propertyType).toBe('APARTMENT'); // RENT default
    expect(a.petsAllowed).toBe(false);
  });

  it('defaults property type to HOUSE for sale sources', () => {
    const saleSource = { ...SOURCE, listingType: 'SALE' as const };
    const a = assessListing(listing({ propertyType: null }), saleSource)!;
    expect(a.listingType).toBe('SALE');
    expect(a.propertyType).toBe('HOUSE');
  });

  it('drops listings whose title is too short', () => {
    expect(assessListing(listing({ title: 'x' }), SOURCE)).toBeNull();
  });
});
