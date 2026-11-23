// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FONTS,
  FONT_CATALOGUE,
  appearanceSyncOff,
  fontsInUse,
  formatFontsCookie,
  isFontFor,
  normalizeFonts,
  parseFontsCookie,
} from '../fonts';

describe('font catalogue', () => {
  it('offers the twelve text faces and four mono faces the owner chose', () => {
    expect(FONT_CATALOGUE.filter((f) => f.kind !== 'mono').map((f) => f.id)).toEqual([
      'dm-sans',
      'inter',
      'geist',
      'ibm-plex-sans',
      'public-sans',
      'charter',
      'source-serif-4',
      'literata',
      'newsreader',
      'lora',
      'merriweather',
      'spectral',
    ]);
    expect(FONT_CATALOGUE.filter((f) => f.kind === 'mono').map((f) => f.id)).toEqual([
      'dm-mono',
      'jetbrains-mono',
      'geist-mono',
      'ibm-plex-mono',
    ]);
  });

  it('defaults to DM Sans, reading follows main, DM Mono', () => {
    expect(DEFAULT_FONTS).toEqual({ main: 'dm-sans', reading: 'same', mono: 'dm-mono' });
  });

  it('round-trips a choice through the cookie', () => {
    const c = { main: 'inter', reading: 'literata', mono: 'jetbrains-mono' } as const;
    expect(parseFontsCookie(`a=1; rmh-fonts=${formatFontsCookie(c)}`)).toEqual(c);
  });

  it('the default writes no cookie', () => {
    expect(formatFontsCookie(DEFAULT_FONTS)).toBeNull();
  });

  it('no cookie is not a choice', () => {
    expect(parseFontsCookie('a=1')).toBeNull();
    expect(parseFontsCookie(null)).toBeNull();
  });

  it('an unknown id falls back per slot', () => {
    expect(parseFontsCookie('rmh-fonts=evil.literata.x')).toEqual({
      main: 'dm-sans',
      reading: 'literata',
      mono: 'dm-mono',
    });
  });

  it('a mono face is not a main face, and same is only for reading', () => {
    expect(isFontFor('main', 'dm-mono')).toBe(false);
    expect(isFontFor('mono', 'inter')).toBe(false);
    expect(isFontFor('reading', 'same')).toBe(true);
    expect(isFontFor('main', 'same')).toBe(false);
  });

  it('normalizes a partial or bad choice per slot', () => {
    expect(normalizeFonts({ main: 'lora', mono: 42 })).toEqual({ main: 'lora', reading: 'same', mono: 'dm-mono' });
  });

  it('fontsInUse lists only non-default faces actually drawn, resolving same', () => {
    expect(fontsInUse(DEFAULT_FONTS)).toEqual([]);
    expect(fontsInUse({ main: 'inter', reading: 'same', mono: 'dm-mono' })).toEqual(['inter']);
    expect(fontsInUse({ main: 'inter', reading: 'inter', mono: 'geist-mono' })).toEqual(['inter', 'geist-mono']);
    expect(fontsInUse({ main: 'dm-sans', reading: 'lora', mono: 'dm-mono' })).toEqual(['lora']);
  });

  it('reads the per-device sync switch from the cookie', () => {
    expect(appearanceSyncOff('x=1; rmh-appearance-sync=0')).toBe(true);
    expect(appearanceSyncOff('rmh-appearance-sync=1')).toBe(false);
    expect(appearanceSyncOff(null)).toBe(false);
  });
});
