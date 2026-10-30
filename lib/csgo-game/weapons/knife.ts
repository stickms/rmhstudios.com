/**
 * The knife (both teams' default knife, skinless): a left-click slash and a right-click stab, with
 * backstabs. Damage is not in items_game (only the knife's `armor ratio`, `kill award` and speed are);
 * these are the CS:GO wiki's published values: slash 40 then 25 for follow-up slashes, 90 from behind;
 * stab 65, 180 from behind. Reach: the slash ~48 units, the stab ~32 (community measurement).
 */

import { IN_ATTACK, IN_ATTACK2 } from '../../tf2-game/core/constants';
import { emptyTrace, type UserCmd } from '../../tf2-game/core/types';
import { angleVectors, vec3, type Vec3 } from '../../tf2-game/core/vec';
import { COLLISION_GROUP_NONE } from '../../tf2-game/sim/entity';
import {
  createDamageInfo,
  DMG_NEVERGIB,
  DMG_SLASH,
  TF_DMG_CUSTOM_BACKSTAB,
} from '../../tf2-game/sim/damage';
import {
  PLAYERANIMEVENT_ATTACK_PRIMARY,
  PLAYERANIMEVENT_ATTACK_SECONDARY,
} from '../../tf2-game/sim/player';
import { CsWeapon, VM_FIRE, VM_IDLE, VM_SECONDARY } from './base';
import { CS_MASK_SHOT } from './bullets';

export const KNIFE_SLASH_DAMAGE = 40;
export const KNIFE_SLASH_FOLLOWUP_DAMAGE = 25;
export const KNIFE_SLASH_BACKSTAB_DAMAGE = 90;
export const KNIFE_STAB_DAMAGE = 65;
export const KNIFE_STAB_BACKSTAB_DAMAGE = 180;
export const KNIFE_SLASH_RANGE = 48;
export const KNIFE_STAB_RANGE = 32;
/** Slash cycle on a hit / a miss, stab cycle (CS:GO wiki: 0.5 / 0.4, 1.0). */
export const KNIFE_SLASH_CYCLE_HIT = 0.5;
export const KNIFE_SLASH_CYCLE_MISS = 0.4;
export const KNIFE_STAB_CYCLE = 1.0;
/** A follow-up slash within this long after a slash hits for the lower damage. */
export const KNIFE_FOLLOWUP_WINDOW = 0.6;
/** From behind: the victim's facing and the attack line agree within ~60° (community measurement). */
export const BACKSTAB_DOT = 0.5;

const tr = emptyTrace();
const eye = vec3();
const fwd = vec3();
const end = vec3();
const mins = { x: -16, y: -16, z: -18 };
const maxs = { x: 16, y: 16, z: 18 };
const info = createDamageInfo();

export class CsKnife extends CsWeapon {
  itemPostFrame(cmd: UserCmd): void {
    const owner = this.cs;
    if (!owner) return;
    const t = this.curtime;
    if (owner.cannotAttack()) return;
    if (cmd.buttons & IN_ATTACK2 && t >= this.nextSecondaryAttack) this.swingAt(cmd, true, t);
    else if (cmd.buttons & IN_ATTACK && t >= this.nextPrimaryAttack) this.swingAt(cmd, false, t);
    else if (t >= this.timeWeaponIdle && this.vmActivity !== VM_IDLE) this.setActivity(VM_IDLE);
  }

  private swingAt(cmd: UserCmd, stab: boolean, t: number): void {
    const owner = this.cs;
    const world = this.world;
    owner.eyePosition(eye);
    angleVectors(cmd.viewAngles, fwd);
    const range = stab ? KNIFE_STAB_RANGE : KNIFE_SLASH_RANGE;
    end.x = eye.x + fwd.x * range;
    end.y = eye.y + fwd.y * range;
    end.z = eye.z + fwd.z * range;
    let victimId = -1;
    let hitWorld = false;
    if (world.isServer) {
      // A line first (hitboxes, lag-compensated), then a hull for near misses (CS's swing hull).
      world.lagcomp.withRewind(owner, cmd.tickCount, () => {
        world.traceAttackWith(owner, eye, end, tr, { hitTeammates: world.bulletsHitTeammates() });
        if (tr.fraction < 1 && tr.entity > 0 && world.entity(tr.entity)?.isPlayer())
          victimId = tr.entity;
        else {
          hitWorld = tr.fraction < 1;
          world.traceHull(
            eye,
            end,
            mins,
            maxs,
            CS_MASK_SHOT,
            world.entityFilter(owner, COLLISION_GROUP_NONE),
            tr,
          );
          const e = tr.fraction < 1 && tr.entity > 0 ? world.entity(tr.entity) : null;
          if (
            e &&
            e.isPlayer() &&
            e.alive &&
            (world.bulletsHitTeammates() || e.team !== owner.team)
          )
            victimId = e.id;
          else hitWorld = hitWorld || tr.fraction < 1;
        }
      });
    }
    const victim = victimId > 0 ? world.player(victimId) : null;
    const back = victim ? isBehind(owner.origin, victim.origin, victim.eyeAngles.y) : false;
    const followUp = !stab && this.swing > 0 && t - this.lastFireTime < KNIFE_FOLLOWUP_WINDOW;
    const damage = stab
      ? back
        ? KNIFE_STAB_BACKSTAB_DAMAGE
        : KNIFE_STAB_DAMAGE
      : back
        ? KNIFE_SLASH_BACKSTAB_DAMAGE
        : followUp
          ? KNIFE_SLASH_FOLLOWUP_DAMAGE
          : KNIFE_SLASH_DAMAGE;
    const cycle = stab ? KNIFE_STAB_CYCLE : victim ? KNIFE_SLASH_CYCLE_HIT : KNIFE_SLASH_CYCLE_MISS;
    this.nextPrimaryAttack = t + cycle;
    this.nextSecondaryAttack = t + cycle;
    this.timeWeaponIdle = t + 1;
    this.lastFireTime = t;
    this.swing = stab ? 0 : victim ? 1 : this.swing;
    owner.onFiredWeapon();
    this.setActivity(stab ? VM_SECONDARY : VM_FIRE);
    owner.doAnimationEvent(
      stab ? PLAYERANIMEVENT_ATTACK_SECONDARY : PLAYERANIMEVENT_ATTACK_PRIMARY,
    );
    this.sound(
      victim ? 'Weapon_Knife.Hit' : hitWorld ? 'Weapon_Knife.HitWall' : 'Weapon_Knife.Slash',
    );
    if (!victim || !world.isServer) return;
    info.attacker = owner.id;
    info.inflictor = owner.id;
    info.weaponId = this.info.defindex;
    info.weaponDefIndex = this.info.defindex;
    info.killIcon = this.info.short;
    info.damage = damage;
    info.baseDamage = damage;
    info.damageType = DMG_SLASH | DMG_NEVERGIB;
    info.customKill = back ? TF_DMG_CUSTOM_BACKSTAB : 0;
    info.critType = 0;
    info.hitGroup = 0;
    info.position.x = tr.endPos.x;
    info.position.y = tr.endPos.y;
    info.position.z = tr.endPos.z;
    info.force.x = fwd.x * damage * 4;
    info.force.y = fwd.y * damage * 4;
    info.force.z = fwd.z * damage * 4;
    world.applyDamage(victim, info);
  }
}

/** Is the attacker at `from` behind a victim at `at` facing `victimYaw` (flat)? */
export function isBehind(from: Vec3, at: Vec3, victimYaw: number): boolean {
  const r = (victimYaw * Math.PI) / 180;
  const vx = Math.cos(r);
  const vy = Math.sin(r);
  let dx = at.x - from.x;
  let dy = at.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return false;
  dx /= len;
  dy /= len;
  return vx * dx + vy * dy > BACKSTAB_DOT;
}
