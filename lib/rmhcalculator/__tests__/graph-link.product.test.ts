import { describe, expect, it } from 'vitest';
import {
  GRAPH_LINK_MAX_FUNCTION_LENGTH,
  GRAPH_LINK_MAX_FUNCTIONS,
  GRAPH_LINK_MAX_SEARCH_LENGTH,
  buildGraphLink,
  parseGraphLink,
} from '@/lib/rmhcalculator/graph-link';

const ORIGIN = 'https://rmhstudios.com';
const search = (link: string) => new URL(link).search;

describe('a graph link round trip', () => {
  it('carries functions and a domain, and parses back to the same', () => {
    const content = { functions: ['sin(x)', 'x^2 - 3', '1/x', 'e^x'], domain: { min: -2.5, max: 10 } };
    const link = buildGraphLink(ORIGIN, content)!;
    expect(link.startsWith(`${ORIGIN}/rmhcalculator?tab=graph&`)).toBe(true);
    expect(parseGraphLink(search(link))).toEqual({ ok: true, ...content });
  });

  it('carries functions alone, with no domain', () => {
    const link = buildGraphLink(ORIGIN, { functions: ['cos(x)/x'] })!;
    expect(link).not.toContain('min=');
    expect(parseGraphLink(search(link))).toEqual({ ok: true, functions: ['cos(x)/x'], domain: null });
  });

  it('survives characters that need escaping and non-latin text', () => {
    const functions = ['a&b=c?#d', 'x + 1 /* % */', 'π·x', 'ln(|x|)'];
    const link = buildGraphLink(ORIGIN, { functions })!;
    expect(parseGraphLink(search(link))).toEqual({ ok: true, functions, domain: null });
  });

  it('trims functions, drops blank ones and never carries a saved graph, id or points', () => {
    const link = buildGraphLink(ORIGIN, { functions: ['  sin(x) ', '', '   '] })!;
    expect(parseGraphLink(search(link))).toMatchObject({ functions: ['sin(x)'] });
    expect([...new URL(link).searchParams.keys()].sort()).toEqual(['f', 'tab']);
  });

  it('accepts a link with or without the leading ?', () => {
    expect(parseGraphLink('tab=graph&f=x')).toEqual(parseGraphLink('?tab=graph&f=x'));
    expect(parseGraphLink('?tab=graph&f=x')).toMatchObject({ ok: true });
  });
});

describe('limits', () => {
  it('accepts four functions and refuses a fifth', () => {
    const four = Array.from({ length: GRAPH_LINK_MAX_FUNCTIONS }, (_, i) => `x+${i}`);
    expect(buildGraphLink(ORIGIN, { functions: four })).not.toBeNull();
    expect(buildGraphLink(ORIGIN, { functions: [...four, 'x'] })).toBeNull();
    const q = `?tab=graph&${[...four, 'x'].map((f) => `f=${encodeURIComponent(f)}`).join('&')}`;
    expect(parseGraphLink(q)).toEqual({ ok: false, reason: 'too-many' });
  });

  it('accepts a 200-character function and refuses 201', () => {
    const ok = 'x'.repeat(GRAPH_LINK_MAX_FUNCTION_LENGTH);
    expect(parseGraphLink(`?tab=graph&f=${ok}`)).toMatchObject({ ok: true });
    expect(parseGraphLink(`?tab=graph&f=${ok}x`)).toEqual({ ok: false, reason: 'function-too-long' });
    expect(buildGraphLink(ORIGIN, { functions: [`${ok}x`] })).toBeNull();
  });

  it('refuses a query string longer than the parser will read', () => {
    const q = `?tab=graph&f=x&pad=${'a'.repeat(GRAPH_LINK_MAX_SEARCH_LENGTH)}`;
    expect(parseGraphLink(q)).toEqual({ ok: false, reason: 'too-long' });
  });

  it('refuses control characters in a function', () => {
    expect(parseGraphLink('?tab=graph&f=x%00y')).toEqual({ ok: false, reason: 'bad-function' });
    expect(parseGraphLink('?tab=graph&f=x%0Ay')).toEqual({ ok: false, reason: 'bad-function' });
    expect(parseGraphLink('?tab=graph&f=x%C2%85y')).toEqual({ ok: false, reason: 'bad-function' });
  });

  it('refuses every function blank', () => {
    expect(parseGraphLink('?tab=graph&f=%20&f=')).toEqual({ ok: false, reason: 'bad-function' });
  });
});

describe('domains', () => {
  it.each([
    ['reversed', 'min=5&max=-5'],
    ['empty', 'min=3&max=3'],
    ['half (only min)', 'min=1'],
    ['half (only max)', 'max=1'],
    ['not a number', 'min=abc&max=2'],
    ['infinite', 'min=-Infinity&max=Infinity'],
    ['NaN', 'min=NaN&max=1'],
    ['blank', 'min=&max='],
    ['hex', 'min=0x10&max=0x20'],
    ['beyond a window a model can plot', 'min=-1e12&max=1e12'],
    ['overflowing', 'min=1e999&max=2e999'],
  ])('refuses a %s domain', (_name, q) => {
    expect(parseGraphLink(`?tab=graph&f=x&${q}`)).toEqual({ ok: false, reason: 'bad-domain' });
  });

  it('reads decimals, negatives and exponents', () => {
    expect(parseGraphLink('?tab=graph&f=x&min=-.5&max=1e2')).toMatchObject({ domain: { min: -0.5, max: 100 } });
  });

  it('the builder refuses a domain the parser would', () => {
    expect(buildGraphLink(ORIGIN, { functions: ['x'], domain: { min: 2, max: 1 } })).toBeNull();
    expect(buildGraphLink(ORIGIN, { functions: ['x'], domain: { min: 0, max: Number.NaN } })).toBeNull();
  });
});

describe('junk input is never a graph', () => {
  it.each([
    ['empty', ''],
    ['only a ?', '?'],
    ['another tab', '?tab=scientific&f=x'],
    ['no tab', '?f=x'],
    ['no functions', '?tab=graph'],
    ['only a domain', '?tab=graph&min=0&max=1'],
    ['garbage', '?%%%&&&===&f'],
    ['a number', '12'],
  ])('%s', (_name, q) => {
    const out = parseGraphLink(q);
    expect(out.ok).toBe(false);
  });

  it('does not throw on non-strings', () => {
    expect(parseGraphLink(undefined as unknown as string)).toEqual({ ok: false, reason: 'none' });
    expect(parseGraphLink(null as unknown as string)).toEqual({ ok: false, reason: 'none' });
  });

  it('keeps expressions as text: a script or URL in a function is just a function', () => {
    const out = parseGraphLink('?tab=graph&f=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    expect(out).toEqual({ ok: true, functions: ['<script>alert(1)</script>'], domain: null });
  });
});
