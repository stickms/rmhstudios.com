/**
 * `normalizeTag` — the shared fold from "some string someone offered" to the
 * exact value stored in the hashtag table.
 *
 * It exists because there are now two ways a tag reaches a post: typed into the
 * body (parsed by `extractHashtags`) and tapped from an AI suggestion (parsed
 * by nothing — the model just returns a word). If those two paths disagree by
 * so much as a capital letter, `#Speedrun` and `#speedrun` become two rows, and
 * the tag feed everyone follows quietly splits in half.
 *
 * So the property under test is agreement: whatever `normalizeTag` produces for
 * a candidate has to be what `extractHashtags` produces when that same tag is
 * written into a post.
 */

import { describe, expect, it } from 'vitest';
import { extractHashtags, normalizeTag } from '@/lib/tags-extract.server';

describe('normalizeTag', () => {
  it('lowercases and strips a leading hash', () => {
    expect(normalizeTag('#Speedrun')).toBe('speedrun');
    expect(normalizeTag('ALTAIR')).toBe('altair');
  });

  it('drops characters a hashtag cannot contain', () => {
    expect(normalizeTag('boss-fight')).toBe('bossfight');
    expect(normalizeTag('game dev!')).toBe('gamedev');
    expect(normalizeTag('#c++')).toBe('c');
  });

  it('keeps letters, digits and underscores, including non-Latin ones', () => {
    expect(normalizeTag('rust_lang2')).toBe('rust_lang2');
    expect(normalizeTag('日本語')).toBe('日本語');
  });

  it('rejects pure-number and empty candidates, exactly as the parser does', () => {
    expect(normalizeTag('2024')).toBe('');
    expect(normalizeTag('#42')).toBe('');
    expect(normalizeTag('!!!')).toBe('');
    expect(normalizeTag('')).toBe('');
    // The parser skips `#2024` in a post body for the same reason.
    expect(extractHashtags('shipped in #2024')).toEqual([]);
  });

  it('truncates to the 64-character column limit', () => {
    expect(normalizeTag('a'.repeat(200))).toHaveLength(64);
  });

  it('agrees with extractHashtags — the property the split-feed bug turns on', () => {
    for (const candidate of ['Speedrun', 'boss-fight', 'RUST_lang2', '#Altair']) {
      const normalized = normalizeTag(candidate);
      // Writing the normalized tag into a post must parse back to itself.
      expect(extractHashtags(`a post about #${normalized}`)).toEqual([normalized]);
    }
  });
});
