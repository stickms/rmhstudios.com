import { describe, expect, it } from 'vitest';
import { AIM_DISTANCE, aimPoint, createCombatControls } from '../combat-input';
import { createRuntime } from '../runtime';
import { createHearthworksStore } from '../store';
import { stepWorld } from '../world';

describe('combat controls', () => {
  it('aims ahead along the facing direction', () => {
    expect(aimPoint(5, 5, 0)).toEqual({ x: 5, z: 5 + AIM_DISTANCE });
    const east = aimPoint(5, 5, Math.PI / 2);
    expect(east.x).toBeCloseTo(5 + AIM_DISTANCE);
    expect(east.z).toBeCloseTo(5);
  });

  it('does nothing unarmed; armed, sends one shot per fire interval however often it is called', () => {
    const store = createHearthworksStore({ seed: 3 });
    const rt = createRuntime({ x: 16, z: 16 });
    let clock = 0;
    const c = createCombatControls(store, rt, () => clock);
    expect(c.fire()).toBe(false);
    expect(c.reload()).toBe(false);
    const id = store.getState().playerId;
    stepWorld(store.getState().world, 0, [
      { type: 'buyWeapon', playerId: id, weapon: 'pistol' },
      { type: 'equip', playerId: id, weapon: 'pistol' },
    ]);
    expect(c.armed()).toBe(true);
    expect(c.fire()).toBe(true);
    expect(c.fire()).toBe(false); // same instant
    clock += 100; // a pistol cycles every 300 ms
    expect(c.fire()).toBe(false);
    clock += 250;
    expect(c.fire()).toBe(true);
    const shoots = store.getState().pending.filter((p) => p.type === 'shoot');
    expect(shoots).toHaveLength(2);
    expect(c.reload()).toBe(true);
  });
});
