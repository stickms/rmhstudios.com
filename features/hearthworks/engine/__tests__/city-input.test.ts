import { describe, expect, it } from 'vitest';
import { ROAD_RUN_MAX, ZONE_BRUSH_MAX } from '../content';
import { brushRect, roadCommands, roadRuns, roadTiles } from '../city-input';
import { createHearthworksStore } from '../store';
import { applyToolAt } from '../tools';
import { TICK_MS, roadAt, utilityAt, zoneAt } from '../world';

describe('road drags', () => {
  it('lay one run for a straight drag and an L (longer leg first) for a bent one', () => {
    expect(roadRuns({ x: 3, z: 3 }, { x: 8, z: 3 })).toEqual([{ x: 3, z: 3, x2: 8, z2: 3 }]);
    expect(roadRuns({ x: 3, z: 3 }, { x: 8, z: 5 })).toEqual([
      { x: 3, z: 3, x2: 8, z2: 3 },
      { x: 8, z: 3, x2: 8, z2: 5 },
    ]);
    expect(roadRuns({ x: 3, z: 3 }, { x: 4, z: 9 })).toEqual([
      { x: 3, z: 3, x2: 3, z2: 9 },
      { x: 3, z: 9, x2: 4, z2: 9 },
    ]);
  });

  it('lists every tile once, corner included, in walking order — backwards drags too', () => {
    const tiles = roadTiles({ x: 5, z: 5 }, { x: 3, z: 7 });
    expect(tiles).toEqual([
      { x: 5, z: 5 },
      { x: 4, z: 5 },
      { x: 3, z: 5 },
      { x: 3, z: 6 },
      { x: 3, z: 7 },
    ]);
    expect(roadTiles({ x: 2, z: 2 }, { x: 2, z: 2 })).toEqual([{ x: 2, z: 2 }]);
  });

  it('split a very long leg into commands the sim will accept', () => {
    const cmds = roadCommands({ x: 0, z: 4 }, { x: ROAD_RUN_MAX * 2 + 5, z: 4 });
    expect(cmds).toHaveLength(3);
    for (const c of cmds) {
      if (c.type !== 'placeRoad') throw new Error('wrong type');
      expect(Math.abs((c.x2 ?? c.x) - c.x) + 1).toBeLessThanOrEqual(ROAD_RUN_MAX);
    }
    expect(roadCommands({ x: 1, z: 1 }, { x: 3, z: 1 }, true)[0].type).toBe('removeRoad');
  });
});

describe('zone brush', () => {
  it('is the rectangle between the corners, in any direction, capped at the brush limit', () => {
    expect(brushRect({ x: 4, z: 4 }, { x: 6, z: 5 })).toEqual({ x: 4, z: 4, x2: 6, z2: 5 });
    expect(brushRect({ x: 6, z: 5 }, { x: 4, z: 4 })).toEqual({ x: 6, z: 5, x2: 4, z2: 4 });
    const r = brushRect({ x: 0, z: 0 }, { x: 60, z: 60 });
    expect((Math.abs(r.x2 - r.x) + 1) * (Math.abs(r.z2 - r.z) + 1)).toBeLessThanOrEqual(
      ZONE_BRUSH_MAX,
    );
    const thin = brushRect({ x: 0, z: 0 }, { x: 300, z: 0 });
    expect(Math.abs(thin.x2 - thin.x) + 1).toBeLessThanOrEqual(ZONE_BRUSH_MAX);
  });
});

describe('the town tools', () => {
  it('place a road, paint a zone and set a utility through the same command pipeline as the farm tools', () => {
    const store = createHearthworksStore({ seed: 3, size: 24 });
    const w0 = store.getState().world;
    // Flatten the meadow so every tile is plain grass.
    const m = Math.floor(w0.size / 2);
    const apply = (tx: number, tz: number) => {
      applyToolAt(store, tx, tz);
      store.getState().advance(TICK_MS);
    };
    store.getState().setTool({ kind: 'road' });
    apply(m + 1, m);
    store.getState().setTool({ kind: 'zone', zone: 'homes' });
    apply(m + 2, m + 1);
    store.getState().setTool({ kind: 'utility', utility: 'well' });
    apply(m + 3, m + 1);
    const w = store.getState().world;
    expect(roadAt(w, m + 1, m)).toBe(true);
    expect(zoneAt(w, m + 2, m + 1)).toBe('homes');
    expect(utilityAt(w, m + 3, m + 1)).toBe('well');
    // The Clear tool takes away whichever of them is under it.
    store.getState().setTool({ kind: 'remove' });
    apply(m + 1, m);
    apply(m + 2, m + 1);
    apply(m + 3, m + 1);
    const after = store.getState().world;
    expect(roadAt(after, m + 1, m)).toBe(false);
    expect(zoneAt(after, m + 2, m + 1)).toBeNull();
    expect(utilityAt(after, m + 3, m + 1)).toBeNull();
  });
});
