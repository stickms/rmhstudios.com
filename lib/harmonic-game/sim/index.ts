/**
 * Harmonic's simulation attachment. `attachHarmonicSim(world)` is the one call a Harmonic world
 * needs: it installs the combat service and the per-tick hooks (`SpWorld.hooks`). HL2/Portal
 * worlds never call it, so they run exactly as before.
 */
import { IN_ATTACK } from '../../tf2-game/core/constants';
import { angleVectors, normalize, vec3 } from '../../tf2-game/core/vec';
import type { SpWorld } from '../../sp-game/world/sp-world';
import { HarmonicCombat, type HitResult } from './combat';
import { DEBUG_PULSE_DAMAGE, DEBUG_PULSE_INTERVAL, DEBUG_PULSE_RANGE } from './constants';
import './entities';

export * from './combat';
export * from './constants';
export { HarmonicTarget } from './entities';

export interface HarmonicSim {
  readonly world: SpWorld;
  readonly combat: HarmonicCombat;
  /** curtime before which the primary fire is cooling down. */
  nextFireAt: number;
}

const sims = new WeakMap<SpWorld, HarmonicSim>();

export function harmonicSim(world: SpWorld): HarmonicSim | null {
  return sims.get(world) ?? null;
}

const eye = vec3();
const dir = vec3();

/**
 * The player's primary fire. Before H1.3 this is the debug pulse (a hitscan from the eye);
 * H1.3 replaces this one function with the equipped weapon's fire path.
 */
export function firePrimary(sim: HarmonicSim): HitResult {
  const p = sim.world.player;
  p.eyePosition(eye);
  angleVectors(p.eyeAngles, dir);
  normalize(dir);
  return sim.combat.hitscan(eye, dir, DEBUG_PULSE_RANGE, DEBUG_PULSE_DAMAGE, p, 'bullet');
}

export function attachHarmonicSim(world: SpWorld): HarmonicSim {
  const existing = sims.get(world);
  if (existing) return existing;
  const sim: HarmonicSim = { world, combat: new HarmonicCombat(world), nextFireAt: 0 };
  sims.set(world, sim);
  world.hooks = {
    afterPlayerCmd(w, cmd) {
      const p = w.player;
      if (p.dead || !(cmd.buttons & IN_ATTACK) || w.curtime < sim.nextFireAt) return;
      sim.nextFireAt = w.curtime + DEBUG_PULSE_INTERVAL;
      firePrimary(sim);
    },
  };
  return sim;
}
