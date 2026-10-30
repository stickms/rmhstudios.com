/**
 * Counter-Strike: Global Offensive's rules constants, clean-room from public documentation: the
 * Valve Developer Community's CS:GO cvar list and entity pages (VDC), the game's own published
 * defaults (`cvarlist` of a default server), and the community's well-known measurements
 * (Liquipedia's economy tables, the CS:GO wiki's weapon and equipment pages). No CS:GO source code
 * was used. Every number names where it comes from; numbers the weapon data carries (prices, damage,
 * speeds, inaccuracy, recoil) are read from `items_game` at run time instead (data/weapon-data.ts).
 *
 * Teams use the engine's numbers: 2 = Terrorists, 3 = Counter-Terrorists — the same as TF2's RED and
 * BLU (CS:GO's TEAM_TERRORIST / TEAM_CT are 2 / 3 too), so the shared spawn, nav and net code reads
 * them unchanged.
 */

import {
  TEAM_SPECTATOR,
  TEAM_UNASSIGNED,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
} from '../tf2-game/core/constants';

export const CS_TEAM_UNASSIGNED = TEAM_UNASSIGNED;
export const CS_TEAM_SPECTATOR = TEAM_SPECTATOR;
export const CS_TEAM_T = TF_TEAM_RED;
export const CS_TEAM_CT = TF_TEAM_BLUE;
export const otherCsTeam = (team: number): number =>
  team === CS_TEAM_T ? CS_TEAM_CT : team === CS_TEAM_CT ? CS_TEAM_T : team;
export const csTeamName = (team: number): 't' | 'ct' | 'spectator' | 'none' =>
  team === CS_TEAM_T
    ? 't'
    : team === CS_TEAM_CT
      ? 'ct'
      : team === CS_TEAM_SPECTATOR
        ? 'spectator'
        : 'none';

/**
 * The "class" a CS player has once on a team. The shared round rules count players with a class as
 * active (TF2 picks one); CS:GO has no classes, so every seated player carries this one.
 */
export const CS_PLAYER_CLASS = 1;

/** The two modes Dust II is played in here. */
export type CsMode = 'de' | 'dm';
export const CS_MODES: readonly CsMode[] = ['de', 'dm'];

// ─── Player (cs_shareddefs / VDC "Counter-Strike: Global Offensive Player") ─────────────────────

/** Spawn health (VDC: CS:GO players have 100 health). */
export const CS_MAX_HEALTH = 100;
/** Kevlar's armor value (CS:GO wiki "Kevlar Vest": 100 armor). */
export const CS_MAX_ARMOR = 100;

// ─── Round flow (VDC CS:GO cvar list, competitive defaults — gamemode_competitive.cfg) ──────────

/** mp_freezetime 15. */
export const MP_FREEZETIME = 15;
/** mp_roundtime_defuse 1.92 minutes (1:55). */
export const MP_ROUNDTIME = 1.92;
/** mp_buytime 20 seconds (competitive). */
export const MP_BUYTIME = 20;
/** mp_maxrounds 30 (MR15: teams switch sides after 15). */
export const MP_MAXROUNDS = 30;
/** mp_round_restart_delay 7. */
export const MP_ROUND_RESTART_DELAY = 7;
/** mp_c4timer 40. */
export const MP_C4TIMER = 40;
/** mp_friendlyfire 0 (casual-like default, as asked). */
export const MP_FRIENDLYFIRE = false;

// ─── Money (Liquipedia "Counter-Strike: Global Offensive/Economy", 2019+ values) ────────────────

/** mp_startmoney 800. */
export const MP_STARTMONEY = 800;
/** mp_maxmoney 16000. */
export const MP_MAXMONEY = 16000;
/** Elimination win (either side), and a Counter-Terrorist time win: $3250. */
export const CASH_WIN_ELIMINATION = 3250;
export const CASH_WIN_TIME = 3250;
/** Terrorists win by the bomb: $3500; Counter-Terrorists by a defuse: $3500. */
export const CASH_WIN_BOMB = 3500;
export const CASH_WIN_DEFUSE = 3500;
/** The loss bonus ladder: $1400 after the first loss, +$500 per further consecutive loss, at most $3400. */
export const LOSS_BONUS_BASE = 1400;
export const LOSS_BONUS_STEP = 500;
export const LOSS_BONUS_MAX = 3400;
/** Terrorists who lose a round in which the bomb was planted: +$800 each. */
export const CASH_LOSS_PLANTED = 800;
/** Planting the bomb: +$300 to the planter. Defusing: +$300 to the defuser. */
export const CASH_PLANT = 300;
export const CASH_DEFUSE = 300;
/** Killing a teammate: −$300 (and, here, no kill reward). */
export const CASH_TEAMKILL_PENALTY = -300;
/** A kill reward when the weapon data names none (most rifles and pistols): $300. */
export const DEFAULT_KILL_AWARD = 300;

// ─── The bomb (VDC func_bomb_target, info_map_parameters, mp_c4timer; CS:GO wiki "C4") ─────────

/**
 * Arming time. The user's specification and the community's measured plant (≈3.2 s from the plant
 * press to the bomb on the ground); planting is interrupted by moving off the spot or releasing.
 */
export const C4_ARM_TIME = 3.2;
/** Defusing: 10 s without a kit, 5 s with one (CS:GO wiki "Defuse kit"). */
export const C4_DEFUSE_TIME = 10;
export const C4_DEFUSE_TIME_KIT = 5;
/** How far a defuser may reach the bomb (community measurement of the use range: ≈ 62 units). */
export const C4_DEFUSE_RANGE = 62;
/** info_map_parameters' `bombradius` default (VDC: "default 500"). */
export const DEFAULT_BOMB_RADIUS = 500;
/**
 * The explosion: damage = bombradius, reach = 3.5 × bombradius (the community's measured lethal
 * range on default maps: 500 damage reaching ~1750 units).
 */
export const BOMB_RADIUS_SCALE = 3.5;
/** Beep interval: once a second at first, ten a second at the end (CS:GO wiki "C4": the beeps quicken). */
export const C4_BEEP_SLOW = 1.0;
export const C4_BEEP_FAST = 0.1;

// ─── Deathmatch (VDC CS:GO cvars; gamemode_deathmatch.cfg) ────────────────────────────────────

/** mp_timelimit 10 minutes. */
export const DM_TIMELIMIT_MINUTES = 10;
/** mp_respawn_immunitytime 2 seconds. */
export const DM_RESPAWN_IMMUNITY = 2;
/** Seconds from death to respawn (mp_respawn_on_death_*, the deathmatch default delay of ~2 s). */
export const DM_RESPAWN_DELAY = 2;

// ─── Win reasons (the round end panel; CS:GO's RoundEndReason names) ────────────────────────────

export const CS_WIN_TARGET_BOMBED = 1;
export const CS_WIN_BOMB_DEFUSED = 7;
export const CS_WIN_CTS_WIN = 8;
export const CS_WIN_TERRORISTS_WIN = 9;
export const CS_WIN_ROUND_DRAW = 10;
export const CS_WIN_TARGET_SAVED = 12;
export const CS_WIN_GAME_COMMENCE = 16;

// ─── Grenades (VDC cvars `ammo_grenade_limit_*`, `inferno_*`, `molotov_throw_detonate_time`) ───

/** ammo_grenade_limit_total 4. */
export const GRENADE_LIMIT_TOTAL = 4;
/** ammo_grenade_limit_flashbang 2; every other kind 1 (ammo_grenade_limit_default 1). */
export const GRENADE_LIMIT_FLASHBANG = 2;
export const GRENADE_LIMIT_DEFAULT = 1;
/** inferno_flame_lifetime 7 (seconds a molotov's fire burns). */
export const INFERNO_FLAME_LIFETIME = 7;
/** inferno_damage 40 (damage per second standing in the fire). */
export const INFERNO_DAMAGE = 40;
/** inferno_max_range 150 (how far the fire spreads from where it landed). */
export const INFERNO_MAX_RANGE = 150;
/** molotov_throw_detonate_time 2.0 (a molotov bursts in the air after this). */
export const MOLOTOV_DETONATE_TIME = 2.0;
/** The smoke cloud: ~18 s (CS:GO wiki "Smoke Grenade": 18 seconds) and ~144 units across its radius. */
export const SMOKE_DURATION = 18;
export const SMOKE_RADIUS = 144;
/** HE and flashbang fuses: 1.5 s (CS:GO wiki). */
export const GRENADE_FUSE = 1.5;
/** Decoy: fires its fake shots for ~15 s, then pops (CS:GO wiki "Decoy Grenade"). */
export const DECOY_DURATION = 15;
