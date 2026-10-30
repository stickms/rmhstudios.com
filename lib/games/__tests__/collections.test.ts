import { describe, expect, it } from 'vitest';
import {
  FAVORITES,
  MAX_COLLECTIONS,
  MAX_NAME,
  groupCollections,
  normalizeCollectionName,
} from '../collections';

describe('normalizeCollectionName', () => {
  it('trims, collapses spaces and keeps the spelling', () => {
    expect(normalizeCollectionName('  Co-op   nights ')).toEqual({ ok: true, name: 'Co-op nights' });
  });

  it('refuses empty, too long and control-character names', () => {
    expect(normalizeCollectionName('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeCollectionName('x'.repeat(MAX_NAME + 1))).toEqual({ ok: false, reason: 'too-long' });
    expect(normalizeCollectionName('a\u0000b')).toEqual({ ok: true, name: 'ab' });
  });

  it('reserves the built-in name in any case', () => {
    expect(normalizeCollectionName('Favorites')).toEqual({ ok: false, reason: 'reserved' });
    expect(normalizeCollectionName(' FAVORITES ')).toEqual({ ok: false, reason: 'reserved' });
    expect(normalizeCollectionName(FAVORITES)).toEqual({ ok: false, reason: 'reserved' });
  });
});

describe('groupCollections', () => {
  const rows = [
    { collection: 'Zen', gameId: 'b' },
    { collection: 'favorites', gameId: 'a' },
    { collection: 'co-op', gameId: 'c' },
    { collection: 'Zen', gameId: 'a' },
  ];

  it('puts favorites first, then the rest A to Z ignoring case', () => {
    const g = groupCollections(rows);
    expect(g.map((c) => c.name)).toEqual(['favorites', 'co-op', 'Zen']);
  });

  it('lists each title once per collection, in a stable order', () => {
    const g = groupCollections([...rows, { collection: 'Zen', gameId: 'a' }]);
    expect(g.find((c) => c.name === 'Zen')?.ids).toEqual(['a', 'b']);
  });

  it('is empty for no rows', () => {
    expect(groupCollections([])).toEqual([]);
  });

  it('exposes the cap', () => {
    expect(MAX_COLLECTIONS).toBe(20);
  });
});
