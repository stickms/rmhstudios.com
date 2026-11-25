import { describe, expect, it } from 'vitest';
import {
  MAX_COMPARE,
  amenityUnion,
  buildComparison,
  compareIdsParam,
  noteFits,
  normalizeNote,
  parseCompareIds,
  pricePerSqft,
} from '../compare';
import { DEFAULT_INCOME_PROFILE } from '../affordability';
import { parseComparePrefs } from '../compare-place';
import type { Listing } from '../types';

function listing(over: Partial<Listing> = {}): Listing {
  return {
    id: 'a',
    source: 'COMMUNITY',
    status: 'ACTIVE',
    listingType: 'RENT',
    propertyType: 'APARTMENT',
    title: 'Two-bed',
    description: 'A bright flat.',
    price: 1500,
    beds: 2,
    baths: 1,
    sqft: 750,
    address: null,
    city: 'Rochester',
    state: 'NY',
    postalCode: null,
    lat: 43.1566,
    lng: -77.6088,
    amenities: [],
    petsAllowed: false,
    availableFrom: null,
    images: [],
    aiImages: [],
    imageAlts: [],
    viewsCount: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    author: null,
    externalUrl: null,
    sourceName: null,
    favorited: true,
    isOwner: false,
    ...over,
  };
}

describe('parseCompareIds', () => {
  it('reads one comma-separated parameter in order', () => {
    expect(parseCompareIds('a,b,c')).toEqual({ ids: ['a', 'b', 'c'], tooMany: false, invalid: 0 });
  });

  it('collapses duplicates and ignores empty parts', () => {
    expect(parseCompareIds('a,,b, a ,b,')).toEqual({ ids: ['a', 'b'], tooMany: false, invalid: 0 });
  });

  it('drops and counts ids that are not ids', () => {
    const r = parseCompareIds('a,b c,<script>,ok_1-2');
    expect(r.ids).toEqual(['a', 'ok_1-2']);
    expect(r.invalid).toBe(2);
  });

  it('flags more than four distinct ids, but not four with a repeat', () => {
    expect(parseCompareIds('a,b,c,d,e').tooMany).toBe(true);
    expect(parseCompareIds('a,b,c,d,d,a').tooMany).toBe(false);
    expect(MAX_COMPARE).toBe(4);
  });

  it('copes with nothing at all', () => {
    expect(parseCompareIds(undefined)).toEqual({ ids: [], tooMany: false, invalid: 0 });
    expect(parseCompareIds('')).toEqual({ ids: [], tooMany: false, invalid: 0 });
  });

  it('writes back at most four ids', () => {
    expect(compareIdsParam(['a', 'b', 'c', 'd', 'e'])).toBe('a,b,c,d');
  });
});

describe('pricePerSqft', () => {
  it('divides price by size to the cent', () => {
    expect(pricePerSqft(1500, 750)).toBe(2);
    expect(pricePerSqft(1000, 3)).toBe(333.33);
  });

  it('is null without a usable size or price', () => {
    expect(pricePerSqft(1500, null)).toBeNull();
    expect(pricePerSqft(1500, 0)).toBeNull();
    expect(pricePerSqft(0, 700)).toBeNull();
    expect(pricePerSqft(Number.NaN, 700)).toBeNull();
  });
});

describe('amenityUnion', () => {
  it('lists each amenity once, case-insensitively, sorted', () => {
    const union = amenityUnion([{ amenities: ['Parking', 'dishwasher'] }, { amenities: ['parking', ' Laundry ', ''] }]);
    expect(union).toEqual(['dishwasher', 'Laundry', 'Parking']);
  });
});

describe('normalizeNote', () => {
  it('trims, keeps line breaks, removes control characters and maps empty to null', () => {
    expect(normalizeNote('  viewing Thursday \r\n bring ID\u0007 ')).toBe('viewing Thursday \n bring ID');
    expect(normalizeNote('   ')).toBeNull();
    expect(normalizeNote('')).toBeNull();
  });

  it('counts characters, not UTF-16 units, against the 1000 limit', () => {
    expect(noteFits('a'.repeat(1000))).toBe(true);
    expect(noteFits('a'.repeat(1001))).toBe(false);
    expect(noteFits('🏠'.repeat(1000))).toBe(true);
  });
});

describe('buildComparison', () => {
  const a = listing({ id: 'a', price: 1500, sqft: 750, amenities: ['Parking'], petsAllowed: true });
  const b = listing({
    id: 'b',
    price: 1800,
    sqft: null,
    status: 'RENTED',
    amenities: ['parking', 'Laundry'],
    lat: 43.2,
    lng: -77.7,
  });

  it('builds the fixed rows in order and leaves out a row nothing fills', () => {
    const none = buildComparison({ listings: [listing({ sqft: null })] });
    expect(none.rows.map((r) => r.key)).toEqual([
      'price',
      'lastChange',
      'beds',
      'baths',
      'sqft',
      'type',
      'pets',
      'available',
      'note',
    ]);
    const m = buildComparison({ listings: [a, b] });
    expect(m.rows.map((r) => r.key)).toContain('perSqft');
    expect(m.rows.find((r) => r.key === 'perSqft')?.cells).toEqual([{ kind: 'money', value: 2 }, { kind: 'none' }]);
  });

  it('marks a listing that is no longer active and keeps its column', () => {
    const m = buildComparison({ listings: [a, b] });
    expect(m.columns.map((c) => [c.id, c.noLongerListed])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('ticks the amenity union per listing', () => {
    const m = buildComparison({ listings: [a, b] });
    expect(m.amenities).toEqual([
      { name: 'Laundry', has: [false, true] },
      { name: 'Parking', has: [true, true] },
    ]);
  });

  it('adds distance only with a place, straight line from it', () => {
    expect(buildComparison({ listings: [a] }).rows.some((r) => r.key === 'distance')).toBe(false);
    const m = buildComparison({ listings: [a, b], place: { label: 'Work', lat: 43.1566, lng: -77.6088 } });
    const cells = m.rows.find((r) => r.key === 'distance')?.cells ?? [];
    expect(cells[0]).toMatchObject({ kind: 'distance' });
    expect((cells[0] as { km: number }).km).toBeCloseTo(0, 5);
    expect((cells[1] as { km: number }).km).toBeGreaterThan(5);
  });

  it('adds affordability only when the device profile holds an income', () => {
    expect(
      buildComparison({ listings: [a], profile: DEFAULT_INCOME_PROFILE }).rows.some((r) => r.key === 'afford'),
    ).toBe(false);
    const m = buildComparison({
      listings: [a, b],
      profile: { ...DEFAULT_INCOME_PROFILE, annualIncome: 72000 },
    });
    const cells = m.rows.find((r) => r.key === 'afford')?.cells;
    // 72,000 a year is 6,000 a month; 30% is 1,800: 1,500 fits, 1,800 fits exactly.
    expect(cells?.[0]).toMatchObject({ kind: 'afford', affordable: true });
    expect(cells?.[1]).toMatchObject({ kind: 'afford', affordable: true, overBy: 0 });
  });

  it('puts the notes and the last change in their rows', () => {
    const change = {
      id: 'c1',
      oldPrice: 1600,
      newPrice: 1500,
      percent: -6.3,
      source: 'author' as const,
      changedAt: '2026-11-20T00:00:00.000Z',
    };
    const m = buildComparison({ listings: [a, b], notes: { a: 'viewing Thursday' }, changes: { a: change } });
    expect(m.rows.find((r) => r.key === 'note')?.cells).toEqual([
      { kind: 'text', value: 'viewing Thursday' },
      { kind: 'none' },
    ]);
    expect(m.rows.find((r) => r.key === 'lastChange')?.cells).toEqual([{ kind: 'change', change }, { kind: 'none' }]);
  });

  it('never shows more than four columns', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => listing({ id }));
    expect(buildComparison({ listings: many }).columns).toHaveLength(4);
  });
});

describe('parseComparePrefs', () => {
  it('accepts a place and a unit, and repairs bad fields', () => {
    expect(parseComparePrefs({ place: { label: 'Work', lat: 1, lng: 2 }, unit: 'km' })).toEqual({
      place: { label: 'Work', lat: 1, lng: 2 },
      unit: 'km',
    });
    expect(parseComparePrefs({ place: { label: 'x', lat: 999, lng: 0 }, unit: 'furlongs' })).toEqual({
      place: null,
      unit: 'mi',
    });
    expect(parseComparePrefs('nope')).toBeUndefined();
  });
});
