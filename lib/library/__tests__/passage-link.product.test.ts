import { describe, expect, it } from 'vitest';
import {
  PASSAGE_CODE_MAX,
  buildPassageShare,
  decodePassage,
  encodePassage,
  parsePassageSearch,
  passageMarkEnd,
  selectionAnchor,
} from '../passage-link';
import { createAnchor } from '../text-anchor';

const text = 'The tide pulls twice daily. Sailors knew it long before the moon was understood. Then came the charts.';
const anchor = createAnchor(text, 28, 80)!;

describe('passage link codes', () => {
  it('round-trips an anchor and its unit', () => {
    const code = encodePassage(anchor, 'p12')!;
    expect(code.startsWith('v1.')).toBe(true);
    expect(decodePassage(code)).toEqual({ unit: 'p12', anchor });
    expect(decodePassage(encodePassage(anchor, '')!)?.unit).toBe('');
  });

  it('is URL-safe', () => {
    expect(encodePassage(anchor, 'c3')).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
  });

  it('truncates a long selection to its first 300 characters and keeps end', () => {
    const long = 'abcdefghij'.repeat(100);
    const a = createAnchor(long + ' tail', 0, 1000)!;
    const got = decodePassage(encodePassage(a, '')!)!;
    expect(got.anchor.exact).toBe(long.slice(0, 300));
    expect(got.anchor.end).toBe(1000);
    expect(passageMarkEnd(got.anchor, 0, 2000)).toBe(1000);
  });

  it('trims context to 32 characters', () => {
    const t = 'x'.repeat(100) + 'target' + 'y'.repeat(100);
    const got = decodePassage(encodePassage(createAnchor(t, 100, 106)!, '')!)!;
    expect(got.anchor.prefix).toBe('x'.repeat(32));
    expect(got.anchor.suffix).toBe('y'.repeat(32));
  });

  it('round-trips Arabic and emoji, and fits wide text under the code limit', () => {
    const ar = 'مرحبا بالعالم، هذا نص طويل. '.repeat(20);
    const a = createAnchor(ar, 0, ar.length)!;
    const code = encodePassage(a, 'c1')!;
    expect(code.length).toBeLessThanOrEqual(PASSAGE_CODE_MAX);
    const got = decodePassage(code)!;
    expect(ar.startsWith(got.anchor.exact)).toBe(true);
    const em = 'Tides 🌊 rise 🌙 and fall 🌊';
    expect(decodePassage(encodePassage(createAnchor(em, 0, em.length)!, '')!)?.anchor.exact).toBe(em);
    const emojis = '🌊'.repeat(250);
    const g = decodePassage(encodePassage(createAnchor(emojis, 0, emojis.length)!, '')!)!;
    expect(emojis.startsWith(g.anchor.exact)).toBe(true);
    expect(g.anchor.exact).not.toMatch(/[\uD800-\uDBFF]$/);
  });

  it('returns null for malformed, oversized and unknown-version codes without throwing', () => {
    const good = encodePassage(anchor, '')!;
    for (const bad of [
      '',
      'v1.',
      'v2.' + good.slice(3),
      good.slice(3),
      'v1.!!!',
      'v1.' + 'A'.repeat(PASSAGE_CODE_MAX),
      'v1.' + btoa('not json'),
      'v1.' + btoa('[1,2,3]'),
      'v1.' + btoa('{"a":1}'),
      undefined,
      42,
      null,
    ]) {
      expect(decodePassage(bad)).toBeNull();
    }
  });

  it('rejects out-of-bounds fields', () => {
    const enc = (v: unknown[]) => 'v1.' + btoa(JSON.stringify(v)).replace(/=+$/, '');
    expect(decodePassage(enc(['', 5, 3, 'x', '', '']))).toBeNull();
    expect(decodePassage(enc(['', -1, 3, 'x', '', '']))).toBeNull();
    expect(decodePassage(enc(['', 0, 3, '', '', '']))).toBeNull();
    expect(decodePassage(enc(['', 0, 400, 'x'.repeat(301), '', '']))).toBeNull();
    expect(decodePassage(enc(['', 0, 3, 'x', 'y'.repeat(33), '']))).toBeNull();
    expect(decodePassage(enc(['', 0, 3, 'x', '', 'y'.repeat(33)]))).toBeNull();
    expect(decodePassage(enc(['page 1', 0, 3, 'x', '', '']))).toBeNull();
    expect(decodePassage(enc(['', 0.5, 3, 'x', '', '']))).toBeNull();
    expect(decodePassage(enc(['', 0, 3, 'x', '', '']))).not.toBeNull();
  });

  it('refuses to encode an empty anchor or a bad unit', () => {
    expect(encodePassage({ ...anchor, exact: '' }, '')).toBeNull();
    expect(encodePassage(anchor, 'x9')).toBeNull();
  });

  it('parsePassageSearch keeps strings within the limit only', () => {
    expect(parsePassageSearch('abc')).toBe('abc');
    expect(parsePassageSearch('')).toBeUndefined();
    expect(parsePassageSearch('a'.repeat(PASSAGE_CODE_MAX + 1))).toBeUndefined();
    expect(parsePassageSearch(['a'])).toBeUndefined();
  });

  it('selectionAnchor trims surrounding whitespace', () => {
    const a = selectionAnchor('one  two  three', 3, 10)!;
    expect(a.exact).toBe('two');
    expect(selectionAnchor('   ', 0, 3)).toBeNull();
  });
});

describe('buildPassageShare', () => {
  const format = (q: string, t: string) => `“${q}” — ${t}`;
  const base = { unit: '', origin: 'https://example.test', pathname: '/news/tides', format };

  it('puts the quote and title in text and the passage link in url', () => {
    const s = buildPassageShare({ ...base, anchor, title: 'On Tides' })!;
    expect(s.text).toBe(`“${anchor.exact}” — On Tides`);
    expect(s.url.startsWith('https://example.test/news/tides?p=v1.')).toBe(true);
    expect(decodePassage(s.url.split('?p=')[1])?.anchor.exact).toBe(anchor.exact);
  });

  it('fits the composer draft (500 characters) with the whole link and shortens the quote', () => {
    const long = 'word '.repeat(150).trim();
    const a = createAnchor(long, 0, long.length)!;
    const s = buildPassageShare({ ...base, anchor: a, title: 'T'.repeat(200) })!;
    expect(s.text.length + 2 + s.url.length).toBeLessThanOrEqual(500);
    expect(s.text).toContain('…');
  });
});
