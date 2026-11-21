/** Content warnings (sprint 06 #16): the pure rule, `applyContentWarning`, and the helpers around it. */
import { describe, expect, it } from 'vitest';
import {
  applyContentWarning,
  checkContentWarningInput,
  contentWarningOrNull,
  isValidContentWarning,
  MAX_CONTENT_WARNING_LENGTH,
  sanitizeContentWarning,
} from '@/lib/feed/content-warning';

const warned = { isSensitive: true, contentWarning: 'Spoilers: Dune Part Two', userId: 'author' };

describe('applyContentWarning', () => {
  it('covers text and media from a reader on the default preference', () => {
    expect(applyContentWarning(warned, { userId: 'reader', showWarned: false })).toEqual({
      reason: 'Spoilers: Dune Part Two',
      warned: true,
      coverText: true,
      coverMedia: true,
      showLabel: false,
    });
  });

  it('covers a signed-out viewer', () => {
    const applied = applyContentWarning(warned);
    expect(applied.coverText).toBe(true);
    expect(applied.coverMedia).toBe(true);
  });

  it('shows the post with the reason as a label when the reader chose "Show them"', () => {
    expect(applyContentWarning(warned, { userId: 'reader', showWarned: true })).toEqual({
      reason: 'Spoilers: Dune Part Two',
      warned: true,
      coverText: false,
      coverMedia: false,
      showLabel: true,
    });
  });

  it('never covers the author from their own post; the reason still labels it', () => {
    const applied = applyContentWarning(warned, { userId: 'author', showWarned: false });
    expect(applied.coverText).toBe(false);
    expect(applied.coverMedia).toBe(false);
    expect(applied.showLabel).toBe(true);
  });

  it('a warning without a reason covers media only, exactly as before', () => {
    const plain = { isSensitive: true, contentWarning: null, userId: 'author' };
    expect(applyContentWarning(plain, { userId: 'reader' })).toEqual({
      reason: null,
      warned: true,
      coverText: false,
      coverMedia: true,
      showLabel: false,
    });
    expect(applyContentWarning(plain, { userId: 'reader', showWarned: true }).coverMedia).toBe(false);
  });

  it('a post without a warning is untouched', () => {
    expect(applyContentWarning({ isSensitive: false, contentWarning: null })).toEqual({
      reason: null,
      warned: false,
      coverText: false,
      coverMedia: false,
      showLabel: false,
    });
    expect(applyContentWarning({})).toMatchObject({ warned: false });
  });

  it('a reason alone is a warning, and a blank reason is no reason', () => {
    expect(applyContentWarning({ contentWarning: 'Injury photo' }).coverText).toBe(true);
    expect(applyContentWarning({ isSensitive: false, contentWarning: '   ' }).warned).toBe(false);
  });
});

describe('the reason', () => {
  it('sanitizes to one trimmed line, capped at 80 characters', () => {
    expect(sanitizeContentWarning('  Injury\n photo \t')).toBe('Injury photo');
    expect([...sanitizeContentWarning('x'.repeat(200))]).toHaveLength(MAX_CONTENT_WARNING_LENGTH);
  });

  it('validates what the composer sends', () => {
    expect(isValidContentWarning('Spoilers')).toBe(true);
    expect(isValidContentWarning('')).toBe(false);
    expect(isValidContentWarning('a\nb')).toBe(false);
    expect(isValidContentWarning('x'.repeat(81))).toBe(false);
    expect(checkContentWarningInput('')).toEqual({ ok: true, reason: null });
    expect(checkContentWarningInput('  Injury photo ')).toEqual({ ok: true, reason: 'Injury photo' });
    expect(checkContentWarningInput('x'.repeat(81)).ok).toBe(false);
  });

  it('reads null for a missing or blank reason', () => {
    expect(contentWarningOrNull(undefined)).toBeNull();
    expect(contentWarningOrNull('  ')).toBeNull();
    expect(contentWarningOrNull(' Spoilers ')).toBe('Spoilers');
  });
});
