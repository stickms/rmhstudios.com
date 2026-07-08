import { describe, it, expect } from 'vitest';
import {
  findShortcodeTrigger,
  searchShortcodes,
  replaceCompletedShortcode,
} from '@/lib/emoji/shortcode-matcher';

const MAP = { fire: '🔥', smile: '😄', smiley: '😃', sweat_smile: '😅', '+1': '👍', thumbsup: '👍' };

describe('findShortcodeTrigger', () => {
  it('matches a partial shortcode at the caret', () => {
    expect(findShortcodeTrigger('hello :fi', 9)).toEqual({ query: 'fi', start: 6 });
  });
  it('matches at the start of the text', () => {
    expect(findShortcodeTrigger(':sm', 3)).toEqual({ query: 'sm', start: 0 });
  });
  it('requires 2+ query characters', () => {
    expect(findShortcodeTrigger('hey :f', 6)).toBeNull();
  });
  it('does not fire inside times or URLs', () => {
    expect(findShortcodeTrigger('meet at 10:30', 13)).toBeNull();
    expect(findShortcodeTrigger('https://ex', 10)).toBeNull();
  });
  it('only looks at text before the caret', () => {
    expect(findShortcodeTrigger(':fire later', 3)).toEqual({ query: 'fi', start: 0 });
  });
});

describe('searchShortcodes', () => {
  it('ranks prefix matches before substring matches', () => {
    const names = searchShortcodes('smile', MAP).map((r) => r.name);
    expect(names[0]).toBe('smile');
    expect(names).toContain('sweat_smile');
  });
  it('dedupes aliases pointing at the same emoji', () => {
    const thumbs = searchShortcodes('1', MAP).filter((r) => r.emoji === '👍');
    expect(thumbs).toHaveLength(1);
  });
  it('respects the limit', () => {
    expect(searchShortcodes('s', MAP, 2)).toHaveLength(2);
  });
});

describe('replaceCompletedShortcode', () => {
  it('replaces a completed shortcode at the caret', () => {
    expect(replaceCompletedShortcode('nice :fire:', 11, MAP)).toEqual({
      next: 'nice 🔥',
      caret: 7,
    });
  });
  it('preserves text after the caret', () => {
    expect(replaceCompletedShortcode(':fire: later', 6, MAP)).toEqual({
      next: '🔥 later',
      caret: 2,
    });
  });
  it('is case-insensitive on the name', () => {
    expect(replaceCompletedShortcode(':FIRE:', 6, MAP)?.next).toBe('🔥');
  });
  it('returns null for unknown names and non-shortcodes', () => {
    expect(replaceCompletedShortcode(':notreal:', 9, MAP)).toBeNull();
    expect(replaceCompletedShortcode('10:30:', 6, MAP)).toBeNull();
  });
});
