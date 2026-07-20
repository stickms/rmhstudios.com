import { describe, it, expect } from 'vitest';
import { themeTokensSchema, DEFAULT_THEME_TOKENS, THEME_TOKENS_VERSION } from '@/lib/themes/tokens';
import { lintThemeContrast, canPublish } from '@/lib/themes/validate';

describe('themeTokensSchema', () => {
  it('accepts a valid closed token map', () => {
    expect(themeTokensSchema.safeParse(DEFAULT_THEME_TOKENS).success).toBe(true);
  });

  it('is strict — rejects unknown keys (no CSS injection surface)', () => {
    expect(themeTokensSchema.safeParse({ ...DEFAULT_THEME_TOKENS, evil: 'url(x)' }).success).toBe(false);
  });

  it('rejects non-hex colors and injection strings', () => {
    expect(themeTokensSchema.safeParse({ ...DEFAULT_THEME_TOKENS, accent: 'red; content:x' }).success).toBe(false);
    expect(themeTokensSchema.safeParse({ ...DEFAULT_THEME_TOKENS, bg: 'rgb(0,0,0)' }).success).toBe(false);
  });

  it('rejects bad version and out-of-range radius', () => {
    expect(themeTokensSchema.safeParse({ ...DEFAULT_THEME_TOKENS, v: 2 }).success).toBe(false);
    expect(themeTokensSchema.safeParse({ ...DEFAULT_THEME_TOKENS, radius: 99 }).success).toBe(false);
  });
});

describe('publish gate', () => {
  it('the default palette passes the contrast gate', () => {
    expect(lintThemeContrast(DEFAULT_THEME_TOKENS)).toEqual([]);
    expect(canPublish(DEFAULT_THEME_TOKENS)).toBe(true);
  });

  it('flags an illegible theme (text == background)', () => {
    const bad = { ...DEFAULT_THEME_TOKENS, v: THEME_TOKENS_VERSION, text: '#0d1b2e' };
    const issues = lintThemeContrast(bad);
    expect(issues.some((i) => i.pair === 'text-on-bg')).toBe(true);
    expect(canPublish(bad)).toBe(false);
  });
});
