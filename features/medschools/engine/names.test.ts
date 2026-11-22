import { describe, it, expect } from 'vitest';
import { isCanadianLocation, normalizeSchoolKey, slugify } from './names';

describe('names', () => {
  it('normalizeSchoolKey unescapes HTML then URL encoding, nothing else', () => {
    expect(normalizeSchoolKey('Texas%20A&amp;M')).toBe('Texas A&M');
    expect(normalizeSchoolKey('Massachussetts')).toBe('Massachussetts');
    expect(normalizeSchoolKey('Arizona%20-%20Phoenix')).toBe('Arizona - Phoenix');
    expect(normalizeSchoolKey('  Yale  ')).toBe('Yale');
  });
  it('isCanadianLocation', () => {
    expect(isCanadianLocation('Toronto, ON')).toBe(true);
    expect(isCanadianLocation('Kingston, ON')).toBe(true);
    expect(isCanadianLocation('New Haven, CT')).toBe(false);
    expect(isCanadianLocation('Portland, OR')).toBe(false);
  });
  it('slugify', () => {
    expect(slugify('Texas A&M University College of Medicine')).toBe('texas-a-m-university-college-of-medicine');
  });
});
