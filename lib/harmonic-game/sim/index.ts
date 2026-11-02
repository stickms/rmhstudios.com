/**
 * Harmonic's simulation attachment. `attachHarmonicSim(world)` is the one call a Harmonic world
 * needs: it installs the combat service and the per-tick hooks (`SpWorld.hooks`). HL2/Portal
 * worlds never call it, so they run exactly as before.
 */
import type { SpWorld } from '../../sp-game/world/sp-world';
import { HarmonicCombat } from './combat';
import { HarmonicWeapons } from './weapons';
import { ColdService } from './cold';
import './entities';
import './pickups';

export * from './combat';
export * from './constants';
export * from './cold';
export { HarmonicTarget } from './entities';
export * from './weapon-table';
export * from './weapons';

export interface HarmonicSim {
  readonly world: SpWorld;
  readonly combat: HarmonicCombat;
  /** The player's weapons (H1.3). */
  readonly weapons: HarmonicWeapons;
  /** Exposure meter, shelters and heaters (H1.2). */
  readonly cold: ColdService;
}

const sims = new WeakMap<SpWorld, HarmonicSim>();
let active: HarmonicSim | null = null;

/** The most recently attached sim (the one running world; the HUD reads it). */
export function activeHarmonicSim(): HarmonicSim | null {
  return active;
}

export function harmonicSim(world: SpWorld): HarmonicSim | null {
  return sims.get(world) ?? null;
}

export function attachHarmonicSim(world: SpWorld): HarmonicSim {
  const existing = sims.get(world);
  if (existing) return existing;
  const combat = new HarmonicCombat(world);
  const sim: HarmonicSim = {
    world,
    combat,
    weapons: new HarmonicWeapons(world, combat),
    cold: new ColdService(world, combat),
  };
  sims.set(world, sim);
  active = sim;
  world.hooks = {
    afterPlayerCmd(_w, cmd) {
      sim.weapons.update(cmd);
    },
    afterTick() {
      sim.weapons.afterTick();
    },
    afterTick() {
      sim.cold.tick();
    },
  };
  return sim;
}
