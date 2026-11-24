import { describe, expect, it } from 'vitest';
import { THEME_FIXTURE } from './fixtures';
import { THEME_IDS, isThemeId } from './theme-ids';
import { THEMES_VERSION, tagThemes } from './themes';

describe('tagThemes', () => {
  it('pins the rule-table version', () => {
    expect(THEMES_VERSION).toBe(1);
  });

  it('has at least forty labelled prompts', () => {
    expect(THEME_FIXTURE.length).toBeGreaterThanOrEqual(40);
  });

  it.each(THEME_FIXTURE.map((f) => [f.text, f.themes] as const))('tags %j', (text, themes) => {
    expect(tagThemes(text)).toEqual(themes);
  });

  it('is sorted in THEME_IDS order, de-duplicated, and never mixes other with another theme', () => {
    for (const { text } of THEME_FIXTURE) {
      const t = tagThemes(text);
      expect(t).toEqual([...new Set(t)]);
      expect(t).toEqual(THEME_IDS.filter((id) => t.includes(id)));
      if (t.includes('other')) expect(t).toEqual(['other']);
    }
    expect(tagThemes('')).toEqual(['other']);
  });

  it('tags the whole fixture quickly', () => {
    const start = performance.now();
    for (const { text } of THEME_FIXTURE) tagThemes(text);
    expect(performance.now() - start).toBeLessThan(50);
  });

  it('knows its ids', () => {
    expect(isThemeId('growth')).toBe(true);
    expect(isThemeId('nonsense')).toBe(false);
    expect(THEME_IDS.at(-1)).toBe('other');
  });
});
