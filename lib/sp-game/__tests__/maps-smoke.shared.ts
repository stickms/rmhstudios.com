/**
 * TEST SUPPORT ONLY: the per-map smoke run shared by the HL2 and Portal map
 * suites — load, spawn at info_player_start (the master one), run 60 s with
 * no input, and check nothing went NaN and every classname is implemented.
 */
import { expect } from 'vitest';
import { isSpClassRegistered } from '../entities/base';
import type { SpGame } from '../constants';
import { Driver, loadWorld } from '../sp-driver.test-support';
import { readSpMap } from '../sp-root.test-support';

const finite = (v: { x: number; y: number; z: number }): boolean => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

export async function smokeMap(game: SpGame, map: string, seconds = 60): Promise<Driver> {
  const bsp = readSpMap(game, map);
  const missing = [...new Set(bsp.entities.map((e) => e.classname.toLowerCase()))].filter((c) => c !== 'worldspawn' && !isSpClassRegistered(c));
  expect(missing).toEqual([]);
  const d = new Driver(await loadWorld(game, map));
  const w = d.w;
  // Spawned at an info_player_start (the master one when the map has one).
  const starts = w.findAllByClassname('info_player_start');
  const master = starts.find((s) => s.spawnflags & 1) ?? starts[0];
  if (master) {
    expect(Math.hypot(w.player.origin.x - master.origin.x, w.player.origin.y - master.origin.y)).toBeLessThan(1);
  }
  d.idle(seconds);
  expect(w.curtime).toBeCloseTo(seconds, 1);
  expect(finite(w.player.origin) && finite(w.player.move.velocity)).toBe(true);
  w.forEachEntity((e) => {
    if (!finite(e.origin) || !finite(e.angles)) throw new Error(`${e.classname} ${e.targetname} has a non-finite pose`);
  });
  for (const b of w.physics.bodies.values()) {
    const o = b.getOrigin({ x: 0, y: 0, z: 0 });
    if (!finite(o)) throw new Error(`body of entity ${b.entity} is NaN`);
  }
  const snap = w.snapshot();
  expect(snap.entities.length).toBeGreaterThan(10);
  expect(JSON.stringify(snap).length).toBeGreaterThan(1000);
  return d;
}
