/** GIF descriptions (sprint 06 #15): the pure rules, shared by the composers, the renderers and the server. */
import { describe, expect, it } from 'vitest';
import {
  MAX_GIF_ALT_LENGTH,
  gifAltOrNull,
  gifMissingAlt,
  normalizeGifAlt,
  prefillGifAlt,
  resolveEditedGifAlt,
  sanitizeGifAlt,
} from '@/lib/feed/gif-alt';
import { MAX_IMAGE_ALT_LENGTH } from '@/lib/rmhark-limits';

const GIF = 'https://media.tenor.com/a/b.gif';
const OTHER = 'https://media.tenor.com/c/d.gif';

describe('the limit', () => {
  it('is the image description limit', () => {
    expect(MAX_GIF_ALT_LENGTH).toBe(MAX_IMAGE_ALT_LENGTH);
  });
});

describe('sanitizeGifAlt', () => {
  it('trims and keeps one line of plain text', () => {
    expect(sanitizeGifAlt('  a cat  waving\n\tat you\r\n')).toBe('a cat waving at you');
  });

  it('turns control and separator characters into spaces', () => {
    expect(sanitizeGifAlt('a\u0000b c\u0085d')).toBe('a b c d');
  });

  it('caps the length', () => {
    expect(sanitizeGifAlt('x'.repeat(MAX_GIF_ALT_LENGTH + 50))).toHaveLength(MAX_GIF_ALT_LENGTH);
  });

  it('leaves markup as text (it is never rendered as HTML)', () => {
    expect(sanitizeGifAlt('<b>hi</b>')).toBe('<b>hi</b>');
  });
});

describe('normalizeGifAlt', () => {
  it('stores the cleaned description beside a GIF', () => {
    expect(normalizeGifAlt(GIF, '  A cat  ')).toBe('A cat');
  });

  it('stores null for an absent or blank description', () => {
    expect(normalizeGifAlt(GIF, undefined)).toBeNull();
    expect(normalizeGifAlt(GIF, null)).toBeNull();
    expect(normalizeGifAlt(GIF, '   \n ')).toBeNull();
  });

  it('never outlives its GIF', () => {
    expect(normalizeGifAlt(undefined, 'A cat')).toBeNull();
    expect(normalizeGifAlt(null, 'A cat')).toBeNull();
    expect(normalizeGifAlt('', 'A cat')).toBeNull();
  });
});

describe('prefillGifAlt', () => {
  it('takes the provider text, cleaned and capped', () => {
    expect(prefillGifAlt('  Cat waves \n hello ')).toBe('Cat waves hello');
    expect(prefillGifAlt('y'.repeat(MAX_GIF_ALT_LENGTH * 2))).toHaveLength(MAX_GIF_ALT_LENGTH);
  });

  it('is empty when the provider sent none', () => {
    expect(prefillGifAlt(undefined)).toBe('');
    expect(prefillGifAlt(null)).toBe('');
    expect(prefillGifAlt('')).toBe('');
  });
});

describe('the fallback', () => {
  it('uses the description when there is one', () => {
    expect(gifAltOrNull('A cat')).toBe('A cat');
  });

  it('is null (the caller shows the translated "GIF") when there is none', () => {
    expect(gifAltOrNull(undefined)).toBeNull();
    expect(gifAltOrNull(null)).toBeNull();
    expect(gifAltOrNull('   ')).toBeNull();
  });

  it('knows an undescribed GIF, and only a GIF', () => {
    expect(gifMissingAlt(GIF, '')).toBe(true);
    expect(gifMissingAlt(GIF, undefined)).toBe(true);
    expect(gifMissingAlt(GIF, 'A cat')).toBe(false);
    expect(gifMissingAlt(undefined, '')).toBe(false);
  });
});

describe('resolveEditedGifAlt', () => {
  const base = { existingUrl: GIF, existingAlt: 'A cat' };

  it('leaves everything when nothing is sent', () => {
    expect(resolveEditedGifAlt({ ...base, nextUrl: undefined, nextAlt: undefined })).toEqual({
      gifUrl: GIF,
      gifAlt: 'A cat',
    });
  });

  it('replaces the description when only a description is sent', () => {
    expect(resolveEditedGifAlt({ ...base, nextUrl: undefined, nextAlt: ' A cat waving ' })).toEqual({
      gifUrl: GIF,
      gifAlt: 'A cat waving',
    });
  });

  it('clears the description with null or blank', () => {
    expect(resolveEditedGifAlt({ ...base, nextUrl: undefined, nextAlt: null }).gifAlt).toBeNull();
    expect(resolveEditedGifAlt({ ...base, nextUrl: undefined, nextAlt: '  ' }).gifAlt).toBeNull();
  });

  it('starts a new GIF from the description sent with it', () => {
    expect(resolveEditedGifAlt({ ...base, nextUrl: OTHER, nextAlt: 'A dog' })).toEqual({
      gifUrl: OTHER,
      gifAlt: 'A dog',
    });
  });

  it('does not carry the old description onto a new GIF', () => {
    expect(resolveEditedGifAlt({ ...base, nextUrl: OTHER, nextAlt: undefined })).toEqual({
      gifUrl: OTHER,
      gifAlt: null,
    });
  });

  it('keeps the description when the same GIF is sent again without one', () => {
    expect(resolveEditedGifAlt({ ...base, nextUrl: GIF, nextAlt: undefined }).gifAlt).toBe('A cat');
  });

  it('removing the GIF removes the description, even if one is sent', () => {
    expect(resolveEditedGifAlt({ ...base, nextUrl: null, nextAlt: 'A cat' })).toEqual({
      gifUrl: null,
      gifAlt: null,
    });
  });

  it('does not invent a description for a post with no GIF', () => {
    expect(
      resolveEditedGifAlt({ existingUrl: null, existingAlt: null, nextUrl: undefined, nextAlt: 'orphan' }),
    ).toEqual({ gifUrl: null, gifAlt: null });
  });
});
