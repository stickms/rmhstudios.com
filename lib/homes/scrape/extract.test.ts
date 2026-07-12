import { describe, expect, it } from 'vitest';
import {
  cleanTitle,
  extractBaths,
  extractBeds,
  extractPetsAllowed,
  extractPrice,
  extractPropertyType,
  extractSqft,
  neighborhoodFromTitle,
} from './extract';

describe('extractPrice', () => {
  it('reads a comma-grouped dollar amount', () => {
    expect(extractPrice('$1,850 / 2br - Sunny flat')).toBe(1850);
    expect(extractPrice('$525,000 / 3br')).toBe(525000);
  });
  it('reads the first amount and ignores later ones', () => {
    expect(extractPrice('$2,100 deposit $2,100 first month')).toBe(2100);
  });
  it('returns null without a price', () => {
    expect(extractPrice('Charming 2br near the park')).toBeNull();
  });
  it('rejects nonsense/zero', () => {
    expect(extractPrice('$0 / free')).toBeNull();
  });
});

describe('extractBeds', () => {
  it('reads "2br" / "3 bed"', () => {
    expect(extractBeds('$1,850 / 2br - 900ft2')).toBe(2);
    expect(extractBeds('spacious 3 bedroom')).toBe(3);
  });
  it('treats studio as 0 beds', () => {
    expect(extractBeds('$1,200 / studio downtown')).toBe(0);
  });
  it('returns null when unknown', () => {
    expect(extractBeds('cozy place available now')).toBeNull();
  });
});

describe('extractBaths', () => {
  it('reads integer and fractional baths', () => {
    expect(extractBaths('2br 1ba')).toBe(1);
    expect(extractBaths('3 bed 2.5 bath house')).toBe(2.5);
  });
  it('returns null when unknown', () => {
    expect(extractBaths('2br apartment')).toBeNull();
  });
});

describe('extractSqft', () => {
  it('reads "900ft2" and "1,800 sqft"', () => {
    expect(extractSqft('$1,850 / 2br - 900ft2')).toBe(900);
    expect(extractSqft('1,800 sqft colonial')).toBe(1800);
    expect(extractSqft('approx 750 sq ft')).toBe(750);
  });
  it('returns null when unknown', () => {
    expect(extractSqft('2br apartment')).toBeNull();
  });
});

describe('extractPropertyType', () => {
  it('classifies by keyword', () => {
    expect(extractPropertyType('Modern apartment downtown')).toBe('APARTMENT');
    expect(extractPropertyType('Charming colonial house')).toBe('HOUSE');
    expect(extractPropertyType('Luxury condo with view')).toBe('CONDO');
    expect(extractPropertyType('2-story townhouse')).toBe('TOWNHOUSE');
    expect(extractPropertyType('Private room in shared home')).toBe('ROOM');
  });
  it('returns null with no signal', () => {
    expect(extractPropertyType('Great place to live')).toBeNull();
  });
});

describe('extractPetsAllowed', () => {
  it('detects positive pet policies', () => {
    expect(extractPetsAllowed('cats are OK - purrr')).toBe(true);
    expect(extractPetsAllowed('dogs are OK - wooof')).toBe(true);
    expect(extractPetsAllowed('pet-friendly building')).toBe(true);
  });
  it('detects negative pet policies', () => {
    expect(extractPetsAllowed('Sorry, no pets allowed')).toBe(false);
  });
  it('returns null when unstated', () => {
    expect(extractPetsAllowed('2br apartment near transit')).toBeNull();
  });
});

describe('neighborhoodFromTitle', () => {
  it('reads the trailing parenthetical', () => {
    expect(neighborhoodFromTitle('$1,850 / 2br - Sunny flat (Park Ave)')).toBe('Park Ave');
  });
  it('returns null without one', () => {
    expect(neighborhoodFromTitle('$1,850 / 2br - Sunny flat')).toBeNull();
  });
});

describe('cleanTitle', () => {
  it('strips the Craigslist "$price / Nbr - Yft2" prefix', () => {
    expect(cleanTitle('$1,850 / 2br - 900ft2 - Sunny flat near the park (Park Ave)')).toBe(
      'Sunny flat near the park (Park Ave)',
    );
  });
  it('leaves a clean RSS title unchanged', () => {
    expect(cleanTitle('Bright 2 Bedroom Apartment in Midtown')).toBe(
      'Bright 2 Bedroom Apartment in Midtown',
    );
  });
  it('falls back to the original when stripping empties it', () => {
    expect(cleanTitle('$1,850 / 2br')).toBe('$1,850 / 2br');
  });
});
