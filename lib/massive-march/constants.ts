/**
 * Massive March — tuning constants shared by the browser and the socket hub.
 *
 * Deliberately free of any browser or Node import so the socket handler can
 * bundle it (see `server/CLAUDE.md` gotcha 7 — the server reaches this file by a
 * relative specifier, and anything it drags in has to survive esbuild's
 * `--packages=external`).
 *
 * Distances are metres, times are milliseconds, speeds are metres per second.
 * The island is sized so that crossing it on foot takes a couple of minutes:
 * long enough that travel is an event you plan for and talk through, short
 * enough that a browser can draw the whole of it.
 */

// ─── Session shape ──────────────────────────────────────────────────────────

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;

/**
 * World variants, named for the smallest crew they are authored around. The
 * host picks the one matching the group that will *reliably* show up; a larger
 * group in a smaller variant is fine, the reverse strands puzzles.
 */
export type WorldVariant = 'duo' | 'trio' | 'band';

export const WORLD_VARIANTS: readonly WorldVariant[] = ['duo', 'trio', 'band'];

/** Minimum crew each variant's puzzle layouts assume. */
export const VARIANT_MIN_CREW: Record<WorldVariant, number> = {
  duo: 2,
  trio: 3,
  band: 4,
};

export function isWorldVariant(value: unknown): value is WorldVariant {
  return typeof value === 'string' && (WORLD_VARIANTS as readonly string[]).includes(value);
}

// ─── Movement ───────────────────────────────────────────────────────────────

export const WALK_SPEED = 4.1;
export const RUN_SPEED = 7.4;
export const CROUCH_SPEED = 1.9;
/** Sitting on a slope steeper than this starts a slide, which is a whole toy. */
export const SLIDE_SLOPE = 0.34;
export const SLIDE_ACCEL = 11;
export const SLIDE_MAX_SPEED = 15;
export const GRAVITY = 22;
export const JUMP_VELOCITY = 7.1;
export const EYE_HEIGHT = 1.62;
export const CROUCH_EYE_HEIGHT = 0.95;
export const SIT_EYE_HEIGHT = 0.72;
/** Radius used for both player-vs-prop collision and "who is standing here". */
export const PLAYER_RADIUS = 0.42;

/**
 * The ceiling the server clamps reported movement to, as a multiple of the
 * fastest legitimate speed. Generous on purpose: this is desync insurance on a
 * co-op game with no adversary, not an anti-cheat arms race. It exists so one
 * player's broken frame timing cannot teleport them across a puzzle.
 */
export const MOVE_SPEED_TOLERANCE = 2.4;

// ─── Netcode ────────────────────────────────────────────────────────────────

/** Client → server position publish rate. */
export const MOVE_SEND_HZ = 15;
/** Server → client presence broadcast rate. */
export const TICK_HZ = 15;
export const TICK_MS = Math.round(1000 / TICK_HZ);
/** World state (clock, puzzles, unlocks) is slow — only sent when it changes. */
export const WORLD_HEARTBEAT_MS = 5_000;
/** How long a dropped socket keeps its avatar and its carried items. */
export const DISCONNECT_GRACE_MS = 45_000;
/** Idle sessions are reclaimed; the campaign save survives, the lobby does not. */
export const SESSION_IDLE_TIMEOUT_MS = 20 * 60_000;
export const MAX_SESSIONS = 500;

// ─── Communication ──────────────────────────────────────────────────────────

/** Beyond this you are inaudible; below `CLEAR_RANGE` you are perfectly clear. */
export const VOICE_CLEAR_RANGE = 9;
export const VOICE_RANGE = 34;
/** A megaphone trades subtlety for reach. */
export const MEGAPHONE_RANGE = 120;
/**
 * Radios ignore distance entirely but sound like radios, and only reach other
 * radios. Losing the group *and* the radio is the situation the flares are for.
 */
export const RADIO_RANGE = Infinity;
export const CHAT_MAX_LENGTH = 240;
export const CHAT_HISTORY = 80;
/** A whiteboard holds one short message and shows it to anyone who can see it. */
export const BOARD_MAX_LENGTH = 48;

// ─── World clock ────────────────────────────────────────────────────────────

/** One in-game day per 24 real minutes — long enough that dusk is a surprise. */
export const DAY_LENGTH_MS = 24 * 60_000;
/** Day fraction boundaries: 0 = midnight, 0.5 = noon. */
export const DAWN = 0.25;
export const DUSK = 0.79;

/** True when the world is dark enough that lights matter. */
export function isNight(dayFraction: number): boolean {
  return dayFraction < DAWN || dayFraction >= DUSK;
}

/** 0 at full dark, 1 at full daylight, smooth through dawn and dusk. */
export function daylight(dayFraction: number): number {
  const f = ((dayFraction % 1) + 1) % 1;
  if (f < DAWN - 0.06) return 0;
  if (f < DAWN + 0.06) return (f - (DAWN - 0.06)) / 0.12;
  if (f < DUSK - 0.06) return 1;
  if (f < DUSK + 0.06) return 1 - (f - (DUSK - 0.06)) / 0.12;
  return 0;
}

// ─── Progression ────────────────────────────────────────────────────────────

/**
 * The red rounded objects a finished puzzle produces. Nobody in the game ever
 * names them, which is the point — groups arrive at their own word.
 */
export const ORB_CARRY_LIMIT = 3;

export const ROOM_PREFIX = 'mm:room:';

export const MM_SETTINGS_KEY = 'mm:settings';
export const MM_CAMPAIGN_KEY = 'mm:campaign';
