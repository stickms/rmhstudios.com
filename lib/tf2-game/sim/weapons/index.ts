/**
 * The stock arsenal (lib/tf2-game/sim/weapons): every class's stock weapons
 * on top of the core's weapon contract (sim/weapon-api.ts), with their
 * projectiles (sim/projectiles). `registerStockWeapons()` installs the
 * factories by weapon script classname — the per-class script the loadout
 * resolves an item to (shotguns and pistols differ per class). The
 * Engineer's PDAs and builder and the Spy's sapper belong to the buildings
 * module and are not registered here.
 */

import { registerWeapon, type WeaponFactory, type WeaponSpec } from '../weapon-api';
import '../projectiles';
import { Flamethrower } from './flamethrower';
import { HitscanGun } from './gun';
import { GrenadeLauncher, RocketLauncher, StickybombLauncher, SyringeGun } from './launchers';
import { Medigun } from './medigun';
import { Bottle, Fists, Knife, MeleeWeapon, Wrench } from './melee';
import { Minigun } from './minigun';
import { SniperRifle } from './sniper-rifle';
import { DisguiseKit, InvisWatch } from './spy';

export * from './constants';
export * from './crits';
export * from './spy-state';
export * from './tf-weapon';
export * from './gun';
export * from './launchers';
export * from './minigun';
export * from './sniper-rifle';
export * from './flamethrower';
export * from './melee';
export * from './medigun';
export * from './spy';

const make =
  <T>(ctor: new (spec: WeaponSpec) => T): WeaponFactory =>
  (spec) =>
    new ctor(spec) as unknown as ReturnType<WeaponFactory>;

/** Weapon script classname → the class that implements it. */
export const STOCK_WEAPON_FACTORIES: Readonly<Record<string, WeaponFactory>> = {
  tf_weapon_scattergun: make(HitscanGun),
  tf_weapon_shotgun_primary: make(HitscanGun),
  tf_weapon_shotgun_soldier: make(HitscanGun),
  tf_weapon_shotgun_hwg: make(HitscanGun),
  tf_weapon_shotgun_pyro: make(HitscanGun),
  tf_weapon_pistol: make(HitscanGun),
  tf_weapon_pistol_scout: make(HitscanGun),
  tf_weapon_smg: make(HitscanGun),
  tf_weapon_revolver: make(HitscanGun),
  tf_weapon_minigun: make(Minigun),
  tf_weapon_sniperrifle: make(SniperRifle),
  tf_weapon_syringegun_medic: make(SyringeGun),
  tf_weapon_rocketlauncher: make(RocketLauncher),
  tf_weapon_grenadelauncher: make(GrenadeLauncher),
  tf_weapon_pipebomblauncher: make(StickybombLauncher),
  tf_weapon_flamethrower: make(Flamethrower),
  tf_weapon_bat: make(MeleeWeapon),
  tf_weapon_shovel: make(MeleeWeapon),
  tf_weapon_fireaxe: make(MeleeWeapon),
  tf_weapon_club: make(MeleeWeapon),
  tf_weapon_bonesaw: make(MeleeWeapon),
  tf_weapon_bottle: make(Bottle),
  tf_weapon_fists: make(Fists),
  tf_weapon_wrench: make(Wrench),
  tf_weapon_knife: make(Knife),
  tf_weapon_medigun: make(Medigun),
  tf_weapon_invis: make(InvisWatch),
  tf_weapon_pda_spy: make(DisguiseKit),
};

/** Registers every stock weapon factory with the core's weapon registry (idempotent). */
export function registerStockWeapons(): void {
  for (const [classname, factory] of Object.entries(STOCK_WEAPON_FACTORIES)) registerWeapon(classname, factory);
}
