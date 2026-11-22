import { describe, expect, it } from 'vitest';
import { loadFixture } from '../../test-support';
import { parseSitemap } from './parse-sitemap';

describe('parseSitemap', () => {
  const { schoolKeys, historicalKeys } = parseSitemap(loadFixture('sitemap.xml'));

  it('counts', () => {
    expect(schoolKeys).toHaveLength(238);
    expect(historicalKeys).toHaveLength(185);
  });

  it('keeps source spellings, decoded once', () => {
    expect(schoolKeys).toContain('Texas A&M');
    expect(schoolKeys).toContain('Massachussetts');
    for (const k of [...schoolKeys, ...historicalKeys]) {
      expect(k).not.toMatch(/%|&amp;|\?view=historical/);
    }
  });
});
