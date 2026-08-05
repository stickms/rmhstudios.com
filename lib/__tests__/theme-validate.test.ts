import { describe, it, expect } from 'vitest';
import {
  validateTheme,
  validateThemeForPublish,
  isSafeDeclaration,
  ALLOWED_CSS_FUNCTIONS,
  ALLOWED_VAR_NAMES,
} from '@/lib/themes/validate';
import { DEFAULT_THEME_TOKENS, themeCssVars, THEME_VAR_NAMES } from '@/lib/themes/tokens';
import { THEME_PRICE_MIN, THEME_PRICE_MAX } from '@/lib/themes/tokens';

/**
 * The marketplace gate (F18). A theme is a stranger's CSS running on your
 * document, so these tests are about what CANNOT get through — the input
 * contract is covered by `theme-tokens.test.ts`; this file covers the derived
 * stylesheet that actually reaches the DOM, and the publish gate.
 */

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

describe('validateTheme — the derived stylesheet', () => {
  it('accepts the default palette and returns applicable vars', () => {
    const r = validateTheme(DEFAULT_THEME_TOKENS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.vars).length).toBeGreaterThan(20);
    expect(r.vars['--site-bg']).toBe(DEFAULT_THEME_TOKENS.canvasBase);
  });

  it('upcasts a stored v1 map rather than rejecting it', () => {
    const r = validateTheme(V1_SAMPLE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens.v).toBe(2);
    expect(r.tokens.canvasBase).toBe(V1_SAMPLE.bg);
  });

  it('rejects an unknown token key (closed input contract)', () => {
    const r = validateTheme({ ...DEFAULT_THEME_TOKENS, '--site-evil': 'url(x)' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('INVALID_TOKENS');
  });

  it.each([
    ['url() injection', 'url(https://evil.example/x.png)'],
    ['declaration break', '#000; background: url(x)'],
    ['rule break', '#000 } body { display: none'],
    ['comment escape', '#000 /* x */'],
    ['expression', 'expression(alert(1))'],
    ['non-hex keyword', 'red'],
  ])('rejects %s as a token value', (_label, value) => {
    const r = validateTheme({ ...DEFAULT_THEME_TOKENS, accent: value });
    expect(r.ok).toBe(false);
  });

  it('every derived value survives its own declaration check', () => {
    const vars = themeCssVars(DEFAULT_THEME_TOKENS);
    for (const [name, value] of Object.entries(vars)) {
      expect(isSafeDeclaration(name, value), `${name}: ${value}`).toBe(true);
    }
  });

  it('the emitted name set is exactly the allowlist (no drift)', () => {
    const emitted = Object.keys(themeCssVars(DEFAULT_THEME_TOKENS));
    expect(new Set(emitted)).toEqual(new Set(THEME_VAR_NAMES));
    for (const name of emitted) expect(ALLOWED_VAR_NAMES.has(name)).toBe(true);
  });
});

describe('isSafeDeclaration — the closed function allowlist', () => {
  it('rejects a property name outside the allowlist', () => {
    expect(isSafeDeclaration('--site-not-a-token', '#000000')).toBe(false);
    expect(isSafeDeclaration('behavior', 'url(x.htc)')).toBe(false);
  });

  it('rejects url() and every other unlisted function', () => {
    for (const fn of ['url', 'expression', 'image-set', 'attr', 'element', 'url']) {
      expect(isSafeDeclaration('--site-bg', `${fn}(x)`), fn).toBe(false);
    }
  });

  it('url is not on the allowlist', () => {
    expect(ALLOWED_CSS_FUNCTIONS).not.toContain('url');
  });

  it('accepts the four functions the derivation actually emits', () => {
    expect(isSafeDeclaration('--site-surface', 'rgba(255, 255, 255, 0.1)')).toBe(true);
    expect(isSafeDeclaration('--site-accent-hover', 'color-mix(in oklab, #6cc9ff 82%, #000)')).toBe(true);
    expect(
      isSafeDeclaration('--site-canvas', 'radial-gradient(110% 85% at 10% -5%, rgba(1,2,3,0.3), transparent 62%)'),
    ).toBe(true);
  });

  it('is case-insensitive about function names', () => {
    expect(isSafeDeclaration('--site-bg', 'URL(x)')).toBe(false);
    expect(isSafeDeclaration('--site-bg', 'Url(x)')).toBe(false);
  });

  it('rejects control characters used to smuggle a break', () => {
    expect(isSafeDeclaration('--site-bg', '#000000\u0000')).toBe(false);
    expect(isSafeDeclaration('--site-bg', '#000000\n; color: red')).toBe(false);
  });
});

describe('validateThemeForPublish — the contrast gate', () => {
  it('passes a legible theme', () => {
    const r = validateThemeForPublish(DEFAULT_THEME_TOKENS, 500);
    expect(r.ok).toBe(true);
  });

  it('refuses a theme whose body text fails AA', () => {
    // Near-black ink on the dark glass backdrop: a broken site, not a style.
    const r = validateThemeForPublish({ ...DEFAULT_THEME_TOKENS, text: '#101418' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('CONTRAST');
    expect(r.issues?.[0].pair).toBe('text-on-glass');
    expect(r.issues?.[0].ratio).toBeLessThan(4.5);
  });

  it('refuses an unreadable accent label', () => {
    const r = validateThemeForPublish({
      ...DEFAULT_THEME_TOKENS,
      accent: '#fbbf24',
      accentFg: '#fde68a',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('CONTRAST');
  });

  it('a draft may be illegible; only publishing is gated', () => {
    const illegible = { ...DEFAULT_THEME_TOKENS, text: '#101418' };
    expect(validateTheme(illegible).ok).toBe(true);
    expect(validateThemeForPublish(illegible).ok).toBe(false);
  });

  it('enforces the published price range', () => {
    expect(validateThemeForPublish(DEFAULT_THEME_TOKENS, THEME_PRICE_MIN - 1).ok).toBe(false);
    expect(validateThemeForPublish(DEFAULT_THEME_TOKENS, THEME_PRICE_MAX + 1).ok).toBe(false);
    expect(validateThemeForPublish(DEFAULT_THEME_TOKENS, THEME_PRICE_MIN).ok).toBe(true);
    expect(validateThemeForPublish(DEFAULT_THEME_TOKENS, THEME_PRICE_MAX).ok).toBe(true);
  });

  it('reports the price problem as PRICE_RANGE, not as a token problem', () => {
    const r = validateThemeForPublish(DEFAULT_THEME_TOKENS, 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('PRICE_RANGE');
  });
});
