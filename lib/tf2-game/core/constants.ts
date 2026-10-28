/**
 * Engine-wide constants for the TF2 simulation, with the SDK names they mirror
 * (Source SDK 2013: public/bspflags.h, game/shared/in_buttons.h,
 * game/shared/tf/tf_shareddefs.h, game/shared/tf/tf_gamerules.cpp). Per-class
 * and per-weapon numbers live in their own data modules, not here.
 */

/** Server tick: TF2 runs at 66.67 Hz (interval_per_tick 0.015). */
export const TICK_INTERVAL = 0.015;
export const TICK_RATE = 1 / TICK_INTERVAL;
export const timeToTicks = (t: number): number => Math.floor(0.5 + t / TICK_INTERVAL);
export const ticksToTime = (ticks: number): number => ticks * TICK_INTERVAL;

/** Metres per Source unit (1 unit = 1 inch), shared with the loadout viewer. */
export const SOURCE_UNIT_METRES = 0.01905;

// --- Convars at their TF2 defaults ---------------------------------------
export const SV_GRAVITY = 800;
export const SV_FRICTION = 4;
export const SV_STOPSPEED = 100;
export const SV_ACCELERATE = 10;
export const SV_AIRACCELERATE = 10;
export const SV_WATERACCELERATE = 10;
export const SV_WATERFRICTION = 1;
export const SV_MAXVELOCITY = 3500;
export const SV_STEPSIZE = 18;
export const SV_BOUNCE = 0;
export const SV_BACKSPEED = 0.6;
/** tf_max_charge_speed etc. live with their features. */

// --- Hulls (g_TFViewVectors) ----------------------------------------------
export const VEC_HULL_MIN = { x: -24, y: -24, z: 0 } as const;
export const VEC_HULL_MAX = { x: 24, y: 24, z: 82 } as const;
export const VEC_DUCK_HULL_MIN = { x: -24, y: -24, z: 0 } as const;
export const VEC_DUCK_HULL_MAX = { x: 24, y: 24, z: 62 } as const;
export const VEC_DUCK_VIEW_Z = 45;
export const VEC_OBS_HULL_MIN = { x: -10, y: -10, z: -10 } as const;
export const VEC_OBS_HULL_MAX = { x: 10, y: 10, z: 10 } as const;
export const TF_PLAYER_MAX_SAFE_FALL_SPEED = 650;

// --- Teams (tf_shareddefs.h) ------------------------------------------------
export const TEAM_UNASSIGNED = 0;
export const TEAM_SPECTATOR = 1;
export const TF_TEAM_RED = 2;
export const TF_TEAM_BLUE = 3;
export type TeamNum = 0 | 1 | 2 | 3;
export const enemyTeam = (team: number): number =>
  team === TF_TEAM_RED ? TF_TEAM_BLUE : team === TF_TEAM_BLUE ? TF_TEAM_RED : team;

// --- Classes (ETFClass order) -----------------------------------------------
export const TF_CLASS_UNDEFINED = 0;
export const TF_CLASS_SCOUT = 1;
export const TF_CLASS_SNIPER = 2;
export const TF_CLASS_SOLDIER = 3;
export const TF_CLASS_DEMOMAN = 4;
export const TF_CLASS_MEDIC = 5;
export const TF_CLASS_HEAVYWEAPONS = 6;
export const TF_CLASS_PYRO = 7;
export const TF_CLASS_SPY = 8;
export const TF_CLASS_ENGINEER = 9;
export const TF_CLASS_COUNT = 10;

/** Lower-case class names, indexed by ETFClass; matches the loadout catalog. */
export const CLASS_NAMES = [
  '',
  'scout',
  'sniper',
  'soldier',
  'demoman',
  'medic',
  'heavy',
  'pyro',
  'spy',
  'engineer',
] as const;
export type ClassName = Exclude<(typeof CLASS_NAMES)[number], ''>;
/** The class menu's order (1–9 keys), as in the game. */
export const CLASS_MENU_ORDER = [1, 3, 7, 4, 6, 9, 5, 2, 8] as const;

// --- Buttons (in_buttons.h) -------------------------------------------------
export const IN_ATTACK = 1 << 0;
export const IN_JUMP = 1 << 1;
export const IN_DUCK = 1 << 2;
export const IN_FORWARD = 1 << 3;
export const IN_BACK = 1 << 4;
export const IN_USE = 1 << 5;
export const IN_MOVELEFT = 1 << 9;
export const IN_MOVERIGHT = 1 << 10;
export const IN_ATTACK2 = 1 << 11;
export const IN_RELOAD = 1 << 13;
export const IN_SCORE = 1 << 16;
export const IN_SPEED = 1 << 17;
/** +attack3 (special attack, e.g. the Medic's call / Hype). */
export const IN_ATTACK3 = 1 << 25;

// --- Contents & masks (bspflags.h) -----------------------------------------
export const CONTENTS_EMPTY = 0;
export const CONTENTS_SOLID = 0x1;
export const CONTENTS_WINDOW = 0x2;
export const CONTENTS_AUX = 0x4;
export const CONTENTS_GRATE = 0x8;
export const CONTENTS_SLIME = 0x10;
export const CONTENTS_WATER = 0x20;
export const CONTENTS_BLOCKLOS = 0x40;
export const CONTENTS_OPAQUE = 0x80;
/** TF2 uses TEAM1/TEAM2 as "blocks RED" / "blocks BLUE" (respawn room visualizers). */
export const CONTENTS_TEAM1 = 0x800;
export const CONTENTS_TEAM2 = 0x1000;
export const CONTENTS_REDTEAM = CONTENTS_TEAM1;
export const CONTENTS_BLUETEAM = CONTENTS_TEAM2;
export const CONTENTS_IGNORE_NODRAW_OPAQUE = 0x2000;
export const CONTENTS_MOVEABLE = 0x4000;
export const CONTENTS_AREAPORTAL = 0x8000;
export const CONTENTS_PLAYERCLIP = 0x10000;
export const CONTENTS_MONSTERCLIP = 0x20000;
export const CONTENTS_ORIGIN = 0x1000000;
export const CONTENTS_MONSTER = 0x2000000;
export const CONTENTS_DEBRIS = 0x4000000;
export const CONTENTS_DETAIL = 0x8000000;
export const CONTENTS_TRANSLUCENT = 0x10000000;
export const CONTENTS_LADDER = 0x20000000;
export const CONTENTS_HITBOX = 0x40000000;

export const MASK_ALL = 0xffffffff;
export const MASK_SOLID =
  CONTENTS_SOLID | CONTENTS_MOVEABLE | CONTENTS_WINDOW | CONTENTS_MONSTER | CONTENTS_GRATE;
export const MASK_PLAYERSOLID = MASK_SOLID | CONTENTS_PLAYERCLIP;
export const MASK_NPCSOLID = MASK_SOLID | CONTENTS_MONSTERCLIP;
export const MASK_WATER = CONTENTS_WATER | CONTENTS_MOVEABLE | CONTENTS_SLIME;
export const MASK_OPAQUE = CONTENTS_SOLID | CONTENTS_MOVEABLE | CONTENTS_OPAQUE;
export const MASK_VISIBLE = MASK_OPAQUE | CONTENTS_IGNORE_NODRAW_OPAQUE;
export const MASK_BLOCKLOS = CONTENTS_SOLID | CONTENTS_MOVEABLE | CONTENTS_BLOCKLOS;
export const MASK_SHOT =
  CONTENTS_SOLID |
  CONTENTS_MOVEABLE |
  CONTENTS_MONSTER |
  CONTENTS_WINDOW |
  CONTENTS_DEBRIS |
  CONTENTS_HITBOX;
export const MASK_SHOT_HULL =
  CONTENTS_SOLID |
  CONTENTS_MOVEABLE |
  CONTENTS_MONSTER |
  CONTENTS_WINDOW |
  CONTENTS_DEBRIS |
  CONTENTS_GRATE;
export const MASK_SOLID_BRUSHONLY =
  CONTENTS_SOLID | CONTENTS_MOVEABLE | CONTENTS_WINDOW | CONTENTS_GRATE;
export const MASK_PLAYERSOLID_BRUSHONLY = MASK_SOLID_BRUSHONLY | CONTENTS_PLAYERCLIP;

// --- Surface flags (bspflags.h) ---------------------------------------------
export const SURF_LIGHT = 0x0001;
export const SURF_SKY2D = 0x0002;
export const SURF_SKY = 0x0004;
export const SURF_WARP = 0x0008;
export const SURF_TRANS = 0x0010;
export const SURF_TRIGGER = 0x0040;
export const SURF_NODRAW = 0x0080;
export const SURF_HINT = 0x0100;
export const SURF_SKIP = 0x0200;
export const SURF_NOLIGHT = 0x0400;
export const SURF_BUMPLIGHT = 0x0800;
export const SURF_HITBOX = 0x8000;

// --- Player flags (const.h FL_*) --------------------------------------------
export const FL_ONGROUND = 1 << 0;
export const FL_DUCKING = 1 << 1;
export const FL_WATERJUMP = 1 << 2;
export const FL_FROZEN = 1 << 5;
export const FL_INWATER = 1 << 9;
export const FL_GODMODE = 1 << 15;
export const FL_NOTARGET = 1 << 16;

/** Water levels (const.h WL_*). */
export const WL_NOTINWATER = 0;
export const WL_FEET = 1;
export const WL_WAIST = 2;
export const WL_EYES = 3;

/** Movement types used by the simulation (subset of MoveType_t). */
export const MOVETYPE_NONE = 0;
export const MOVETYPE_WALK = 2;
export const MOVETYPE_FLY = 4;
export const MOVETYPE_FLYGRAVITY = 5;
export const MOVETYPE_NOCLIP = 8;
export const MOVETYPE_OBSERVER = 10;
