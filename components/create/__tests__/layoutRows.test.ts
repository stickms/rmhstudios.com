import { describe, expect, it } from 'vitest';
import { layoutRows, type StoreItem } from '../storefront';

const short = (id: string): StoreItem => ({ id, title: id, description: 'A short line.', to: '/x' });
const long = (id: string): StoreItem => ({ id, title: id, description: 'x'.repeat(140), to: '/x' });
const flags = (items: StoreItem[]) =>
  layoutRows(items).map((s) => `${s.item.id}:${s.wide ? 'W' : s.col}${s.last ? '*' : ''}`);

describe('layoutRows', () => {
  it('pairs short descriptions two to a row and marks the final pair', () => {
    expect(flags([short('a'), short('b'), short('c'), short('d')])).toEqual(['a:0', 'b:1', 'c:0*', 'd:1*']);
  });

  it('gives a long description a whole row', () => {
    expect(flags([long('a'), short('b'), short('c')])).toEqual(['a:W', 'b:0*', 'c:1*']);
  });

  it('widens a short item left without a partner by a long one after it, so no row has a hole', () => {
    expect(flags([short('a'), long('b'), short('c'), short('d')])).toEqual(['a:W', 'b:W', 'c:0*', 'd:1*']);
  });

  it('widens an odd last item and marks it as the last row', () => {
    expect(flags([short('a'), short('b'), short('c')])).toEqual(['a:0', 'b:1', 'c:W*']);
  });

  it('treats an item with no description as short, and an empty list as empty', () => {
    expect(flags([{ id: 'a', title: 'a', to: '/x' }, short('b')])).toEqual(['a:0*', 'b:1*']);
    expect(layoutRows([])).toEqual([]);
  });
});
