import { describe, expect, it } from 'vitest';
import {
  COMMENT_MAX_LENGTH,
  createCommentSchema,
  currentPositionMs,
  formatCommentTime,
  sortByPosition,
} from '../track-comments';

describe('formatCommentTime', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatCommentTime(0)).toBe('0:00');
    expect(formatCommentTime(5_999)).toBe('0:05');
    expect(formatCommentTime(65_000)).toBe('1:05');
    expect(formatCommentTime(3_600_000)).toBe('1:00:00');
    expect(formatCommentTime(3_725_000)).toBe('1:02:05');
  });
  it('clamps bad input to 0:00', () => {
    expect(formatCommentTime(-5)).toBe('0:00');
    expect(formatCommentTime(Number.NaN)).toBe('0:00');
  });
});

describe('currentPositionMs', () => {
  it('adds elapsed time only while playing', () => {
    const pb = { positionMs: 10_000, isPlaying: true, updatedAt: 1_000 };
    expect(currentPositionMs(pb, 30_000, 3_500)).toBe(12_500);
    expect(currentPositionMs({ ...pb, isPlaying: false }, 30_000, 3_500)).toBe(10_000);
  });
  it('clamps to the duration', () => {
    expect(currentPositionMs({ positionMs: 29_000, isPlaying: true, updatedAt: 1 }, 30_000, 99_999)).toBe(30_000);
  });
});

describe('sortByPosition', () => {
  it('orders by position then id without mutating', () => {
    const rows = [
      { id: 'b', positionMs: 5 },
      { id: 'a', positionMs: 5 },
      { id: 'c', positionMs: 1 },
    ];
    expect(sortByPosition(rows).map((r) => r.id)).toEqual(['c', 'a', 'b']);
    expect(rows[0].id).toBe('b');
  });
});

describe('createCommentSchema', () => {
  const ok = { trackUri: 'spotify:track:1', positionMs: 1200, body: ' hi ' };
  it('accepts and trims', () => {
    expect(createCommentSchema.parse(ok).body).toBe('hi');
  });
  it('rejects empty, overlong, negative and fractional input', () => {
    expect(createCommentSchema.safeParse({ ...ok, body: '   ' }).success).toBe(false);
    expect(createCommentSchema.safeParse({ ...ok, body: 'x'.repeat(COMMENT_MAX_LENGTH + 1) }).success).toBe(false);
    expect(createCommentSchema.safeParse({ ...ok, positionMs: -1 }).success).toBe(false);
    expect(createCommentSchema.safeParse({ ...ok, positionMs: 1.5 }).success).toBe(false);
    expect(createCommentSchema.safeParse({ ...ok, trackUri: '' }).success).toBe(false);
  });
});
