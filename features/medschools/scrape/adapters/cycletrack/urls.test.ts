import { describe, expect, it } from 'vitest';
import { normalizeSchoolKey } from '../../../engine/names';
import { loadFixture } from '../../test-support';
import { parseSitemap } from './parse-sitemap';
import { schoolUrl } from './urls';

describe('schoolUrl', () => {
  it('builds path-form URLs', () => {
    expect(schoolUrl('Yale')).toBe('https://cycletrack.org/explorer/school/Yale');
    expect(schoolUrl('Arizona - Phoenix')).toContain('Arizona%20-%20Phoenix');
    expect(schoolUrl('Yale', 'historical')).toMatch(/\/Yale\?view=historical$/);
    expect(schoolUrl('Texas A&M')).toBe('https://cycletrack.org/explorer/school/Texas%20A%26M');
  });

  it('round-trips every sitemap key', () => {
    const xml = loadFixture('sitemap.xml');
    const { schoolKeys } = parseSitemap(xml);
    for (const key of schoolKeys) {
      const tail = new URL(schoolUrl(key)).pathname.split('/explorer/school/')[1]!;
      expect(normalizeSchoolKey(tail)).toBe(key);
    }
    expect(normalizeSchoolKey('Arizona%20-%20Phoenix')).toBe('Arizona - Phoenix');
    expect(normalizeSchoolKey('Texas%20A&amp;M')).toBe('Texas A&M');
  });
});
