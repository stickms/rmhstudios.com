import { describe, it, expect } from 'vitest';
import {
  themeTokensSchema,
  DEFAULT_THEME_TOKENS,
  THEME_TOKENS_VERSION,
  TINT_ALPHA_MAX_DARK,
  lintThemeContrast,
  canPublish,
  upcastTokens,
  upcastV1,
  readTokens,
  themeCssVars,
} from '@/lib/themes/tokens';

// The v1 map the studio shipped before the v2 glass contract (§14.1). Existing
// drafts/purchases persist exactly this shape and must keep parsing.
const V1_SAMPLE = {
  v: 1 as const,
  bg: '#0d1b2e',
  surface: '#16263c',
  surfaceHover: '#1d3350',
  text: '#e8eefc',
  textMuted: '#9fb2cf',
  border: '#243a58',
  accent: '#6d28d9',
  accentFg: '#ffffff',
  radius: 18,
};

describe('themeTokensSchema (v2)', () => {
  it('accepts a valid closed token map', () => {
    expect(themeTokensSchema.safeParse(DEFAULT_THEME_TOKENS).success).toBe(true);
    expect(DEFAULT_THEME_TOKENS.v).toBe(2);
  });

  it('is strict — rejects unknown keys (no CSS injection surface)', () => {
    expect(themeTokensSchema.safeParse({ ...DEFAULT_THEME_TOKENS, evil: 'url(x)' }).success).toBe(false);
  });

  it('rejects non-hex colors and injection strings', () => {
    expect(themeTokensSchema.safeParse({ ...DEFAULT_THEME_TOKENS, accent: 'red; content:x' }).success).toBe(false);
    expect(themeTokensSchema.safeParse({ ...DEFAULT_THEME_TOKENS, canvasBase: 'rgb(0,0,0)' }).success).toBe(false);
  });

  it('rejects a v1 map directly (v2 writes only) and out-of-range radius', () => {
    expect(themeTokensSchema.safeParse(V1_SAMPLE).success).toBe(false);
    expect(themeTokensSchema.safeParse({ ...DEFAULT_THEME_TOKENS, radius: 99 }).success).toBe(false);
  });

  it('clamps tintAlpha by canvasBase luminance (§14.1)', () => {
    // A dark base caps tintAlpha at the low ceiling.
    expect(themeTokensSchema.safeParse({ ...DEFAULT_THEME_TOKENS, tintAlpha: 0.5 }).success).toBe(false);
    expect(themeTokensSchema.safeParse({ ...DEFAULT_THEME_TOKENS, tintAlpha: TINT_ALPHA_MAX_DARK }).success).toBe(true);
    // A light base allows the higher ceiling.
    const light = { ...DEFAULT_THEME_TOKENS, canvasBase: '#efe4cf', text: '#3a2e1e', tintAlpha: 0.5 };
    expect(themeTokensSchema.safeParse(light).success).toBe(true);
  });
});

describe('v1 → v2 upcast (§14.1)', () => {
  it('upcasts a v1 map to a valid v2 map, carrying the invariants', () => {
    const v2 = upcastTokens(V1_SAMPLE);
    expect(themeTokensSchema.safeParse(v2).success).toBe(true);
    expect(v2.v).toBe(THEME_TOKENS_VERSION);
    expect(v2.canvasBase).toBe(V1_SAMPLE.bg);
    expect(v2.tint).toBe(V1_SAMPLE.surface);
    expect(v2.accent).toBe(V1_SAMPLE.accent);
    expect(v2.accentFg).toBe(V1_SAMPLE.accentFg);
    expect(v2.radius).toBe(V1_SAMPLE.radius);
    // tintAlpha lands inside the dark-base legal range.
    expect(v2.tintAlpha).toBeGreaterThanOrEqual(0.04);
    expect(v2.tintAlpha).toBeLessThanOrEqual(TINT_ALPHA_MAX_DARK);
  });

  it('is deterministic and stable through a re-parse round-trip', () => {
    const once = upcastTokens(V1_SAMPLE);
    const twice = upcastTokens(V1_SAMPLE);
    expect(twice).toEqual(once);
    // upcasting an already-v2 map returns it unchanged (idempotent read path).
    expect(upcastTokens(once)).toEqual(once);
    expect(upcastV1(V1_SAMPLE)).toEqual(once);
  });

  it('passes a v2 map through untouched', () => {
    expect(upcastTokens(DEFAULT_THEME_TOKENS)).toEqual(DEFAULT_THEME_TOKENS);
  });

  it('readTokens falls back to the default palette on a garbage map', () => {
    expect(readTokens({ nope: true })).toEqual(DEFAULT_THEME_TOKENS);
    expect(() => upcastTokens({ nope: true })).toThrow();
  });
});

describe('themeCssVars (v2 derivation)', () => {
  it('derives the full glass contract from the closed token map', () => {
    const vars = themeCssVars(DEFAULT_THEME_TOKENS);
    // A representative slice of the derived contract exists and is non-empty.
    for (const key of [
      '--site-canvas',
      '--site-glass-tint',
      '--site-glass-rim',
      '--site-glass-glint',
      '--glass-glint-opacity',
      '--site-surface-opaque',
      '--site-aurora-far-1',
      '--site-glass-depth',
    ]) {
      expect(typeof vars[key]).toBe('string');
      expect(vars[key].length).toBeGreaterThan(0);
    }
    // The system geometry (blur/saturate/fonts) is intentionally NOT set.
    expect(vars['--site-glass-blur-pane']).toBeUndefined();
    expect(vars['--site-glass-saturate']).toBeUndefined();
  });
});

describe('publish gate (§14.3)', () => {
  it('the default palette passes the contrast gate', () => {
    expect(lintThemeContrast(DEFAULT_THEME_TOKENS)).toEqual([]);
    expect(canPublish(DEFAULT_THEME_TOKENS)).toBe(true);
  });

  it('flags an unreadable accent label (accentFg == accent)', () => {
    const bad = { ...DEFAULT_THEME_TOKENS, accentFg: DEFAULT_THEME_TOKENS.accent };
    expect(lintThemeContrast(bad).some((i) => i.pair === 'accentFg-on-accent')).toBe(true);
    expect(canPublish(bad)).toBe(false);
  });

  it('flags illegible body text over the glass', () => {
    const bad = { ...DEFAULT_THEME_TOKENS, text: '#0e1a2b' };
    expect(lintThemeContrast(bad).some((i) => i.pair === 'text-on-glass')).toBe(true);
    expect(canPublish(bad)).toBe(false);
  });
});
