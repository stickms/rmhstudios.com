/**
 * Relic Run top-down engine types.
 */

export const ROOM_WIDTH = 640;
export const ROOM_HEIGHT = 480;
export const PLAYER_RADIUS = 16;
export const PLAYER_SPEED = 200;
export const MELEE_RANGE = 48;
export const MELEE_COOLDOWN = 0.4;
export const MELEE_DAMAGE = 25;
export const ENEMY_RADIUS = 14;
export const ENEMY_SPEED = 60;
export const ENEMY_HP = 30;
export const ENEMY_DAMAGE = 10;
export const ENEMY_CONTACT_COOLDOWN = 1;

export interface Vec2 {
  x: number;
  y: number;
}

export interface InputState {
  moveX: number;
  moveY: number;
  attack: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  facing: number; // angle in radians, 0 = right
  attackCooldown: number;
  health: number;
}

export interface EnemyState {
  id: number;
  x: number;
  y: number;
  health: number;
  contactCooldown: number;
}

export interface EngineState {
  roomCleared: boolean;
  player: PlayerState;
  enemies: EnemyState[];
  partyHealth: number; // from server; when player takes damage we reduce this
}
