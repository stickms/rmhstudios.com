/**
 * Neon Driftway — world constants.
 *
 * Lengths are **metres**, times **seconds**. Speed keeps the original engine
 * unit (km/h = speed × 0.5) so scoring, difficulty ramps and the shared
 * leaderboard stay on the same scale as before the 3D rewrite; multiply by
 * `MPS_PER_UNIT` to get real metres per second.
 */

import type { LevelConfig, LevelId } from './types';

// ── Unit system ─────────────────────────────────────────────────────────────

/** Engine speed unit → km/h (what the HUD shows). */
export const KMH_PER_UNIT = 0.5;
/** Engine speed unit → metres per second (what the world scrolls at). */
export const MPS_PER_UNIT = KMH_PER_UNIT / 3.6;
/**
 * One point of `RunStats.distance` in world metres. The scoring distance ticks
 * at `speed × 0.01` per second while the world moves at `speed × MPS_PER_UNIT`,
 * so ghosts placed from a distance delta need this conversion.
 */
export const METRES_PER_DISTANCE = MPS_PER_UNIT / 0.01;

// ── Road geometry ───────────────────────────────────────────────────────────

export const LANE_WIDTH = 4;
export const SHOULDER_WIDTH = 2.4;
export const GUARDRAIL_HEIGHT = 0.95;

export function roadWidth(lanes: number): number {
  return lanes * LANE_WIDTH;
}
export function roadHalf(lanes: number): number {
  return (lanes * LANE_WIDTH) / 2;
}
export function laneCenter(lane: number, lanes: number): number {
  return -roadHalf(lanes) + LANE_WIDTH * (lane + 0.5);
}
/** Which lane a lateral position falls in, clamped to the carriageway. */
export function laneAt(x: number, lanes: number): number {
  const lane = Math.floor((x + roadHalf(lanes)) / LANE_WIDTH);
  return lane < 0 ? 0 : lane > lanes - 1 ? lanes - 1 : lane;
}

// ── Player car ──────────────────────────────────────────────────────────────

export const CAR_WIDTH = 1.9;
export const CAR_LENGTH = 4.5;
export const CAR_HEIGHT = 1.32;
/** Driver's eye, relative to the car's origin (road surface, car centre). */
export const EYE_HEIGHT = 1.16;
export const EYE_X = -0.36;
export const EYE_Z = -0.3;
export const CAR_BODY_COLOR = '#00c8ff';

// ── Simulation band ─────────────────────────────────────────────────────────

/** Obstacles enter the world this far ahead… */
export const SPAWN_Z = 320;
/** …and are recycled once this far behind. */
export const DESPAWN_Z = -45;
/** Freshly spawned obstacles inside this band block a lane from re-spawning. */
export const SPAWN_GUARD_BAND = 70;

// ── Physics ─────────────────────────────────────────────────────────────────

export const V_MIN = 80; // 40 km/h
export const V_MAX_NORMAL = 700; // 350 km/h
export const V_MAX_BOOST = 900; // 450 km/h
export const ACCEL = 180;
export const COAST_DECEL = 60;
export const BRAKE_DECEL = 220;
/** Peak lateral speed, m/s — a full lane change takes about a third of a second. */
export const STEER_MAX_LATERAL = 13;
export const STEER_RESPONSIVENESS = 8;

export const BOOST_ACCEL = 300;
export const BOOST_DRAIN = 35;
export const BOOST_MAX = 100;
export const BOOST_PAD_VALUE = 40;

// ── Collision ───────────────────────────────────────────────────────────────

/** Shrinks the player's hull so clipping a corner is forgiving. */
export const HITBOX_INSET = 0.18;
/**
 * Gap between hulls, in metres, that still counts as a close call when an
 * obstacle passes the driver. Scaled per level by `closeCallRadiusMultiplier`.
 */
export const CLOSE_CALL_BASE_RADIUS = 0.9;
export const INVINCIBILITY_MS = 600;

// ── Scoring ─────────────────────────────────────────────────────────────────

export const DISTANCE_MULTIPLIER = 0.5;
export const SPEED_BONUS_FACTOR = 0.3;
export const CLOSE_CALL_POINTS = 200;
export const STREAK_STEP = 0.15;
export const STREAK_CAP = 5;
export const STREAK_WINDOW_MS = 2000;

// ── Pools ───────────────────────────────────────────────────────────────────

export const MAX_OBSTACLES = 40;
export const MAX_PARTICLES = 160;

// ── Levels ──────────────────────────────────────────────────────────────────

export const LEVELS: Record<LevelId, LevelConfig> = {
  1: {
    id: 1,
    name: 'Sunset Freeway',
    subtitle: 'Clear skies, easy traffic',
    lanes: 5,
    baseSpawnRate: 0.6,
    maxSpawnRate: 1.4,
    minTTI: 1.1,
    closeCallRadiusMultiplier: 1.2,
    hp: 3,
    gripEnabled: false,
    headlightsEnabled: false,
    visuals: {
      skyTop: '#54408c',
      skyBottom: '#e0789f',
      horizon: '#ff9ec4',
      sun: { color: '#fff3d0', size: 210, height: 0.055 },
      roadColor: '#4a4560',
      laneColor: '#ffffff',
      laneGlow: 0.55,
      shoulderColor: '#584c6b',
      guardrailColor: '#b8a6d8',
      fogColor: '#c76a9a',
      fogNear: 160,
      fogFar: 780,
      ambient: 0.8,
      keyLight: 1.0,
      keyColor: '#ffd3b0',
      roadside: 'sunset',
      accent: '#ff9ecb',
      accent2: '#8fe3ff',
      neon: 1.4,
      stars: false,
      rain: 0,
      wetness: 0.12,
    },
  },
  2: {
    id: 2,
    name: 'Rainline',
    subtitle: 'Slippery roads, reduced grip',
    lanes: 5,
    baseSpawnRate: 0.8,
    maxSpawnRate: 1.7,
    minTTI: 0.9,
    closeCallRadiusMultiplier: 1.0,
    hp: 3,
    gripEnabled: true,
    headlightsEnabled: false,
    visuals: {
      skyTop: '#2b3466',
      skyBottom: '#41508f',
      horizon: '#6b7fc9',
      sun: null,
      roadColor: '#3d4260',
      laneColor: '#e6efff',
      laneGlow: 1.2,
      shoulderColor: '#454a6b',
      guardrailColor: '#a9b8e0',
      fogColor: '#3a4576',
      fogNear: 90,
      fogFar: 520,
      ambient: 0.8,
      keyLight: 0.5,
      keyColor: '#a8bdf0',
      roadside: 'storm',
      accent: '#8fd8ff',
      accent2: '#ffa8d8',
      neon: 1.8,
      stars: false,
      rain: 1,
      wetness: 0.95,
    },
  },
  3: {
    id: 3,
    name: 'Night Circuit',
    subtitle: 'Low visibility, aggressive traffic',
    lanes: 5,
    baseSpawnRate: 1.0,
    maxSpawnRate: 2.1,
    minTTI: 0.75,
    closeCallRadiusMultiplier: 1.0,
    hp: 2,
    gripEnabled: false,
    headlightsEnabled: true,
    visuals: {
      skyTop: '#1b1450',
      skyBottom: '#2a1a63',
      horizon: '#5b2f96',
      sun: null,
      roadColor: '#373151',
      laneColor: '#c7ecff',
      laneGlow: 2.2,
      shoulderColor: '#2c2745',
      guardrailColor: '#6d5fa8',
      fogColor: '#241a52',
      fogNear: 70,
      fogFar: 430,
      ambient: 0.6,
      keyLight: 0.25,
      keyColor: '#8f7fd4',
      roadside: 'neon',
      accent: '#ff8fd0',
      accent2: '#7fe7ff',
      neon: 2.6,
      stars: true,
      rain: 0,
      wetness: 0.55,
    },
  },
};

// Level completion and unlock thresholds (distance-based in metres)
export const LEVEL_COMPLETE_DISTANCE = 1500;
export const LEVEL_2_UNLOCK_DISTANCE = LEVEL_COMPLETE_DISTANCE;
export const LEVEL_3_UNLOCK_DISTANCE = LEVEL_COMPLETE_DISTANCE;
