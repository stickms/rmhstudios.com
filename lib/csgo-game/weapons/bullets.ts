/**
 * CS:GO bullets: the shot's direction (view + recoil + the seeded inaccuracy/spread offsets), then,
 * on the host, the trace through the shared world — player hitboxes (lag-compensated over the whole
 * burst), range falloff, and penetration through world surfaces (wallbangs) with per-material
 * modifiers and a cap on surfaces per weapon (combat.ts). Each pellet is its own hit (CS applies hit
 * groups and armor per bullet). Tracers and impacts go out as the shared effect events.
 */

import {
  emptyTrace,
  NO_ENTITY,
  WORLD_ENTITY,
  HITGROUP_HEAD,
  type TraceResult,
} from '../../tf2-game/core/types';
import {
  CONTENTS_GRATE,
  CONTENTS_MOVEABLE,
  CONTENTS_SOLID,
  CONTENTS_WINDOW,
  MASK_SHOT,
} from '../../tf2-game/core/constants';
import { angleVectors, vec3, type Vec3 } from '../../tf2-game/core/vec';
import {
  createDamageInfo,
  DMG_BULLET,
  DMG_NEVERGIB,
  TF_DMG_CUSTOM_HEADSHOT,
} from '../../tf2-game/sim/damage';
import { DAMAGE_NO } from '../../tf2-game/sim/entity';
import type { CsWeaponInfo } from '../data/weapon-data';
import { damageAfterPenetration, maxPenetrations, penetrationDepth, rangeDamage } from '../combat';
import type { CsPlayer } from '../player';
import type { CsWorld } from '../world';

const fwd = vec3();
const right = vec3();
const up = vec3();
const dir = vec3();
const start = vec3();
const end = vec3();
const probe = vec3();
const exitPoint = vec3();
const tr = emptyTrace();
const exitTr = emptyTrace();
const info = createDamageInfo();
/** What stops a bullet in the map (MASK_SHOT without hitboxes and monsters). */
const SOLID_MASK = CONTENTS_SOLID | CONTENTS_MOVEABLE | CONTENTS_WINDOW | CONTENTS_GRATE;
/** Step when searching for the far side of a surface (units). */
const EXIT_STEP = 4;

/** The direction of pellet `p` (unit vector) for view `angles` and offsets (radians right, up). */
export function shotDirection(angles: Vec3, offsets: Float64Array, p: number, out: Vec3): Vec3 {
  angleVectors(angles, fwd, right, up);
  const ox = offsets[2 * p];
  const oy = offsets[2 * p + 1];
  out.x = fwd.x + right.x * ox + up.x * oy;
  out.y = fwd.y + right.y * ox + up.y * oy;
  out.z = fwd.z + right.z * ox + up.z * oy;
  const len = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= len;
  out.y /= len;
  out.z /= len;
  return out;
}

/**
 * Finds where a bullet entering a solid at `entry` along `d` comes out, within `maxDepth` units.
 * Returns the thickness (units), or −1 when it does not come out (writes the exit point).
 */
function findExit(world: CsWorld, entry: Vec3, d: Vec3, maxDepth: number, outExit: Vec3): number {
  for (let dist = EXIT_STEP; dist <= maxDepth + EXIT_STEP; dist += EXIT_STEP) {
    probe.x = entry.x + d.x * dist;
    probe.y = entry.y + d.y * dist;
    probe.z = entry.z + d.z * dist;
    if (world.pointContents(probe) & SOLID_MASK) continue;
    // Out: trace back to find the far face exactly.
    world.traceLineWorldOnly(probe, entry, SOLID_MASK, exitTr);
    if (exitTr.startSolid) continue;
    outExit.x = exitTr.endPos.x;
    outExit.y = exitTr.endPos.y;
    outExit.z = exitTr.endPos.z;
    const thickness = Math.hypot(outExit.x - entry.x, outExit.y - entry.y, outExit.z - entry.z);
    return thickness > maxDepth ? -1 : thickness;
  }
  return -1;
}

/**
 * Fires `pellets` bullets for `shooter`. Writes each pellet's direction into `outDirs` (3 per
 * pellet) on host and predicting client alike; traces and damage only on the host.
 */
export function fireCsBullets(
  world: CsWorld,
  shooter: CsPlayer,
  weapon: CsWeaponInfo,
  src: Vec3,
  angles: Vec3,
  offsets: Float64Array,
  pellets: number,
  cmdTick: number,
  outDirs: Float64Array | null,
): void {
  for (let p = 0; p < pellets; p++) {
    shotDirection(angles, offsets, p, dir);
    if (outDirs) {
      outDirs[3 * p] = dir.x;
      outDirs[3 * p + 1] = dir.y;
      outDirs[3 * p + 2] = dir.z;
    }
  }
  if (!world.isServer) return;
  const run = (): void => {
    for (let p = 0; p < pellets; p++) {
      shotDirection(angles, offsets, p, dir);
      traceBullet(world, shooter, weapon, src, dir, p === 0 && weapon.tracerFrequency > 0);
    }
  };
  if (!world.lagcomp.isRewinding) world.lagcomp.withRewind(shooter, cmdTick, run);
  else run();
}

function traceBullet(
  world: CsWorld,
  shooter: CsPlayer,
  weapon: CsWeaponInfo,
  src: Vec3,
  d: Vec3,
  tracer: boolean,
): void {
  let damage = weapon.damage;
  let traveled = 0;
  let pens = maxPenetrations(weapon.penetration);
  let skip = NO_ENTITY;
  start.x = src.x;
  start.y = src.y;
  start.z = src.z;
  const hitTeammates = world.bulletsHitTeammates();
  for (let guard = 0; guard < 8 && damage >= 1; guard++) {
    const remaining = weapon.range - traveled;
    if (remaining <= 1) return;
    end.x = start.x + d.x * remaining;
    end.y = start.y + d.y * remaining;
    end.z = start.z + d.z * remaining;
    world.traceAttackWith(shooter, start, end, tr, { hitTeammates, skip });
    if (guard === 0 && tracer) {
      world.emitEffect({
        kind: 'tracer',
        pos: { x: tr.endPos.x, y: tr.endPos.y, z: tr.endPos.z },
        start: { x: src.x, y: src.y, z: src.z },
        end: { x: tr.endPos.x, y: tr.endPos.y, z: tr.endPos.z },
        entity: shooter.id,
        attachment: 'muzzle',
        notTo: shooter.isBot ? undefined : shooter.id,
      });
    }
    if (tr.fraction >= 1) return;
    const hitDist = traveled + tr.fraction * remaining;
    const victim = tr.entity > 0 ? world.entity(tr.entity) : null;
    if (victim && victim.isPlayer()) {
      applyBulletHit(
        world,
        shooter,
        weapon,
        victim.id,
        tr,
        rangeDamage(damage, weapon.rangeModifier, hitDist),
        d,
        src,
      );
      return;
    }
    if (victim && victim.takeDamage !== DAMAGE_NO && victim !== world.worldEntity) {
      applyBulletHit(
        world,
        shooter,
        weapon,
        victim.id,
        tr,
        rangeDamage(damage, weapon.rangeModifier, hitDist),
        d,
        src,
      );
    }
    world.emitEffect({
      kind: 'impact',
      pos: { x: tr.endPos.x, y: tr.endPos.y, z: tr.endPos.z },
      normal: { x: tr.plane.normal.x, y: tr.plane.normal.y, z: tr.plane.normal.z },
      material: tr.surfaceName,
    });
    // A wallbang: through the surface when the weapon has power left for its material and thickness.
    if (pens <= 0 || tr.startSolid) return;
    const depth = penetrationDepth(weapon.penetration, tr.surfaceName);
    const thickness = findExit(world, tr.endPos, d, depth, exitPoint);
    if (thickness < 0) return;
    damage = damageAfterPenetration(damage, thickness, depth);
    pens--;
    traveled = hitDist + thickness;
    skip = tr.entity !== WORLD_ENTITY ? tr.entity : NO_ENTITY;
    start.x = exitPoint.x + d.x;
    start.y = exitPoint.y + d.y;
    start.z = exitPoint.z + d.z;
    world.emitEffect({
      kind: 'impact',
      pos: { x: exitPoint.x, y: exitPoint.y, z: exitPoint.z },
      normal: { x: d.x, y: d.y, z: d.z },
      material: tr.surfaceName,
    });
  }
}

function applyBulletHit(
  world: CsWorld,
  shooter: CsPlayer,
  weapon: CsWeaponInfo,
  victimId: number,
  t: TraceResult,
  damage: number,
  d: Vec3,
  src: Vec3,
): void {
  const victim = world.entity(victimId);
  if (!victim || damage <= 0) return;
  info.attacker = shooter.id;
  info.inflictor = shooter.id;
  info.weaponId = weapon.defindex;
  info.weaponDefIndex = weapon.defindex;
  info.killIcon = weapon.short;
  info.damage = damage;
  info.baseDamage = damage;
  info.damageType = DMG_BULLET | DMG_NEVERGIB;
  info.customKill = t.hitGroup === HITGROUP_HEAD ? TF_DMG_CUSTOM_HEADSHOT : 0;
  info.critType = 0;
  info.hitGroup = t.hitGroup;
  info.position.x = t.endPos.x;
  info.position.y = t.endPos.y;
  info.position.z = t.endPos.z;
  info.reportedPosition.x = src.x;
  info.reportedPosition.y = src.y;
  info.reportedPosition.z = src.z;
  info.force.x = d.x * damage * 4;
  info.force.y = d.y * damage * 4;
  info.force.z = d.z * damage * 4;
  if (victim.isPlayer()) {
    world.emitEffect({
      kind: 'blood',
      pos: { x: t.endPos.x, y: t.endPos.y, z: t.endPos.z },
      normal: { ...t.plane.normal },
      entity: victim.id,
    });
  }
  world.applyDamage(victim, info);
}

/** MASK_SHOT, re-exported for weapons that trace on their own (the knife). */
export const CS_MASK_SHOT = MASK_SHOT;
