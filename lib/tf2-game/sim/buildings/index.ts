/**
 * Engineer buildings and the Spy's sapper (see the module files for the SDK
 * routines each follows). `registerBuildings()` links the entity classes and
 * the building tools into the core's factories; call it once at start-up
 * (it is idempotent).
 */

import { registerEntityClass } from '../entity-registry';
import { registerWeapon, type WeaponSpec } from '../weapon-api';
import { ObjectDispenser } from './dispenser';
import { ObjectSapper } from './sapper';
import { ObjectSentrygun, SentryRocket } from './sentry';
import { ObjectTeleporter } from './teleporter';
import { isSapperItem, PdaEngineerBuild, PdaEngineerDestroy, WeaponBuilder } from './weapons';

export * from './base-object';
export * from './net';
export * from './sentry';
export * from './dispenser';
export * from './teleporter';
export * from './sapper';
export * from './player-objects';
export * from './weapons';

let registered = false;

/**
 * Registers obj_sentrygun, obj_dispenser, obj_teleporter, obj_attachment_sapper,
 * tf_projectile_sentryrocket and the weapons tf_weapon_pda_engineer_build,
 * tf_weapon_pda_engineer_destroy, tf_weapon_builder (the engineer's blueprint, or the
 * spy's sapper for a sapper item) and tf_weapon_sapper.
 */
export function registerBuildings(): void {
  if (registered) return;
  registered = true;
  registerEntityClass('obj_sentrygun', ObjectSentrygun);
  registerEntityClass('obj_dispenser', ObjectDispenser);
  registerEntityClass('obj_teleporter', ObjectTeleporter);
  registerEntityClass('obj_attachment_sapper', ObjectSapper);
  registerEntityClass('tf_projectile_sentryrocket', SentryRocket);
  registerWeapon('tf_weapon_pda_engineer_build', (spec: WeaponSpec) => new PdaEngineerBuild(spec));
  registerWeapon(
    'tf_weapon_pda_engineer_destroy',
    (spec: WeaponSpec) => new PdaEngineerDestroy(spec),
  );
  registerWeapon(
    'tf_weapon_builder',
    (spec: WeaponSpec) => new WeaponBuilder(spec, isSapperItem(spec.defindex)),
  );
  registerWeapon('tf_weapon_sapper', (spec: WeaponSpec) => new WeaponBuilder(spec, true));
}

/** Test helper: allow `registerBuildings` to run again after the registries were cleared. */
export function resetBuildingsRegistration(): void {
  registered = false;
}
