/**
 * What the stock projectiles share: the airblast contract (IsDeflectable /
 * Deflected / IsDestroyable), the explosion routine every blast projectile
 * ends in (CTFBaseRocket::Explode / CTFWeaponBaseGrenadeProj::Explode:
 * move off the surface, the explosion effect and sound, then
 * CTFGameRules::RadiusDamage with the self-damage "RJ" radius), and the
 * projectile kinds the client picks models and trails by.
 */

import { MASK_WATER, TF_TEAM_BLUE } from '../../core/constants';
import { NO_ENTITY, type TraceResult } from '../../core/types';
import { vec3, type Vec3 } from '../../core/vec';
import { WEAPON_SCRIPTS, type WeaponScript } from '../../data/weapons';
import { createDamageInfo, createRadiusDamageInfo, DMG_CRITICAL, resetDamageInfo } from '../damage';
import type { Entity } from '../entity';
import type { BaseProjectile } from '../physics';
import type { Player } from '../player';
import type { Weapon } from '../weapon-api';

/** NET_PROJECTILE `kind` values (the client's model / trail switch). */
export const PROJECTILE_KIND = {
  ROCKET: 1,
  PIPE: 2,
  STICKY: 3,
  SYRINGE: 4,
} as const;

export const ROCKET_MODEL = 'models/weapons/w_models/w_rocket.mdl';
export const PIPE_MODEL = 'models/weapons/w_models/w_grenade_grenadelauncher.mdl';
export const STICKY_MODEL = 'models/weapons/w_models/w_stickybomb.mdl';
export const SYRINGE_MODEL = 'models/weapons/w_models/w_syringe_proj.mdl';

/** An entity the Pyro's airblast can act on (CBaseEntity::IsDeflectable / Deflected). */
export interface Deflectable {
  isDeflectable(): boolean;
  /** Airblasted by `by`: `dir` is the new heading (DeflectEntity already set the velocity). */
  onDeflected(by: Player, dir: Vec3): void;
  /** CTFBaseRocket::IsDestroyable (TF_ROCKET_DESTROYABLE_TIMER). */
  isDestroyable?(): boolean;
}

export const isDeflectable = (e: Entity): e is Entity & Deflectable =>
  typeof (e as Partial<Deflectable>).isDeflectable === 'function' && (e as Entity & Deflectable).isDeflectable();

/** The weapon script of a projectile's launcher (falling back to a named stock script). */
export function launcherScript(p: BaseProjectile, fallback: keyof typeof WEAPON_SCRIPTS): WeaponScript {
  const l = p.launcher as (Weapon & { script?: WeaponScript }) | null;
  return l?.script ?? WEAPON_SCRIPTS[fallback];
}

export interface ExplosionParams {
  /** The player credited (GetOwnerEntity / GetThrower; a sentry's builder). */
  attacker: number;
  damage: number;
  damageType: number;
  customKill: number;
  radius: number;
  /** TF_ROCKET_RADIUS_FOR_RJS / TF_GRENADE_JUMP_RADIUS. */
  selfRadius: number;
  /** The launcher script's base damage, used against the shooter himself. */
  selfBaseDamage: number;
  /** Explosion particle systems (script ExplosionEffect / PlayerEffect / WaterEffect) and sound. */
  script: WeaponScript;
  /** Where the attacker was when it was fired (falloff for some rules). */
  reported?: Vec3 | null;
}

const explodeInfo = createDamageInfo();
const explodeRadius = createRadiusDamageInfo(explodeInfo, vec3(), 0);

/**
 * SDK: CTFBaseRocket::Explode / CTFWeaponBaseGrenadeProj::Explode — the
 * blast at the projectile (moved 1 unit off the surface it hit), with the
 * entity it hit directly taking full damage (GetEnemy).
 */
export function explodeProjectile(p: BaseProjectile, tr: TraceResult | null, other: Entity | null, x: ExplosionParams): void {
  const w = p.world;
  if (tr && tr.fraction !== 1) {
    p.origin.x = tr.endPos.x + tr.plane.normal.x;
    p.origin.y = tr.endPos.y + tr.plane.normal.y;
    p.origin.z = tr.endPos.z + tr.plane.normal.z;
  }
  const hitPlayer = !!other && other.isPlayer();
  const inWater = (w.pointContents(p.origin) & MASK_WATER) !== 0;
  const system = inWater ? x.script.explosionWaterEffect : hitPlayer ? x.script.explosionPlayerEffect : x.script.explosionEffect;
  w.emitEffect({
    kind: 'explosion',
    pos: { x: p.origin.x, y: p.origin.y, z: p.origin.z },
    normal: tr ? { x: tr.plane.normal.x, y: tr.plane.normal.y, z: tr.plane.normal.z } : undefined,
    system,
    entity: hitPlayer && other ? other.id : undefined,
    value: p.weaponId,
    team: p.team === TF_TEAM_BLUE ? TF_TEAM_BLUE : p.team,
  });
  if (x.script.explosionSound) w.emitSound(x.script.explosionSound, { pos: p.origin });
  if (tr && other && !hitPlayer) {
    w.emitEffect({ kind: 'decal', pos: { x: tr.endPos.x, y: tr.endPos.y, z: tr.endPos.z }, normal: { ...tr.plane.normal }, system: 'Scorch' });
  }
  if (x.attacker === NO_ENTITY || !w.entity(x.attacker)) return;
  const info = resetDamageInfo(explodeInfo);
  info.attacker = x.attacker;
  info.inflictor = p.id;
  info.weaponId = p.weaponId;
  info.weaponDefIndex = p.launcherDefIndex;
  info.killIcon = p.killIcon;
  info.damage = x.damage;
  info.damageType = x.damageType | (p.critType === 2 ? DMG_CRITICAL : 0);
  info.critType = p.critType === 2 ? 2 : 0;
  info.customKill = x.customKill;
  info.position.x = p.origin.x;
  info.position.y = p.origin.y;
  info.position.z = p.origin.z;
  if (x.reported) {
    info.reportedPosition.x = x.reported.x;
    info.reportedPosition.y = x.reported.y;
    info.reportedPosition.z = x.reported.z;
  }
  info.directHitEntity = other && other !== w.worldEntity ? other.id : NO_ENTITY;
  const r = explodeRadius;
  r.src.x = p.origin.x;
  r.src.y = p.origin.y;
  r.src.z = p.origin.z;
  r.radius = x.radius;
  r.ignore = NO_ENTITY;
  r.forceScale = 1;
  r.rjRadius = x.selfRadius;
  r.rjBaseDamage = x.selfBaseDamage;
  w.radiusDamage(r);
}
