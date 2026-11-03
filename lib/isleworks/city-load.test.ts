import { describe, expect, it } from 'vitest';
import { fromSavedCity } from './city';
import { SAVE_VERSION, type SavedCity } from './save-format';

const base: SavedCity = {
  v: SAVE_VERSION,
  seed: 4242,
  money: 5000,
  taxRate: 9,
  month: 3,
  population: 0,
  peak: 0,
  parcels: [],
  buildings: [],
  claimed: [],
  completed: [],
};

describe('fromSavedCity', () => {
  // A published island (schema allows coordinates to 512) must not crash every visitor.
  it('drops buildings whose footprint hangs off the grid instead of throwing', () => {
    const city = fromSavedCity({
      ...base,
      buildings: [
        { d: 'road', x: 5, y: 5, r: 0, l: 1, c: 1, m: 0 },
        { d: 'road', x: 40, y: 5, r: 0, l: 1, c: 1, m: 0 },
        { d: 'road', x: 5, y: 500, r: 0, l: 1, c: 1, m: 0 },
      ],
    });
    expect(city).not.toBeNull();
    expect(city!.buildings.filter((b) => b.definitionId === 'road')).toHaveLength(1);
  });
});
