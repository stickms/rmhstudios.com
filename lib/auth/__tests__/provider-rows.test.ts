/**
 * The login page's provider buttons: balanced rows, never an orphan.
 */
import { describe, expect, it } from 'vitest';
import { balanceProviderRows } from '../provider-rows';

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const shape = (n: number) => balanceProviderRows(ids(n)).rows.map((r) => r.length);

describe('balanceProviderRows', () => {
  it('keeps up to four in one row', () => {
    expect(shape(1)).toEqual([1]);
    expect(shape(2)).toEqual([2]);
    expect(shape(3)).toEqual([3]);
    expect(shape(4)).toEqual([4]);
  });

  it('puts five as three above two, not four above one', () => {
    expect(shape(5)).toEqual([3, 2]);
  });

  it('spreads six and seven evenly', () => {
    expect(shape(6)).toEqual([3, 3]);
    expect(shape(7)).toEqual([4, 3]);
  });

  it('never leaves a row of one when there are two or more rows', () => {
    for (let n = 5; n <= 16; n++) {
      const rows = shape(n);
      expect(Math.min(...rows), `n=${n}`).toBeGreaterThan(1);
    }
  });

  it('keeps the order and reports the width of a full row', () => {
    const { rows, columns } = balanceProviderRows(['a', 'b', 'c', 'd', 'e']);
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
    expect(columns).toBe(3);
  });

  it('answers an empty list with no rows', () => {
    expect(balanceProviderRows([]).rows).toEqual([]);
  });
});
