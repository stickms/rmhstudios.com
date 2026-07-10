import { describe, it, expect } from 'vitest';
import {
  groupReactions,
  applyReactionToggle,
  isValidReactionEmoji,
} from '@/lib/social/reactions';

describe('groupReactions', () => {
  it('groups rows by emoji with counts, sorted by count desc', () => {
    const rows = [
      { emoji: '🔥', userId: 'a' },
      { emoji: '❤️', userId: 'a' },
      { emoji: '🔥', userId: 'b' },
    ];
    expect(groupReactions(rows, null)).toEqual([
      { emoji: '🔥', count: 2, reactedByMe: false },
      { emoji: '❤️', count: 1, reactedByMe: false },
    ]);
  });

  it('marks reactedByMe for the viewer', () => {
    const rows = [{ emoji: '🔥', userId: 'me' }, { emoji: '🔥', userId: 'other' }];
    expect(groupReactions(rows, 'me')[0].reactedByMe).toBe(true);
    expect(groupReactions(rows, 'other2')[0].reactedByMe).toBe(false);
  });

  it('returns [] for no rows', () => {
    expect(groupReactions([], 'me')).toEqual([]);
  });
});

describe('applyReactionToggle', () => {
  it('adds a new emoji as reactedByMe with count 1', () => {
    expect(applyReactionToggle([], '🔥')).toEqual([{ emoji: '🔥', count: 1, reactedByMe: true }]);
  });

  it('increments an existing emoji I have not reacted with', () => {
    const input = [{ emoji: '🔥', count: 2, reactedByMe: false }];
    expect(applyReactionToggle(input, '🔥')).toEqual([{ emoji: '🔥', count: 3, reactedByMe: true }]);
  });

  it('decrements and unsets when I had reacted', () => {
    const input = [{ emoji: '🔥', count: 2, reactedByMe: true }];
    expect(applyReactionToggle(input, '🔥')).toEqual([{ emoji: '🔥', count: 1, reactedByMe: false }]);
  });

  it('removes the chip when my toggle-off empties it', () => {
    const input = [{ emoji: '🔥', count: 1, reactedByMe: true }];
    expect(applyReactionToggle(input, '🔥')).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [{ emoji: '🔥', count: 1, reactedByMe: false }];
    applyReactionToggle(input, '🔥');
    expect(input[0].count).toBe(1);
  });
});

describe('isValidReactionEmoji', () => {
  it('accepts simple emoji, ZWJ sequences, flags, and keycaps', () => {
    expect(isValidReactionEmoji('🔥')).toBe(true);
    expect(isValidReactionEmoji('❤️')).toBe(true);
    expect(isValidReactionEmoji('👨‍👩‍👧‍👦')).toBe(true);
    expect(isValidReactionEmoji('🇮🇩')).toBe(true);
    expect(isValidReactionEmoji('1️⃣')).toBe(true);
    expect(isValidReactionEmoji('👍🏽')).toBe(true);
  });

  it('rejects empty, plain text, multi-emoji, and oversized input', () => {
    expect(isValidReactionEmoji('')).toBe(false);
    expect(isValidReactionEmoji('abc')).toBe(false);
    expect(isValidReactionEmoji('🔥🔥')).toBe(false);
    expect(isValidReactionEmoji('a🔥')).toBe(false);
  });
});
