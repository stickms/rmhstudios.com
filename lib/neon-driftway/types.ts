export type GameState = 'menu' | 'levelSelect' | 'countdown' | 'playing' | 'paused' | 'gameOver' | 'levelComplete';

export type LevelId = 1 | 2 | 3;

export interface LevelConfig {
  id: LevelId;
  name: string;
  subtitle: string;
  lanes: number;
  roadWidthRatio: number;
  baseSpawnRate: number;
  maxSpawnRate: number;
  minTTI: number;
  closeCallRadiusMultiplier: number;
  hp: number;
  gripEnabled: boolean;
  headlightsEnabled: boolean;
  skyTop: string;
  skyBottom: string;
  roadColor: string;
  laneColor: string;
  guardrailColor: string;
}

export interface Car {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  speed: number;
  hp: number;
  maxHp: number;
  invincibleUntil: number;
  boostMeter: number;
}

export type ObstacleType =
  | 'cone'
  | 'barrier'
  | 'traffic_slow'
  | 'traffic_lane_change'
  | 'traffic_aggressive'
  | 'puddle'
  | 'hydro_strip'
  | 'debris'
  | 'boost_pad';

export type TrafficBehavior = 'keep_lane' | 'drift' | 'signal_and_change' | 'chase_bias' | 'weave';

export interface Obstacle {
  id: number;
  active: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  type: ObstacleType;
  lane: number;
  vx: number;
  vy: number;
  color: string;
  damage: number;
  behavior: TrafficBehavior;
  signaling: boolean;
  signalTimer: number;
  targetLane: number;
  closeCalled: boolean;
  isTraffic: boolean;
  gripPenalty: number;
  driftImpulse: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface Popup {
  text: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface RunStats {
  score: number;
  distance: number;
  timeSurvivedMs: number;
  maxSpeed: number;
  closeCalls: number;
  level: LevelId;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  boost: boolean;
  pause: boolean;
  restart: boolean;
}
