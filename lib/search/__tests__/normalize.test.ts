import { describe, it, expect } from 'vitest';
import {
  fold,
  foldWords,
  initials,
  normalizeQuery,
  tokenize,
  trigrams,
  trigramSet,
} from '../normalize';

describe('fold', () => {
  it('lowercases and strips diacritics', () => {
    expect(fold('José')).toBe('jose');
    expect(fold('Ångström')).toBe('angstrom');
    expect(fold('RENÉE')).toBe('renee');
  });

  it('leaves scripts without combining marks alone', () => {
    expect(fold('東京')).toBe('東京');
    expect(fold('Привет')).toBe('привет');
  });
});

describe('foldWords', () => {
  it('reduces punctuation to single spaces', () => {
    expect(foldWords('@Renée_D-2')).toBe('renee d 2');
    expect(foldWords('  Hello,   World!  ')).toBe('hello world');
  });

  it('keeps digits and non-Latin letters', () => {
    expect(foldWords('Velum 2099')).toBe('velum 2099');
    expect(foldWords('東京 tower')).toBe('東京 tower');
  });

  it('returns an empty string for punctuation-only input', () => {
    expect(foldWords('!!!')).toBe('');
  });
});

describe('normalizeQuery', () => {
  it('strips the sigils people type in front of a name', () => {
    // Searching "@ada" and "ada" must reach the same person — the @ is how the
    // site renders a handle, not part of it.
    expect(normalizeQuery('@ada')).toBe('ada');
    expect(normalizeQuery('#gamedev')).toBe('gamedev');
    expect(normalizeQuery('/settings')).toBe('settings');
  });

  it('folds accents so an accented name is reachable from a plain keyboard', () => {
    expect(normalizeQuery('José García')).toBe('jose garcia');
  });
});

describe('tokenize / initials', () => {
  it('splits and takes leading letters', () => {
    expect(tokenize('rmh studios box')).toEqual(['rmh', 'studios', 'box']);
    expect(initials('rmh studios box')).toBe('rsb');
    expect(tokenize('')).toEqual([]);
    expect(initials('')).toBe('');
  });
});

describe('trigrams', () => {
  it('pads like pg_trgm so prefixes carry weight', () => {
    expect([...trigrams('cat')]).toEqual(['  c', ' ca', 'cat', 'at ']);
  });

  it('unions across words', () => {
    const set = trigramSet('ad be');
    expect(set.has('  a')).toBe(true);
    expect(set.has('  b')).toBe(true);
  });
});
