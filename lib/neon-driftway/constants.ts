import type { LevelConfig, LevelId } from './types';

export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 540;

export const CAR_WIDTH = 36;
export const CAR_HEIGHT = 72;
export const CAR_Y = CANVAS_HEIGHT - 110;

// Physics
export const V_MIN = 80;
export const V_MAX_NORMAL = 700; // displays as 350 km/h
export const V_MAX_BOOST = 900; // displays as 450 km/h
export const ACCEL = 180;
export const COAST_DECEL = 60;
export const BRAKE_DECEL = 220;
export const STEER_MAX_SPEED = 400;
export const STEER_RESPONSIVENESS = 8;

export const BOOST_ACCEL = 300;
export const BOOST_DRAIN = 35;
export const BOOST_MAX = 100;
export const BOOST_PAD_VALUE = 40;

// Collision
export const HITBOX_INSET = 4;
export const CLOSE_CALL_BASE_RADIUS = 28;
export const INVINCIBILITY_MS = 600;

// Scoring
export const DISTANCE_MULTIPLIER = 0.5;
export const SPEED_BONUS_FACTOR = 0.3;
export const CLOSE_CALL_POINTS = 200;
export const STREAK_STEP = 0.15;
export const STREAK_CAP = 5;
export const STREAK_WINDOW_MS = 2000;

// Pools
export const MAX_OBSTACLES = 40;
export const MAX_PARTICLES = 120;

// Road geometry helpers
export function roadLeft(): number {
  return (CANVAS_WIDTH - CANVAS_WIDTH * 0.72) / 2;
}
export function roadRight(): number {
  return CANVAS_WIDTH - roadLeft();
}
export function roadWidth(): number {
  return roadRight() - roadLeft();
}
export function laneWidth(lanes: number): number {
  return roadWidth() / lanes;
}
export function laneCenter(lane: number, lanes: number): number {
  return roadLeft() + laneWidth(lanes) * (lane + 0.5);
}

// Level configs
export const LEVELS: Record<LevelId, LevelConfig> = {
  1: {
    id: 1,
    name: 'Sunset Freeway',
    subtitle: 'Clear skies, easy traffic',
    lanes: 5,
    roadWidthRatio: 0.72,
    baseSpawnRate: 0.6,
    maxSpawnRate: 1.4,
    minTTI: 1.1,
    closeCallRadiusMultiplier: 1.2,
    hp: 3,
    gripEnabled: false,
    headlightsEnabled: false,
    skyTop: '#ff7b00',
    skyBottom: '#2d1b4e',
    roadColor: '#333340',
    laneColor: 'rgba(255,255,255,0.6)',
    guardrailColor: '#888888',
  },
  2: {
    id: 2,
    name: 'Rainline',
    subtitle: 'Slippery roads, reduced grip',
    lanes: 5,
    roadWidthRatio: 0.72,
    baseSpawnRate: 0.8,
    maxSpawnRate: 1.7,
    minTTI: 0.9,
    closeCallRadiusMultiplier: 1.0,
    hp: 3,
    gripEnabled: true,
    headlightsEnabled: false,
    skyTop: '#0d0d1a',
    skyBottom: '#1a1a3e',
    roadColor: '#1e1e2e',
    laneColor: 'rgba(170,170,220,0.4)',
    guardrailColor: '#555566',
  },
  3: {
    id: 3,
    name: 'Night Circuit',
    subtitle: 'Low visibility, aggressive traffic',
    lanes: 5,
    roadWidthRatio: 0.72,
    baseSpawnRate: 1.0,
    maxSpawnRate: 2.1,
    minTTI: 0.75,
    closeCallRadiusMultiplier: 1.0,
    hp: 2,
    gripEnabled: false,
    headlightsEnabled: true,
    skyTop: '#050508',
    skyBottom: '#0a0a18',
    roadColor: '#0c0c14',
    laneColor: 'rgba(80,80,255,0.3)',
    guardrailColor: '#222244',
  },
};

// Level completion and unlock thresholds
export const LEVEL_COMPLETE_TIME_MS = 120_000;
export const LEVEL_2_UNLOCK_TIME_MS = LEVEL_COMPLETE_TIME_MS;
export const LEVEL_3_UNLOCK_TIME_MS = LEVEL_COMPLETE_TIME_MS;
