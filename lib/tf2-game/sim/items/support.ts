/**
 * What the simulation does with an item: which attribute classes it applies
 * (each at the place the SDK hooks it — docs/tf2-game.md "Items and loadouts"
 * lists them with their hook sites), and which item classes carry a mechanic of
 * their own that is not simulated yet. Anything else on an item is reported as
 * unsupported, so the loadout UI can say so honestly.
 *
 * Environment-agnostic.
 */

import { PROJECTILE_TYPES } from '../../data/weapons';

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
  // Unlock damage rules (items/damage-rules.ts: ApplyOnDamageModifyRules, OnTakeDamage, Event_KilledOther)
  'or_crit_vs_playercond',
  'crit_vs_wet_players',
  'attack_minicrits_and_consumes_burning',
  'crit_while_airborne',
  'or_minicrit_vs_playercond_burning',
  'closerange_backattack_minicrits',
  'minicrits_become_crits',
  'crits_become_minicrits',
  'crit_dmg_falloff',
  'mult_dmg_vs_burning',
  'set_dmgtype_ignite',
  'mod_pierce_resists_absorbs',
  'mult_dmgtaken_from_fire_active',
  'energy_buff_dmg_taken_multiplier',
  'bleeding_duration',
  'become_fireproof_on_hit_by_fire',
  'set_blockbackstab_once',
  'add_onkill_critboost_time',
  'rage_on_kill',
  'decapitate_type',
  // On hit (ApplyOnHitAttributes)
  'add_onhit_addammo',
  'add_cloak_on_hit',
  'speed_boost_on_hit',
  'mark_for_death',
  'mult_onhit_enemyspeed',
  'charge_meter_on_hit',
  'subtract_victim_medigun_charge_onhit',
  'subtract_victim_cloak_on_hit',
  'hype_on_damage',
  'boost_on_damage',
  'lose_hype_on_take_damage',
  'mod_mark_attacker_for_death',
  // The Demoman's charge (CTFWearableDemoShield, CTFPlayerShared::UpdateChargeMeter / CalculateChargeCap)
  'charge_turn_control',
  'charge_recharge_rate',
  'charge_impact_damage',
  'mod_charge_time',
  'kill_refills_meter',
  'lose_demo_charge_on_damage_when_charging',
  'mult_player_movespeed_shieldrequired',
  'afterburn_immunity',
  // Movement (CTFGameMovement's hooks) and the fire rate while blast jumping
  'air_dash_count',
  'hype_resets_on_jump',
  'mod_jump_height_from_weapon',
  'mod_air_control_blast_jump',
  'parachute_attribute',
  'rocketjump_attackrate_bonus',
  // The effect bar (CTFWeaponBase::GetEffectBarRechargeTime) and the jars' extinguish refund
  'effectbar_recharge_rate',
  'extinguish_reduces_cooldown',
  // The Engineer's (the Rescue Ranger, the Pomson, the Bison)
  'building_teleporting_pickup',
  'arrow_heals_buildings',
  'mark_for_death_on_building_pickup',
  'energy_weapon_penetration',
  // Description-only markers the SDK never reads (the behaviour is the item class's own)
  'energy_weapon_no_ammo',
  'energy_weapon_no_hurt_building',
  'energy_weapon_no_deflect',
  'energy_weapon_charged_shot',
  'dragons_fury_neutral_properties',
  'dragons_fury_positive_properties',
  'dragons_fury_negative_properties',
  'grenade_not_explode_on_impact',
  'cannonball_push_back',
  'disable_weapon_hiding_for_animations',
  // CTFWeaponBaseMelee::ItemPreFrame / Holster; CTFFlameManager's crit from behind (the Backburner)
  'self_mark_for_death',
  'set_flamethrower_back_crit',
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
  // override_projectile_type: the projectiles the guns can fire (CTFWeaponBaseGun::FireProjectile's cases here).
  override_projectile_type: (v) => FIRED_PROJECTILES.has(PROJECTILE_TYPES[v] ?? ''),
};

/** The projectile types gun.ts FireProjectile handles (override_projectile_type). */
const FIRED_PROJECTILES: ReadonlySet<string> = new Set([
  'projectile_bullet',
  'projectile_rocket',
  'projectile_pipe',
  'projectile_pipe_remote',
  'projectile_pipe_remote_practice',
  'projectile_cannonball',
  'projectile_syringe',
  'projectile_flare',
  'projectile_jar',
  'projectile_jar_milk',
  'projectile_cleaver',
  'projectile_festive_urine',
  'projectfile_breadmonster_jarate',
  'projectfile_breadmonster_madmilk',
  'projectile_jar_gas',
  'projectile_arrow',
  'projectile_healing_bolt',
  'projectile_building_repair_bolt',
  'projectile_festive_arrow',
  'projectile_festive_healing_bolt',
  'projectile_energy_ball',
  'projectile_energy_ring',
]);

/**
 * Attribute classes whose meaning belongs to an item class (set_weapon_mode is the lunch box type
 * on a lunch box, the flare type on a flare gun …): simulated on these item classes (the schema's
 * item_class, before TranslateWeaponEntForClass) and nowhere else.
 */
export const ITEM_CLASS_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
  tf_weapon_lunchbox: new Set(['set_weapon_mode', 'item_meter_charge_type', 'item_meter_charge_rate', 'lunchbox_healing_scale']),
  tf_weapon_lunchbox_drink: new Set(['set_weapon_mode', 'item_meter_charge_type', 'item_meter_charge_rate']),
  tf_weapon_flaregun: new Set(['set_weapon_mode']),
  tf_weapon_flaregun_revenge: new Set(['set_weapon_mode', 'extinguish_revenge', 'extinguish_restores_health']),
  tf_weapon_crossbow: new Set(['set_weapon_mode']),
  tf_weapon_jar_gas: new Set([
    'item_meter_charge_type',
    'item_meter_charge_rate',
    'item_meter_damage_for_full_charge',
    'item_meter_resupply_denied',
    'grenades1_resupply_denied',
  ]),
  tf_weapon_rocketlauncher_fireball: new Set(['item_meter_charge_type', 'item_meter_charge_rate', 'extinguish_restores_health']),
  tf_weapon_cannon: new Set(['grenade_launcher_mortar_mode']),
  tf_weapon_buff_item: new Set(['set_buff_type']),
  tf_weapon_parachute: new Set(['set_buff_type']),
  tf_weapon_mechanical_arm: new Set(['mod_ammo_per_shot', 'mod_use_metal_ammo_type']),
  tf_wearable_razorback: new Set(['item_meter_charge_type', 'item_meter_charge_rate']),
  // CTFRevolver::CanHeadshot (the Ambassador).
  tf_weapon_revolver: new Set(['set_weapon_mode']),
  // CTFShovel::GetShovelType (the Equalizer, the Escape Plan).
  tf_weapon_shovel: new Set(['set_weapon_mode']),
  // CTFWeaponInvis::GetInvisType (the Dead Ringer, the Cloak and Dagger).
  tf_weapon_invis: new Set(['set_weapon_mode', 'cloak_consume_on_feign_death_activate']),
};

/**
 * Item classes that run on a stock implementation but have a defining mechanic of their own that is
 * not simulated (the key the UI explains it by). An item class missing from here and from
 * `IMPLEMENTED_ITEM_CLASSES` is not simulated at all and falls back to the class's stock weapon.
 */
export const ITEM_CLASS_MECHANICS: Readonly<Record<string, string>> = {
  tf_weapon_rocketlauncher_airstrike: 'airstrike',
  tf_weapon_handgun_scout_primary: 'shove',
  tf_weapon_sentry_revenge: 'revenge-crits',
  tf_weapon_charged_smg: 'crikey',
  tf_weapon_sniperrifle_decap: 'heads',
  tf_weapon_sniperrifle_classic: 'classic-charge',
  tf_weapon_katana: 'honorbound',
  tf_weapon_bat_wood: 'ball',
  tf_weapon_bat_giftwrap: 'ball',
  tf_weapon_stickbomb: 'caber',
  tf_weapon_robot_arm: 'gunslinger',
  tf_weapon_slap: 'slap',
  tf_weapon_sapper: 'sapper',
};

/**
 * Unlock scripts with a C++ class of their own (data/unlock-scripts.ts `ownClass`) that sim/weapons
 * implements (UNLOCK_WEAPON_FACTORIES; weapons/classes.test.ts keeps the two lists equal). An
 * own-class script missing from here is not simulated and its items fall back to the stock weapon.
 */
export const IMPLEMENTED_OWN_CLASSES: ReadonlySet<string> = new Set([
  'tf_weapon_compound_bow',
  'tf_weapon_crossbow',
  'tf_weapon_jar',
  'tf_weapon_jar_milk',
  'tf_weapon_cleaver',
  'tf_weapon_jar_gas',
  'tf_weapon_lunchbox',
  'tf_weapon_lunchbox_drink',
  'tf_weapon_flaregun',
  'tf_weapon_flaregun_revenge',
  'tf_weapon_raygun',
  'tf_weapon_drg_pomson',
  'tf_weapon_particle_cannon',
  'tf_weapon_buff_item',
  'tf_weapon_parachute_primary',
  'tf_weapon_parachute_secondary',
  'tf_weapon_cannon',
  'tf_weapon_rocketlauncher_fireball',
  'tf_weapon_laser_pointer',
  'tf_weapon_mechanical_arm',
  'tf_weapon_shotgun_building_rescue',
]);
