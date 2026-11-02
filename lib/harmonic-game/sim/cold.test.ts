import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../tf2-game/core/vec';
import { Driver } from '../../sp-game/sp-driver.test-support';
import { SpWorld } from '../../sp-game/world/sp-world';
import { HARMONIC_MATERIAL_LOOKUP, createHarmonicAssets } from '../assets';
import { compileLevel, type LevelSource } from '../compiler';
import { readHudState } from '../client/hud-state';
import { devBoxSource } from '../levels/dev_box';
import { devColdSource } from '../levels/dev_cold';
import { exposureRate, heaterWarmth } from './cold';
import {
  COLD_DAMAGE,
  COLD_DAMAGE_INTERVAL,
  COLD_DRAIN_OUTDOOR,
  COLD_HEATER_REFILL,
  COLD_MAX,
  COLD_REFILL_SHELTER,
  COLD_WIND_MULTIPLIER,
  attachHarmonicSim,
} from './index';

async function load(src: LevelSource = devColdSource()) {
  const level = compileLevel(src, { materials: HARMONIC_MATERIAL_LOOKUP });
  const world = await SpWorld.create({
    game: 'hl2',
    mapName: src.id,
    bsp: level.bsp,
    assets: createHarmonicAssets(),
  });
  const sim = attachHarmonicSim(world);
  const d = new Driver(world);
  const at = (p: Vec3) => {
    world.player.placeAt(p, null, { x: 0, y: 0, z: 0 });
    d.tick();
  };
  return { world, sim, d, cold: sim.cold, at };
}

const FIELD = { x: 300, y: 200, z: 1 };
const WIND = { x: 500, y: 512, z: 1 };
const HUT_FAR = { x: 1040, y: 680, z: 1 }; // inside the hut, beyond the heater's 160 radius
const HUT_NEAR = { x: 1130, y: 560, z: 1 }; // inside the hut, ~50 from the heater
const HUT_MID = { x: 1130, y: 620, z: 1 };

describe('cold meter (H1.2)', () => {
  it('pure helpers: linear falloff and the rate table', () => {
    expect(heaterWarmth(0, 100)).toBe(1);
    expect(heaterWarmth(50, 100)).toBeCloseTo(0.5);
    expect(heaterWarmth(100, 100)).toBe(0);
    expect(exposureRate('outdoor', 0)).toBe(-COLD_DRAIN_OUTDOOR);
    expect(exposureRate('wind', 0)).toBe(-COLD_DRAIN_OUTDOOR * COLD_WIND_MULTIPLIER);
    expect(exposureRate('shelter', 0)).toBe(COLD_REFILL_SHELTER);
  });

  it('starts full and drains outdoors at the outdoor rate', async () => {
    const { cold, at, d } = await load();
    at(FIELD);
    expect(cold.value).toBeCloseTo(COLD_MAX, 0);
    d.run(10);
    expect(cold.mode).toBe('outdoor');
    expect(cold.value).toBeCloseTo(COLD_MAX - COLD_DRAIN_OUTDOOR * 10, 0);
  });

  it('drains by the wind multiplier inside a wind volume', async () => {
    const { cold, at, d } = await load();
    at(WIND);
    d.run(5);
    expect(cold.mode).toBe('wind');
    expect(cold.value).toBeCloseTo(COLD_MAX - COLD_DRAIN_OUTDOOR * COLD_WIND_MULTIPLIER * 5, 0);
  });

  it('refills in a shelter at the shelter rate (shelter beats the outdoor default)', async () => {
    const { cold, at, d } = await load();
    cold.value = 20;
    at(HUT_FAR);
    d.run(3);
    expect(cold.sheltered).toBe(true);
    expect(cold.warmth).toBe(0);
    expect(cold.value).toBeCloseTo(20 + COLD_REFILL_SHELTER * 3, 0);
  });

  it('a heater refills faster, with distance falloff, and Disable turns it off', async () => {
    const { cold, at, d, world } = await load();
    const h = world.findByName('hut_heater')!;
    const gain = (p: Vec3) => {
      cold.value = 10;
      at(p);
      cold.value = 10;
      d.run(1);
      return cold.value - 10;
    };
    const near = gain(HUT_NEAR);
    const mid = gain(HUT_MID);
    const far = gain(HUT_FAR);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(far).toBeCloseTo(COLD_REFILL_SHELTER, 0);
    const dist = Math.hypot(
      HUT_NEAR.x - h.origin.x,
      HUT_NEAR.y - h.origin.y,
      HUT_NEAR.z + 36 - (h.origin.z + 22),
    );
    expect(near).toBeCloseTo(COLD_REFILL_SHELTER + COLD_HEATER_REFILL * heaterWarmth(dist, 160), 0);
    h.acceptInput('Disable', '', null, null);
    expect(gain(HUT_NEAR)).toBeCloseTo(COLD_REFILL_SHELTER, 0);
  });

  it('deals cold damage on an interval once the meter is empty', async () => {
    const { cold, at, d, world } = await load();
    at(FIELD);
    cold.value = 0.001;
    d.tick();
    expect(cold.value).toBe(0);
    const hp = world.player.health;
    d.run(COLD_DAMAGE_INTERVAL * 3 + 0.1);
    expect(hp - world.player.health).toBe(COLD_DAMAGE * 3);
  });

  it('a death reload refills the meter', async () => {
    const { cold, at, d, world, sim } = await load();
    at(FIELD);
    cold.value = 5;
    sim.combat.hurt(world.player, 1000, 'cold');
    expect(world.player.dead).toBe(true);
    d.tick();
    world.reloadAfterDeath();
    d.tick();
    expect(world.player.dead).toBe(false);
    expect(cold.value).toBeGreaterThan(COLD_MAX - 1);
  });

  it('indoor levels never drain and show no meter', async () => {
    const { cold, d, world, sim } = await load(devBoxSource());
    expect(cold.enabled).toBe(false);
    d.run(30);
    expect(cold.value).toBe(COLD_MAX);
    expect(readHudState({ player: world.player }, sim).cold).toBeUndefined();
  });

  it('fills the HUD cold field (value, max, sheltered, frost) and the shelter hint', async () => {
    const { cold, at, d, world, sim } = await load();
    at(FIELD);
    d.run(30);
    const hud = readHudState({ player: world.player }, sim);
    expect(hud.cold).toMatchObject({ max: COLD_MAX, sheltered: false });
    expect(hud.cold!.value).toBeCloseTo(COLD_MAX - COLD_DRAIN_OUTDOOR * 30, 0);
    expect(hud.cold!.frost).toBeGreaterThan(0.5);
    expect(hud.hint?.key).toBe('harmonic:hint_find_shelter');
    expect(cold.frost).toBe(hud.cold!.frost);
  });
});
