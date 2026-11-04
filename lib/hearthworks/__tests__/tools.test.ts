import { describe, expect, it } from 'vitest';
import { createHearthworksStore } from '../store';
import { applyToolAt, tileInFront } from '../tools';
import { TICK_MS, buildingAt } from '../world';

describe('applyToolAt', () => {
  it('dispatches the armed tool and does nothing for the inspect tool', () => {
    const store = createHearthworksStore({ seed: 3, size: 24 });
    const m = Math.floor(store.getState().world.size / 2);
    applyToolAt(store, m, m);
    store.getState().advance(TICK_MS);
    expect(store.getState().world.buildings).toHaveLength(0);
    store.getState().setTool({ kind: 'build', building: 'road' });
    applyToolAt(store, m, m);
    store.getState().advance(TICK_MS);
    expect(buildingAt(store.getState().world, m, m)?.kind).toBe('road');
    store.getState().setTool({ kind: 'remove' });
    applyToolAt(store, m, m);
    store.getState().advance(TICK_MS);
    expect(buildingAt(store.getState().world, m, m)).toBeUndefined();
  });
});

describe('tileInFront', () => {
  it('points at the neighbouring tile in the facing direction', () => {
    expect(tileInFront(10, 10, 0)).toEqual({ x: 10, z: 11 }); // +z
    expect(tileInFront(10, 10, Math.PI / 2)).toEqual({ x: 11, z: 10 }); // +x
    expect(tileInFront(10, 10, Math.PI)).toEqual({ x: 10, z: 9 });
    expect(tileInFront(10, 10, -Math.PI / 2)).toEqual({ x: 9, z: 10 });
  });
});
