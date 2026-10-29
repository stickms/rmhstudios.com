/**
 * What the simulation does with an item: which attribute classes it applies
 * (each at the place the SDK hooks it — docs/tf2-game.md "Items and loadouts"
 * lists them with their hook sites), and which item classes carry a mechanic of
 * their own that is not simulated yet. Anything else on an item is reported as
 * unsupported, so the loadout UI can say so honestly.
 *
 * Environment-agnostic.
 */

/** Attribute classes the simulation applies. */
export const SUPPORTED_ATTRIBUTES: ReadonlySet<string> = new Set([
  // Weapon numbers (CTFWeaponBase / CTFWeaponBaseGun)
  'mult_dmg',
  'mult_clipsize',
  'mod_max_primary_clip_override',
  'mult_postfiredelay',
  'mult_reload_time',
  'mult_reload_time_hidden',
  'mult_bullets_per_shot',
  'mult_spread_scale',
  'mult_deploy_time',
  'mult_single_wep_deploy_time',
  'mult_switch_from_wep_deploy_time',
  'is_a_sword',
  'mult_crit_chance',
  'set_scattergun_no_reload_single',
  // Projectiles (CTFBaseRocket, CTFWeaponBaseGrenadeProj, CTFGrenadeLauncher, CTFProjectile_Syringe)
  'mult_projectile_speed',
  'mult_explosion_radius',
  // Damage rules (CTFGameRules::ApplyOnDamageModifyRules / ApplyOnDamageAliveModifyRules, CBaseObject)
  'mult_dmg_vs_players',
  'mult_dmg_vs_buildings',
  'mini_crit_airborne',
  'mult_dmgtaken',
  'mult_dmgtaken_from_fire',
  'mult_dmgtaken_from_explosions',
  'mult_dmgtaken_from_bullets',
  'mult_dmgtaken_from_melee',
  'dmg_from_melee',
  'dmg_from_ranged',
  'spunup_damage_resistance',
  'rocket_jump_dmg_reduction',
  'blast_dmg_to_self',
  'no_self_blast_dmg',
  'damage_force_reduction',
  // On hit / on kill (CTFWeaponBase::ApplyOnHitAttributes, CTFGameRules::RadiusDamage, CTFPlayer::Event_KilledOther)
  'add_onhit_addhealth',
  'add_health_on_radius_damage',
  'heal_on_kill',
  'restore_health_on_kill',
  'add_onhit_ubercharge',
  // The wearer (CTFPlayer::GetMaxHealthForBuffing, GetMaxAmmo, TeamFortress_CalculateMaxSpeed, RegenThink, healing)
  'add_maxhealth',
  'mult_maxammo_primary',
  'mult_maxammo_secondary',
  'mult_maxammo_metal',
  'mult_player_movespeed',
  'mult_player_movespeed_active',
  'mult_player_aiming_movespeed',
  'provide_on_active',
  'add_health_regen',
  'mult_health_fromhealers',
  'mult_health_frompacks',
  'mult_healing_from_medics',
  // Class weapons
  'mult_medigun_uberchargerate',
  'mult_medigun_healrate',
  'mult_medigun_overheal_amount',
  'mult_medigun_overheal_uberchargerate',
  'mult_minigun_spinup_time',
  'mult_sniper_charge_per_sec',
  'mult_cloak_meter_consume_rate',
  'mult_cloak_meter_regen_rate',
  'mult_wpn_burndmg',
  'mult_wpn_burntime',
  'airblast_disabled',
  'mult_airblast_cost',
]);

/**
 * Attribute classes that are simulated only for some values: `set_charge_type` 1 (the Kritzkrieg's
 * crit charge; 2 Quick-Fix and 3 Vaccinator are not), and the flamethrower's flame model, which every
 * flamethrower in the schema shares and the simulation reproduces with its own constants (a value
 * that differs from the stock flamethrower's is not simulated).
 */
export const PARTIAL_ATTRIBUTES: Readonly<Record<string, (value: number) => boolean>> = {
  set_charge_type: (v) => v === 0 || v === 1,
  flame_gravity: (v) => v === 0,
  flame_drag: (v) => v === 8.5,
  flame_up_speed: (v) => v === 50,
  flame_speed: (v) => v === 2450,
  flame_spread_degree: (v) => v === 2.8,
  flame_lifetime: (v) => v === 0.6,
  flame_random_life_time_offset: (v) => v === 0.1,
  // The stock flamethrower's own value (extinguishing heals 20); it is the default, so nothing changes.
  extinguish_restores_health: (v) => v === 20,
};

/**
 * Item classes that run on a stock implementation but have a defining mechanic of their own that is
 * not simulated (the key the UI explains it by). An item class missing from here and from
 * `IMPLEMENTED_ITEM_CLASSES` is not simulated at all and falls back to the class's stock weapon.
 */
export const ITEM_CLASS_MECHANICS: Readonly<Record<string, string>> = {
  tf_weapon_rocketlauncher_airstrike: 'airstrike',
  tf_weapon_handgun_scout_primary: 'shove',
  tf_weapon_soda_popper: 'hype',
  tf_weapon_pep_brawler_blaster: 'boost',
  tf_weapon_sentry_revenge: 'revenge-crits',
  tf_weapon_charged_smg: 'crikey',
  tf_weapon_sniperrifle_decap: 'heads',
  tf_weapon_sniperrifle_classic: 'classic-charge',
  tf_weapon_sword: 'heads',
  tf_weapon_katana: 'honorbound',
  tf_weapon_bat_wood: 'ball',
  tf_weapon_bat_giftwrap: 'ball',
  tf_weapon_stickbomb: 'caber',
  tf_weapon_robot_arm: 'gunslinger',
  tf_weapon_slap: 'slap',
  tf_weapon_sapper: 'sapper',
  tf_wearable_demoshield: 'shield-charge',
  tf_wearable_razorback: 'razorback',
};
