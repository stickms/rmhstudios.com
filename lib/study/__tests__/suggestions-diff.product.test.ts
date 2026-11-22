import { describe, expect, it } from 'vitest';
import {
  MAX_OPEN_PER_DECK,
  MAX_OPEN_PER_MEMBER_DECK,
  MIN_ACCOUNT_AGE_MS,
  accountOldEnough,
  diffSummary,
  isSuggestable,
  normalizeSides,
  sameText,
} from '@/lib/study/suggestions';

describe('suggestion word diff and summary', () => {
  it('marks a one-word replacement as one word changed, not two', () => {
    const { parts, changed } = diffSummary('The capital of France is Lyon', 'The capital of France is Paris');
    expect(changed).toBe(1);
    expect(parts.filter((p) => p.op === 'delete').map((p) => p.value)).toEqual(['Lyon']);
    expect(parts.filter((p) => p.op === 'insert').map((p) => p.value)).toEqual(['Paris']);
  });

  it('counts the larger side when words are added or removed', () => {
    expect(diffSummary('a b c', 'a b c d e').changed).toBe(2);
    expect(diffSummary('a b c d e', 'a e').changed).toBe(3);
  });

  it('reports no change for identical text, and reassembles to the new text', () => {
    expect(diffSummary('same text', 'same text').changed).toBe(0);
    const { parts } = diffSummary('one two three', 'one 2 three');
    const after = parts
      .filter((p) => p.op !== 'delete')
      .map((p) => p.value)
      .join('');
    const before = parts
      .filter((p) => p.op !== 'insert')
      .map((p) => p.value)
      .join('');
    expect(after).toBe('one 2 three');
    expect(before).toBe('one two three');
  });

  it('works on text with no spaces and on empty sides', () => {
    expect(diffSummary('', 'new text').changed).toBe(2);
    expect(diffSummary('old', '').changed).toBe(1);
    expect(diffSummary('', '').parts).toEqual([]);
  });
});

describe('suggestion gates that need no database', () => {
  it('compares text after trimming and treats a missing back as empty', () => {
    expect(normalizeSides({ front: '  a ', back: ' b ' })).toEqual({ front: 'a', back: 'b' });
    expect(sameText({ front: ' a ', back: 'b' }, { front: 'a', back: ' b ' })).toBe(true);
    expect(sameText({ front: 'a' }, { front: 'a', back: '' })).toBe(true);
    expect(sameText({ front: 'a', back: 'b' }, { front: 'a', back: 'c' })).toBe(false);
  });

  it('needs an account at least seven days old', () => {
    const now = new Date('2026-12-10T12:00:00Z');
    expect(accountOldEnough(new Date(now.getTime() - MIN_ACCOUNT_AGE_MS), now)).toBe(true);
    expect(accountOldEnough(new Date(now.getTime() - MIN_ACCOUNT_AGE_MS + 1), now)).toBe(false);
  });

  it('suggests to text cards only, and keeps the spec caps', () => {
    expect(['basic', 'reversible', 'cloze'].every(isSuggestable)).toBe(true);
    expect(isSuggestable('occlusion')).toBe(false);
    expect(MAX_OPEN_PER_MEMBER_DECK).toBe(20);
    expect(MAX_OPEN_PER_DECK).toBe(200);
  });
});
