import { describe, expect, it } from 'vitest';
import { DEFAULT_TAX_RATE, MAX_TAX_RATE } from '../../content';
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
  it('is version 3 and round-trips a growing town exactly, derived data and all', () => {
    expect(SAVE_VERSION).toBe(3);
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
    expect(loaded.version).toBe(3);
    expect(loaded.city.taxRate).toBe(DEFAULT_TAX_RATE);
    expect(loaded.city.event).toBeNull();
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

  it('migrates a version 2 save to 3: the default tax rate, no event, and everything else untouched', () => {
    const w = townWorld();
    buildFirstTown(w);
    ticks(w, 3000);
    const v2 = JSON.parse(JSON.stringify(w));
    v2.version = 2;
    delete v2.city.taxRate;
    delete v2.city.event;
    const loaded = decodeWorld(withBody(encodeWorld(w), 2, v2));
    expect(loaded.version).toBe(3);
    expect(loaded.city.taxRate).toBe(DEFAULT_TAX_RATE);
    expect(loaded.city.event).toBeNull();
    // Nothing else changed: the migrated world is the current world, hash for hash…
    expect(worldHash(loaded)).toBe(worldHash(w));
    // …and plays on exactly like it.
    ticks(w, 1500);
    ticks(loaded, 1500);
    expect(worldHash(loaded)).toBe(worldHash(w));
  });

  it('a version 3 save must carry its own tax rate and event; a v2 file claiming a rate keeps it', () => {
    const w = townWorld();
    const strip = (version: number, keep: boolean) => {
      const j = JSON.parse(JSON.stringify(w));
      if (!keep) {
        delete j.city.taxRate;
        delete j.city.event;
      }
      return withBody(encodeWorld(w), version, j);
    };
    expect(() => decodeWorld(strip(3, false))).toThrow(SaveFormatError);
    expect(() => decodeWorld(strip(3, true))).not.toThrow();
    w.city.taxRate = 15;
    expect(decodeWorld(strip(2, true)).city.taxRate).toBe(15);
  });

  it('round-trips a non-default rate and an event in progress, and refuses ones that lie', () => {
    const w = townWorld();
    w.city.taxRate = 14;
    w.city.event = { id: 'storm', since: 4, daysLeft: 1 };
    const back = decodeWorld(encodeWorld(w));
    expect(back.city.taxRate).toBe(14);
    expect(back.city.event).toEqual({ id: 'storm', since: 4, daysLeft: 1 });
    expect(worldHash(back)).toBe(worldHash(w));
    const bytes = encodeWorld(w);
    const lie = (mutate: (c: Record<string, unknown>) => void) => {
      const j = JSON.parse(JSON.stringify(w));
      mutate(j.city);
      return withBody(bytes, SAVE_VERSION, j);
    };
    expect(() => decodeWorld(lie((c) => (c.taxRate = MAX_TAX_RATE + 1)))).toThrow(SaveFormatError);
    expect(() => decodeWorld(lie((c) => (c.taxRate = -1)))).toThrow(SaveFormatError);
    expect(() => decodeWorld(lie((c) => (c.taxRate = 9.5)))).toThrow(SaveFormatError);
    expect(() => decodeWorld(lie((c) => (c.event = { id: 'meteor', since: 0, daysLeft: 1 })))).toThrow(
      SaveFormatError,
    );
    expect(() => decodeWorld(lie((c) => (c.event = { id: 'storm', since: 0, daysLeft: 0 })))).toThrow(
      SaveFormatError,
    );
    expect(() => decodeWorld(lie((c) => (c.event = { id: 'storm', since: 0, daysLeft: 99 })))).toThrow(
      SaveFormatError,
    );
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
