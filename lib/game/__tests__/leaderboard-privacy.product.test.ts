import { describe, expect, it } from 'vitest';
import {
  HIDDEN_ID_CAP,
  OVERFETCH_CAP,
  excludeHidden,
  fetchSize,
  notHiddenWhere,
  userNotHiddenWhere,
} from '@/lib/game/leaderboard-privacy';

const row = (userId: string | null, score: number) => ({ userId, score });

describe('excludeHidden', () => {
  it('drops hidden members and ranks the rest from 1 with no gaps', () => {
    const rows = [row('a', 90), row('hidden', 80), row('b', 70), row('c', 60)];
    const out = excludeHidden(rows, new Set(['hidden']), 10);
    expect(out.map((r) => [r.rank, r.userId, r.score])).toEqual([
      [1, 'a', 90],
      [2, 'b', 70],
      [3, 'c', 60],
    ]);
  });

  it('keeps legacy rows with no account', () => {
    const out = excludeHidden([row(null, 50), row('hidden', 40)], new Set(['hidden']), 10);
    expect(out.map((r) => r.userId)).toEqual([null]);
  });

  it('keeps at most `take` rows', () => {
    const out = excludeHidden([row('a', 3), row('b', 2), row('c', 1)], new Set(), 2);
    expect(out.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('returns an empty board when everyone is hidden, and does not change its input', () => {
    const rows = [row('a', 1)];
    expect(excludeHidden(rows, new Set(['a']), 5)).toEqual([]);
    expect(rows).toEqual([{ userId: 'a', score: 1 }]);
  });
});

describe('fetchSize', () => {
  it('adds the hidden count to the page size', () => {
    expect(fetchSize(25, 3)).toBe(28);
    expect(fetchSize(25, 0)).toBe(25);
  });

  it('never reads more than OVERFETCH_CAP extra rows', () => {
    expect(fetchSize(25, 5_000)).toBe(25 + OVERFETCH_CAP);
    expect(fetchSize(25, -4)).toBe(25);
  });

  it('caps the hidden set itself at 5 000 ids', () => {
    expect(HIDDEN_ID_CAP).toBe(5_000);
  });
});

describe('where fragments', () => {
  it('add nothing when nobody is hidden', () => {
    expect(notHiddenWhere(new Set())).toEqual({});
    expect(userNotHiddenWhere(new Set())).toEqual({});
  });

  it('keep rows with no account when the column may be null', () => {
    expect(notHiddenWhere(new Set(['a']))).toEqual({ OR: [{ userId: null }, { userId: { notIn: ['a'] } }] });
  });

  it('exclude by id when the column is required', () => {
    expect(userNotHiddenWhere(new Set(['a', 'b']))).toEqual({ userId: { notIn: ['a', 'b'] } });
  });
});
