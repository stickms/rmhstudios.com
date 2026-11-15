/**
 * Two read-only questions about a hit and its victim — which weapon dealt it,
 * and whether the victim is airborne from an explosion. A leaf module (types
 * only), split from sim/items/hooks.ts so the damage rules can ask them without
 * importing the hooks that import the damage rules.
 */

import type { DamageInfo } from '../damage-info';
import type { Entity } from '../entity';
import type { Player } from '../player';
import type { Weapon } from '../weapon-api';
import type { GameWorld } from '../world';
import { FL_ONGROUND } from '../../core/constants';

/** info.GetWeapon(): the projectile's launcher, else the attacker's weapon with the hit's defindex. */
export function damageWeapon(
  world: GameWorld,
  info: DamageInfo,
): Weapon | null {
  const inflictor =
    world.entity(
      info.inflictor,
    ) as
      | (Entity & {
          launcher?: Weapon | null;
        })
      | null;
  if (
    inflictor?.launcher
  )
    return inflictor.launcher;
  const attacker =
    world.entity(
      info.attacker,
    );
  if (
    !attacker ||
    !attacker.isPlayer() ||
    info.weaponDefIndex <
      0
  )
    return null;
  const p =
    attacker as Player;
  const active =
    p.activeWeapon();
  if (
    active &&
    active.defindex ===
      info.weaponDefIndex
  )
    return active;
  for (const w of p.weapons)
    if (
      w &&
      w.defindex ===
        info.weaponDefIndex
    )
      return w;
  return null;
}

/** SDK: CTFPlayer::InAirDueToExplosion (tf_player.h). */
export function inAirDueToExplosion(
  p: Player,
): boolean {
  return (
    (p
      .move
      .flags &
      FL_ONGROUND) ===
      0 &&
    p
      .move
      .waterLevel ===
      0 &&
    p.blastJumpState !==
      0
  );
}
