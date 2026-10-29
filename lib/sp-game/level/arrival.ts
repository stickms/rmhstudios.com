/**
 * Arriving in a map through a level transition (the receiving half of
 * CChangeLevel): the player is placed at the same offset from the landmark of
 * the same name, keeps angles, velocity and state; carried entities are
 * re-created at their offsets (or, when they have a `globalname` the new map
 * also uses, that entity is kept as the map placed it); env_global states
 * are restored.
 */

import type { Entity } from '../../tf2-game/sim/entity';
import { BspEntity } from '../../tf2-game/formats/keyvalues';
import type { SpWorld } from '../world/sp-world';
import type { TransitionData } from './transition';

export function findLandmark(world: SpWorld, name: string): Entity | null {
  const lc = name.toLowerCase();
  let found: Entity | null = null;
  world.forEachEntity((e) => {
    if (!found && e.classname === 'info_landmark' && e.targetnameLower === lc) found = e;
  });
  return found;
}

export function applyTransitionArrival(world: SpWorld, t: TransitionData): void {
  const lm = findLandmark(world, t.landmark);
  const base = lm ? lm.origin : { x: 0, y: 0, z: 0 };
  for (const [k, v] of Object.entries(t.globals)) world.globals.set(k, v);
  const p = world.player;
  const cp = t.player;
  p.health = cp.health;
  p.armor = cp.armor;
  p.hasSuit = cp.hasSuit;
  p.suitPower = cp.suitPower;
  p.flashlight = cp.flashlight && cp.hasSuit;
  p.portalgun = cp.portalgun ? { canFire1: cp.portalgun.canFire1, canFire2: cp.portalgun.canFire2, nextFire: 0 } : null;
  if (cp.ducked) {
    p.move.ducked = true;
    p.move.flags |= 2;
    p.move.viewOffsetZ = p.params.duckViewZ;
  }
  p.placeAt({ x: base.x + cp.offset.x, y: base.y + cp.offset.y, z: base.z + cp.offset.z }, cp.eyeAngles, cp.velocity);
  const globalsInMap = new Set<string>();
  world.forEachEntity((e) => {
    const g = e.kv?.get('globalname');
    if (g) globalsInMap.add(g.toLowerCase());
  });
  for (const c of t.entities) {
    if (c.globalname && globalsInMap.has(c.globalname.toLowerCase())) continue;
    const props = c.keyvalues.filter(([k]) => {
      const lk = k.toLowerCase();
      return lk !== 'origin' && lk !== 'angles' && lk !== 'parentname';
    });
    props.push(['origin', `${base.x + c.offset.x} ${base.y + c.offset.y} ${base.z + c.offset.z}`]);
    props.push(['angles', `${c.angles.x} ${c.angles.y} ${c.angles.z}`]);
    const e = world.spawnEntity(c.classname, undefined, new BspEntity(props));
    const body = world.bodiesByEntity.get(e.id);
    if (body) {
      body.setVelocity(c.velocity);
      body.setAngularVelocity(c.angularVelocity);
    }
  }
}
