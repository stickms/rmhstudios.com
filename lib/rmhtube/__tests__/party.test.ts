import { describe, expect, it } from 'vitest';
import { settlePrediction, mediaKey, parsePool } from '../party';

describe('settlePrediction', () => {
  const picks = {
    a: { choice: 'yes' as const, points: 30 },
    b: { choice: 'yes' as const, points: 10 },
    c: { choice: 'no' as const, points: 60 },
  };

  it('pays winners their stake plus a proportional share of the losing pool', () => {
    expect(settlePrediction(picks, 'yes')).toEqual({ a: 30 + 45, b: 10 + 15, c: 0 });
  });

  it('never pays out more than was staked', () => {
    const odd = {
      a: { choice: 'yes' as const, points: 1 },
      b: { choice: 'yes' as const, points: 2 },
      c: { choice: 'no' as const, points: 4 },
    };
    const paid = Object.values(settlePrediction(odd, 'yes')).reduce((n, v) => n + v, 0);
    expect(paid).toBeLessThanOrEqual(7);
  });

  it('refunds everyone on cancel, or when one side is empty', () => {
    expect(settlePrediction(picks, 'cancel')).toEqual({ a: 30, b: 10, c: 60 });
    expect(settlePrediction({ a: picks.a, b: picks.b }, 'yes')).toEqual({ a: 30, b: 10 });
    expect(settlePrediction(picks, 'no')).toEqual({ a: 0, b: 0, c: 100 });
  });
});

describe('helpers', () => {
  it('keys media by URL without the fragment', () => {
    expect(mediaKey(' https://x.test/v?t=1#t=30 ')).toBe('https://x.test/v?t=1');
  });
  it('parses a pool one entry per line, de-duplicated', () => {
    expect(parsePool('a\n b \n\na')).toEqual(['a', 'b']);
  });
});
