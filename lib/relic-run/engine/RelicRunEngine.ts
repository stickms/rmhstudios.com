/**
 * Relic Run top-down game engine: room, player movement, melee combat, enemies.
 */

import type { InputState, PlayerState, EnemyState, EngineState } from './types';
import {
  ROOM_WIDTH,
  ROOM_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  MELEE_RANGE,
  MELEE_COOLDOWN,
  MELEE_DAMAGE,
  ENEMY_RADIUS,
  ENEMY_SPEED,
  ENEMY_HP,
  ENEMY_DAMAGE,
  ENEMY_CONTACT_COOLDOWN,
} from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

export class RelicRunEngine {
  state: EngineState;
  private nextEnemyId = 0;
  /** Set during update when player takes damage; read and clear by caller to sync with server. */
  lastDamageAmount = 0;
  private _lastDamageAmount = 0;

  constructor(partyHealth: number) {
    this.state = {
      roomCleared: false,
      player: {
        x: ROOM_WIDTH / 2,
        y: ROOM_HEIGHT / 2,
        facing: 0,
        attackCooldown: 0,
        health: partyHealth,
      },
      enemies: [],
      partyHealth,
    };
  }

  /** Call when entering a new room (room index from server). Spawns enemies. */
  startRoom(roomIndex: number): void {
    this.state.roomCleared = false;
    this.state.player.x = ROOM_WIDTH / 2;
    this.state.player.y = ROOM_HEIGHT / 2;
    this.state.player.attackCooldown = 0;
    this.state.player.health = this.state.partyHealth;

    const count = 2 + roomIndex + Math.floor(roomIndex * 0.5); // 2, 3, 4 ish per room
    this.state.enemies = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + roomIndex * 0.5;
      const distFromCenter = 120 + (i % 3) * 40;
      this.state.enemies.push({
        id: this.nextEnemyId++,
        x: ROOM_WIDTH / 2 + Math.cos(angle) * distFromCenter,
        y: ROOM_HEIGHT / 2 + Math.sin(angle) * distFromCenter,
        health: ENEMY_HP,
        contactCooldown: 0,
      });
    }
  }

  update(dt: number, input: InputState): void {
    this.lastDamageAmount = 0;
    this._lastDamageAmount = 0;
    if (this.state.roomCleared) return;

    const { player, enemies } = this.state;

    // Player movement
    const dx = input.moveX * PLAYER_SPEED * dt;
    const dy = input.moveY * PLAYER_SPEED * dt;
    player.x = clamp(player.x + dx, PLAYER_RADIUS, ROOM_WIDTH - PLAYER_RADIUS);
    player.y = clamp(player.y + dy, PLAYER_RADIUS, ROOM_HEIGHT - PLAYER_RADIUS);

    if (input.moveX !== 0 || input.moveY !== 0) {
      player.facing = Math.atan2(input.moveY, input.moveX);
    }

    // Attack cooldown
    if (player.attackCooldown > 0) {
      player.attackCooldown -= dt;
    }
    if (input.attack && player.attackCooldown <= 0) {
      player.attackCooldown = MELEE_COOLDOWN;
      const attackX = player.x + Math.cos(player.facing) * MELEE_RANGE;
      const attackY = player.y + Math.sin(player.facing) * MELEE_RANGE;
      for (const e of enemies) {
        if (e.health <= 0) continue;
        if (dist(player.x, player.y, e.x, e.y) <= MELEE_RANGE + ENEMY_RADIUS) {
          e.health -= MELEE_DAMAGE;
        }
      }
    }

    // Enemies: move toward player, contact damage
    for (const e of enemies) {
      if (e.health <= 0) continue;
      const d = dist(e.x, e.y, player.x, player.y);
      if (d < 1) continue;
      const vx = ((player.x - e.x) / d) * ENEMY_SPEED * dt;
      const vy = ((player.y - e.y) / d) * ENEMY_SPEED * dt;
      e.x = clamp(e.x + vx, ENEMY_RADIUS, ROOM_WIDTH - ENEMY_RADIUS);
      e.y = clamp(e.y + vy, ENEMY_RADIUS, ROOM_HEIGHT - ENEMY_RADIUS);

      if (e.contactCooldown > 0) {
        e.contactCooldown -= dt;
      } else if (dist(e.x, e.y, player.x, player.y) < PLAYER_RADIUS + ENEMY_RADIUS) {
        e.contactCooldown = ENEMY_CONTACT_COOLDOWN;
        player.health -= ENEMY_DAMAGE;
        this.state.partyHealth = player.health;
        this._lastDamageAmount = ENEMY_DAMAGE;
      }
    }

    this.lastDamageAmount = this._lastDamageAmount;

    // Remove dead enemies
    this.state.enemies = enemies.filter((e) => e.health > 0);
    if (this.state.enemies.length === 0) {
      this.state.roomCleared = true;
    }
  }

  getState(): Readonly<EngineState> {
    return this.state;
  }

  setPartyHealth(h: number): void {
    this.state.partyHealth = h;
    this.state.player.health = h;
  }
}
