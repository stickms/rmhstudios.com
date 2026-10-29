/**
 * SDK constants the stock weapons need that are hard-coded in the C++ (not in
 * the weapon scripts or the data module's HAND-MAINTAINED blocks), each with
 * the routine it comes from, plus the view-model activity ids the weapons
 * network so the renderer can play draw / idle / fire / reload sequences.
 *
 * Everything with a data-module equivalent is read from `data/` instead.
 */

import {
  DMG_BLAST,
  DMG_BULLET,
  DMG_HALF_FALLOFF,
  DMG_NOCLOSEDISTANCEMOD,
  DMG_PREVENT_PHYSICS_FORCE,
  DMG_USEDISTANCEMOD,
} from '../damage';

// ─── View-model activities ────────────────────────────────────────────────
/**
 * The base view-model activities a weapon sends (SendWeaponAnim). Networked
 * as an index into this list plus a sequence counter, so a predicting client
 * and the renderer replay the same animation. The renderer maps the name
 * through the item's `vmActivities` (data/weapons.ts STOCK_WEAPONS) to the
 * activity the arms model actually plays.
 */
export const VM_ACTIVITY_NAMES = [
  'ACT_VM_IDLE',
  'ACT_VM_DRAW',
  'ACT_VM_HOLSTER',
  'ACT_VM_PRIMARYATTACK',
  'ACT_VM_SECONDARYATTACK',
  'ACT_VM_RELOAD',
  'ACT_RELOAD_START',
  'ACT_RELOAD_FINISH',
  'ACT_VM_DRYFIRE',
  'ACT_VM_PULLBACK',
  'ACT_VM_HITCENTER',
  'ACT_VM_SWINGHARD',
  'ACT_BACKSTAB_VM_UP',
  'ACT_BACKSTAB_VM_DOWN',
  'ACT_BACKSTAB_VM_IDLE',
  'ACT_MP_ATTACK_STAND_PREFIRE',
  'ACT_MP_ATTACK_STAND_POSTFIRE',
  'ACT_VM_IDLE_LOWERED',
  'ACT_VM_HITLEFT',
  'ACT_VM_HITRIGHT',
  'ACT_VM_SWINGHARD_BROKEN',
  // Unlock item roles' own activities (sent by name: the Huntsman's draw, banners' horn …).
  'ACT_ITEM2_VM_CHARGE',
  'ACT_ITEM2_VM_IDLE_2',
  'ACT_ITEM2_VM_CHARGE_IDLE_3',
  'ACT_ITEM2_VM_DRYFIRE',
  'ACT_ITEM1_VM_PRIMARYATTACK',
  'ACT_ITEM1_VM_SECONDARYATTACK',
  'ACT_ITEM1_VM_IDLE',
  'ACT_VM_PRIMARYATTACK_3',
  'ACT_VM_RELOAD_2',
  'ACT_VM_SWINGHARD_2',
  'ACT_ITEM3_VM_PRIMARYATTACK',
  'ACT_VM_IDLE_2',
] as const;
export type VmActivityName = (typeof VM_ACTIVITY_NAMES)[number];

const actId = (name: VmActivityName): number => VM_ACTIVITY_NAMES.indexOf(name);
export const ACT = {
  VM_IDLE: actId('ACT_VM_IDLE'),
  VM_DRAW: actId('ACT_VM_DRAW'),
  VM_HOLSTER: actId('ACT_VM_HOLSTER'),
  VM_PRIMARYATTACK: actId('ACT_VM_PRIMARYATTACK'),
  VM_SECONDARYATTACK: actId('ACT_VM_SECONDARYATTACK'),
  VM_RELOAD: actId('ACT_VM_RELOAD'),
  RELOAD_START: actId('ACT_RELOAD_START'),
  RELOAD_FINISH: actId('ACT_RELOAD_FINISH'),
  VM_DRYFIRE: actId('ACT_VM_DRYFIRE'),
  VM_PULLBACK: actId('ACT_VM_PULLBACK'),
  VM_HITCENTER: actId('ACT_VM_HITCENTER'),
  VM_SWINGHARD: actId('ACT_VM_SWINGHARD'),
  BACKSTAB_VM_UP: actId('ACT_BACKSTAB_VM_UP'),
  BACKSTAB_VM_DOWN: actId('ACT_BACKSTAB_VM_DOWN'),
  BACKSTAB_VM_IDLE: actId('ACT_BACKSTAB_VM_IDLE'),
  MP_ATTACK_STAND_PREFIRE: actId('ACT_MP_ATTACK_STAND_PREFIRE'),
  MP_ATTACK_STAND_POSTFIRE: actId('ACT_MP_ATTACK_STAND_POSTFIRE'),
  VM_IDLE_LOWERED: actId('ACT_VM_IDLE_LOWERED'),
  VM_HITLEFT: actId('ACT_VM_HITLEFT'),
  VM_HITRIGHT: actId('ACT_VM_HITRIGHT'),
} as const;

/** The networked id of an activity name (ACT_VM_IDLE when unknown). */
export const vmActivityByName = (name: string): number => {
  const i = (VM_ACTIVITY_NAMES as readonly string[]).indexOf(name);
  return i >= 0 ? i : 0;
};

/** The activity name for a networked id ('' when out of range). */
export const vmActivityName = (id: number): string => VM_ACTIVITY_NAMES[id] ?? '';

// ─── Player animation events missing from the core's subset ───────────────
/** PlayerAnimEvent_t (multiplayer_animstate.h) — ATTACK_PRE / ATTACK_POST. */
export const PLAYERANIMEVENT_ATTACK_PRE = 23;
export const PLAYERANIMEVENT_ATTACK_POST = 24;

// ─── Weapon modes ──────────────────────────────────────────────────────────
export const TF_WEAPON_PRIMARY_MODE = 0;
export const TF_WEAPON_SECONDARY_MODE = 1;

/** CBaseCombatWeapon: seconds between empty-click sounds (HandleFireOnEmpty). */
export const EMPTY_SOUND_INTERVAL = 0.5;
/** CBaseCombatWeapon::SecondaryAttack / CTFWeaponBaseGun::SecondaryAttack lockout. */
export const DEFAULT_SECONDARY_DELAY = 0.5;
/** CTFWeaponBase::GetNextSecondaryAttackDelay: Demomen cycle +attack2 fast (sticky detonation). */
export const DEMOMAN_SECONDARY_DELAY = 0.1;
/** CBaseCombatWeapon::DefaultReload: a sequence-driven reload counts as done 0.2 s early (unused: script times). */
export const RELOAD_SEQUENCE_EARLY_FINISH = 0.2;

// ─── Projectiles' own damage types (g_aWeaponDamageTypes by projectile id) ─
/** TF_WEAPON_GRENADE_DEMOMAN (a Grenade Launcher pipe): no distance modifier at all. */
export const DMG_TYPE_PIPE = DMG_BLAST | DMG_HALF_FALLOFF;
/** TF_WEAPON_GRENADE_PIPEBOMB (a stickybomb). */
export const DMG_TYPE_STICKY = DMG_BLAST | DMG_HALF_FALLOFF | DMG_NOCLOSEDISTANCEMOD;
/** CTFGrenadePipebombProjectile::GetDamageType: stickies use the distance modifier for their first 5 s. */
export const STICKY_DISTANCE_MOD_TIME = 5.0;
/** TF_WEAPON_SYRINGEGUN_MEDIC (the syringe projectile's own type). */
export const DMG_TYPE_SYRINGE = DMG_BULLET | DMG_USEDISTANCEMOD | DMG_NOCLOSEDISTANCEMOD | DMG_PREVENT_PHYSICS_FORCE;

/** CTFWeaponBaseGrenadeProj::Spawn: first DetonateThink 0.2 s after spawn, then every 0.2 s. */
export const GRENADE_THINK_INTERVAL = 0.2;
/** CTFWeaponBaseGrenadeProj::Detonate: trace from 8 above the grenade 32 down for the scorch / normal. */
export const GRENADE_DETONATE_TRACE_UP = 8;
export const GRENADE_DETONATE_TRACE_DOWN = 32;
/** TF_GRENADE_DESTROYABLE_TIMER (tf_weaponbase_grenadeproj.h). */
export const GRENADE_DESTROYABLE_TIMER = 0.25;
/** tf_pipebomb_deflect_reset_time: an airblasted sticky returns to its owner's credit after this. */
export const PIPEBOMB_DEFLECT_RESET_TIME = 10.0;
/** tf_grenade_force_sleeptime: a sticky knocked loose may re-stick after this. */
export const GRENADE_FORCE_SLEEPTIME = 1.0;
/** Speed below which a bouncing pipe settles on a floor (ResolveFlyCollisionBounce's 30 u/s rule). */
export const GRENADE_REST_SPEED = 30;
/** Floor normal z above which a contact counts as ground (ResolveFlyCollisionBounce). */
export const GROUND_NORMAL_Z = 0.7;
/**
 * VPhysics impulse → velocity for a sticky knocked loose (VPhysicsTakeDamage). The engine
 * divides by the model's physics mass, which the clean-room sim does not load; this is the
 * approximate inverse mass that gives TF2's observed airblast-pushed sticky speed.
 */
export const STICKY_IMPULSE_TO_VELOCITY = 0.5;

/** CTFBaseProjectile::Spawn: syringe / nail hull ±1. */
export const NAIL_HALF_EXTENT = 1;

// ─── Melee ─────────────────────────────────────────────────────────────────
/** CTFWeaponBaseMelee::Swing: potential victims within 1.2 × swing range count for "clean miss". */
export const LOOSE_SWING_RANGE_MULT = 1.2;
/** CTFWrench::Smack: the building-hit trace reaches 70 units. */
export const WRENCH_BUILDING_RANGE = 70;

// ─── Minigun (CTFMinigun MinigunState_t, timers) ───────────────────────────
export const AC_STATE_IDLE = 0;
export const AC_STATE_STARTFIRING = 1;
export const AC_STATE_FIRING = 2;
export const AC_STATE_SPINNING = 3;
export const AC_STATE_DRYFIRE = 4;
/** SharedAttack: spun-up timers advance 0.1 s at a time; idle 0.2 s after a shot. */
export const MINIGUN_STATE_INTERVAL = 0.1;
export const MINIGUN_FIRE_IDLE = 0.2;
/** WindDown: idle 2 s after spinning down; WeaponIdle reschedules 12.5 s later. */
export const MINIGUN_WINDDOWN_IDLE = 2.0;
export const MINIGUN_IDLE_REPEAT = 12.5;

// ─── Sniper Rifle ──────────────────────────────────────────────────────────
/** CTFSniperRifle::Fire: unzoom 0.5 s after a zoomed shot, then rezoom after 0.9 s. */
export const SNIPER_UNZOOM_DELAY = 0.5;
export const SNIPER_REZOOM_DELAY = 0.9;
/** ZoomOutIn without auto-rezoom: secondary locked 1 s. */
export const SNIPER_NO_REZOOM_SECONDARY = 1.0;
/** CTFWeaponBaseGun::ToggleZoom: zoom animation lockout before Zoom() shortens it. */
export const TOGGLE_ZOOM_SECONDARY = 1.2;

// ─── Flamethrower (tf_weapon_flamethrower.cpp) ─────────────────────────────
export const FT_STATE_IDLE = 0;
export const FT_STATE_STARTFIRING = 1;
export const FT_STATE_FIRING = 2;
export const FT_STATE_SECONDARY = 3;
/** TF_FLAMETHROWER_AMMO_PER_SECOND_PRIMARY_ATTACK. */
export const FLAMETHROWER_AMMO_PER_SECOND = 14;
/** PrimaryAttack: FT_STATE_STARTFIRING lasts 0.16 s ("5 frames at 30 fps"); a burst lasts ≥ 0.2 s. */
export const FLAMETHROWER_START_FIRING_TIME = 0.16;
export const FLAMETHROWER_MIN_BURST_TIME = 0.2;
/** The third-person fire gesture repeats every 1.4 s. */
export const FLAMETHROWER_ATTACK_ANIM_INTERVAL = 1.4;
/** FireAirBlast: the burst effect resets after 0.05 s. */
export const AIRBLAST_EFFECT_RESET = 0.05;
/** tf_flamethrower_initial_afterburn_duration / tf_flamethrower_afterburn_rate. */
export const FLAMETHROWER_INITIAL_AFTERBURN = 3.0;
export const FLAMETHROWER_AFTERBURN_RATE = 0.4;
/** tf_airblast_cray_reflect_coeff / tf_airblast_cray_reflect_cost_coeff. */
export const AIRBLAST_REFLECT_COEFF = 2;
export const AIRBLAST_REFLECT_COST_COEFF = 0.5;
/** DeflectPlayer: view punch RandomInt(10, 15) on the pushed player. */
export const AIRBLAST_PUNCH_MIN = 10;
export const AIRBLAST_PUNCH_MAX = 15;
/** CTFWeaponBase::DeflectionForce(size, 90, 12) for stickies (DMG_SONIC × tf_grenade_forcefrom_bullet). */
export const DEFLECT_FORCE_DAMAGE = 90;
export const DEFLECT_FORCE_SCALE = 12;
/** CTFFlameManager: flames younger than 0.02 s add twice the heat. */
export const FLAME_NEW_HEAT_TIME = 0.02;
/** OnCollide: a flame from behind (dot > 0.8) can crit with the back-crit attribute (not stock). */
export const FLAME_BEHIND_DOT = 0.8;
/** OnCollide: a pyro igniting someone puts TF_COND_HEALING_DEBUFF on them for 2 s. */
export const FLAME_HEALING_DEBUFF_TIME = 2.0;
/** MAX_POINT_MANAGER_POINTS (tf_point_manager.h). */
export const MAX_FLAME_POINTS = 64;

// ─── Medi Gun (tf_weapon_medigun.cpp) ──────────────────────────────────────
/** MaintainTargetInSlot re-checks line of sight once a second. */
export const MEDIGUN_TARGET_CHECK_INTERVAL = 1.0;

// ─── Spy (tf_player_shared.cpp, tf_weapon_invis.cpp) ───────────────────────
/** ActivateInvisibilityWatch: cloaking needs more than 8 % meter. */
export const CLOAK_MIN_TO_START = 8.0;
/** SetNextStealthTime after cloaking (0.5 s) or a refused / decloak toggle (0.1 s). */
export const STEALTH_TOGGLE_DELAY = 0.5;
export const STEALTH_TOGGLE_DELAY_SHORT = 0.1;
/** CTFPlayer::RemoveInvisibility: an attack fades the cloak at 0.5 × the unstealth time. */
export const REMOVE_INVIS_FADE_SCALE = 0.5;
/** TF_SPY_STEALTH_BLINKTIME / TF_SPY_STEALTH_BLINKSCALE. */
export const SPY_STEALTH_BLINKTIME = 0.3;
export const SPY_STEALTH_BLINKSCALE = 0.85;
/** NoteLastDamageTime: damage above 5 makes a cloaked spy flicker. */
export const STEALTH_BLINK_DAMAGE = 5;
/** RemoveDisguise: TF_COND_DISGUISE_WEARINGOFF lasts 0.5 s. */
export const DISGUISE_WEAROFF_TIME = 0.5;
