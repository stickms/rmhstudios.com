import { describe, expect, it } from 'vitest';
import { dedupeHash, locationBucket, normalizeCompanyName, normalizeTitle } from './normalize';

describe('normalizeCompanyName', () => {
  it('lowercases, strips punctuation and corporate suffixes', () => {
    expect(normalizeCompanyName('Moelis & Company')).toBe('moelis');
    expect(normalizeCompanyName('Deere & Co.')).toBe('deere');
    expect(normalizeCompanyName('BlackRock, Inc.')).toBe('blackrock');
    expect(normalizeCompanyName("Moody's")).toBe('moodys');
    expect(normalizeCompanyName('JPMorgan Chase')).toBe('jpmorgan chase');
  });
  it('never returns empty when the whole name is suffixes', () => {
    expect(normalizeCompanyName('Partners Group')).toBe('partners group');
  });
});

describe('normalizeTitle', () => {
  it('lowercases, strips punctuation/req ids, collapses whitespace, keeps years', () => {
    expect(normalizeTitle('Investment Banking Summer Analyst – 2027 (NYC) [R-12345]')).toBe(
      'investment banking summer analyst 2027 nyc',
    );
    expect(normalizeTitle('Software  Engineering   Intern')).toBe('software engineering intern');
  });
});

describe('locationBucket', () => {
  it('remote beats city; city+state; state only; fallback us', () => {
    expect(locationBucket({ city: 'New York', state: 'NY', remoteStatus: 'remote_us' })).toBe('remote-us');
    expect(locationBucket({ city: 'New York', state: 'NY' })).toBe('new york-ny');
    expect(locationBucket({ state: 'TX' })).toBe('tx');
    expect(locationBucket({})).toBe('us');
  });
});

describe('dedupeHash', () => {
  it('is stable and insensitive to formatting differences', () => {
    const a = dedupeHash('BlackRock, Inc.', 'Summer Analyst – 2027', 'new york-ny');
    const b = dedupeHash('blackrock', 'summer analyst 2027', 'new york-ny');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs when year differs', () => {
    expect(dedupeHash('X', 'Summer Analyst 2027', 'us')).not.toBe(dedupeHash('X', 'Summer Analyst 2028', 'us'));
  });
});
