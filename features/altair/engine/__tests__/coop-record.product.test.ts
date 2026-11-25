import { describe, expect, it } from 'vitest';
import { favouriteClassId, isCoopBoardKind, winRatePercent } from '../coop-record';

describe('winRatePercent', () => {
  it('is a whole percentage, rounded half up', () => {
    expect(winRatePercent(3, 1)).toBe(33);
    expect(winRatePercent(3, 2)).toBe(67);
    expect(winRatePercent(8, 1)).toBe(13);
    expect(winRatePercent(10, 10)).toBe(100);
  });

  it('never divides by zero and stays within 0 to 100', () => {
    expect(winRatePercent(0, 0)).toBe(0);
    expect(winRatePercent(0, 5)).toBe(0);
    expect(winRatePercent(4, 0)).toBe(0);
    expect(winRatePercent(2, 5)).toBe(100);
    expect(winRatePercent(Number.NaN, 1)).toBe(0);
  });
});

describe('favouriteClassId', () => {
  it('is the class played most', () => {
    expect(
      favouriteClassId([
        { classId: 'a', count: 2, lastPlayedAt: 10 },
        { classId: 'b', count: 5, lastPlayedAt: 1 },
      ]),
    ).toBe('b');
  });

  it('breaks a tie by the most recent play, then by class id', () => {
    expect(
      favouriteClassId([
        { classId: 'a', count: 3, lastPlayedAt: 10 },
        { classId: 'b', count: 3, lastPlayedAt: 20 },
      ]),
    ).toBe('b');
    expect(
      favouriteClassId([
        { classId: 'z', count: 3, lastPlayedAt: 10 },
        { classId: 'c', count: 3, lastPlayedAt: 10 },
      ]),
    ).toBe('c');
  });

  it('is null with no rows', () => {
    expect(favouriteClassId([])).toBeNull();
    expect(favouriteClassId([{ classId: 'a', count: 0, lastPlayedAt: 1 }])).toBeNull();
  });
});

describe('isCoopBoardKind', () => {
  it('knows the two co-op boards and nothing else', () => {
    expect(isCoopBoardKind('coop-wins')).toBe(true);
    expect(isCoopBoardKind('coop-revives')).toBe(true);
    expect(isCoopBoardKind('time')).toBe(false);
    expect(isCoopBoardKind('coop')).toBe(false);
  });
});
