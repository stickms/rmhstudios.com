import { describe, expect, it } from 'vitest';
import { createWorld, packCell, roadAt, stepWorld, tileIndex, worldHash } from '../../world';
import { buildFirstTown, ticks, townWorld } from '../../world/__tests__/town';
import { SAVE_VERSION, SaveFormatError, decodeWorld, encodeWorld } from '..';

function withBody(header: Uint8Array, version: number, json: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(json));
  const bytes = new Uint8Array(5 + body.length);
  bytes.set(header.subarray(0, 4));
  bytes[4] = version;
  bytes.set(body, 5);
  return bytes;
}

describe('city save format', () => {
  it('is version 2 and round-trips a growing town exactly, derived data and all', () => {
    expect(SAVE_VERSION).toBe(2);
    const w = townWorld();
    buildFirstTown(w);
    ticks(w, 3000);
    expect(w.city.population).toBeGreaterThan(0);
    const back = decodeWorld(encodeWorld(w));
    expect(back).toEqual(w);
    expect(worldHash(back)).toBe(worldHash(w));
    // …and goes on from the loaded copy exactly as from the original.
    ticks(w, 1500);
    ticks(back, 1500);
    expect(worldHash(back)).toBe(worldHash(w));
  });

  it('loads a version 1 save (no city) with an empty town, and turns old road buildings into road tiles', () => {
    const w = createWorld(5, 16);
    stepWorld(w, 0, [{ type: 'join', playerId: 'a' }]);
    const old = JSON.parse(JSON.stringify(w));
    delete old.city;
    old.version = 1;
    old.buildings = [
      { id: 1, kind: 'road', x: 8, z: 8, rot: 0 },
      { id: 2, kind: 'road', x: 9, z: 8, rot: 0 },
      { id: 3, kind: 'road', x: 0, z: 0, rot: 0 }, // on the water rim: dropped, not a road
      { id: 4, kind: 'cottage', x: 6, z: 8, rot: 0 },
    ];
    const loaded = decodeWorld(withBody(encodeWorld(w), 1, old));
    expect(loaded.version).toBe(2);
    expect(loaded.buildings.map((b) => b.kind)).toEqual(['cottage']);
    expect(roadAt(loaded, 8, 8)).toBe(true);
    expect(roadAt(loaded, 9, 8)).toBe(true);
    expect(loaded.city.roadCount).toBe(2);
    expect(loaded.city.population).toBe(0);
    expect(loaded.city.reached).toEqual([]);
    expect(loaded.city.dirty).toBe(true);
    // The first step rebuilds the derived data and the town carries on.
    stepWorld(loaded, 50);
    expect(loaded.city.dirty).toBe(false);
    expect(loaded.city.stats.roads).toBe(2);
  });

  it('refuses a city that lies: wrong size, a level with no zone, an unknown utility, an unknown milestone', () => {
    const w = townWorld();
    const bytes = encodeWorld(w);
    const lie = (mutate: (c: Record<string, unknown>) => void) => {
      const j = JSON.parse(JSON.stringify(w));
      mutate(j.city);
      return withBody(bytes, SAVE_VERSION, j);
    };
    expect(() => decodeWorld(lie((c) => ((c.cells as unknown[]).length = 3)))).toThrow(
      SaveFormatError,
    );
    expect(() =>
      decodeWorld(lie((c) => ((c.cells as number[])[tileIndex(w, 9, 9)] = 0b01000))),
    ).toThrow(SaveFormatError);
    expect(() =>
      decodeWorld(lie((c) => ((c.cells as number[])[tileIndex(w, 9, 9)] = 7 << 5))),
    ).toThrow(SaveFormatError);
    expect(() => decodeWorld(lie((c) => (c.reached = ['made-up'])))).toThrow(SaveFormatError);
    expect(() => decodeWorld(lie((c) => (c.population = -5)))).toThrow(SaveFormatError);
    // A well-formed one is fine.
    expect(() =>
      decodeWorld(
        lie(
          (c) =>
            ((c.cells as number[])[tileIndex(w, 9, 9)] = packCell({ zone: 'homes', level: 2 })),
        ),
      ),
    ).not.toThrow();
  });

  it('refuses a version it has never heard of', () => {
    const good = encodeWorld(townWorld());
    const future = good.slice();
    future[4] = SAVE_VERSION + 1;
    expect(() => decodeWorld(future)).toThrow(/version/);
    const zero = good.slice();
    zero[4] = 0;
    expect(() => decodeWorld(zero)).toThrow(/version/);
  });
});
