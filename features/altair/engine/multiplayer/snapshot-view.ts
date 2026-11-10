// =============================================================================
// ALTAIR MULTIPLAYER -- Snapshot -> renderable world
// =============================================================================
// The single-player renderer draws a `GameWorld`. A co-op client has no
// simulation, only decoded (and interpolated) snapshots, so this builds the
// GameWorld the renderer expects from one: entities are pooled by id (so their
// sprite animation state survives from frame to frame) and filled from the
// snapshot. The renderer is NOT forked; it also receives `players` markers for
// the teammates, name tags and rings (renderer.ts: RenderExtras).
//
// Client-only (sprite sheets, DOM images). Visual-only state (particles, damage
// numbers) is not reconstructed yet.
// =============================================================================

import type { GameWorld, EnemyEntity, ProjectileEntity, PickupEntity, PlayerEntity } from '../engine/types';
import { createGameWorld } from '../engine/game-loop';
import { updateEnemyAnimation, type PlayerMarker } from '../engine/renderer';
import { getPlayerSprites } from '../engine/sprites/sprite-defs';
import { pickDirectionalAnim, createAnimState, updateAnimation, type AnimationState } from '../engine/sprites/sprite-animator';
import { ENEMIES } from '../data/enemies';
import { BOSSES } from '../data/bosses';
import { PLAYER_ALIVE } from './types';
import type { DecodedSnapshot, DecodedPlayer } from './snapshot';

const ENEMY_RADIUS = new Map<string, number>(ENEMIES.map((e) => [e.id, e.radius]));
const BOSS_RADIUS = new Map<string, number>(BOSSES.map((b) => [b.id, 12 * b.size]));
const PLAYER_RADIUS = 12;
const CORPSE_SECONDS = 1.5;
/** A stationary projectile at least this big is a lingering pool (the wire format has no pool flag). */
const POOL_MIN_RADIUS = 30;

export interface RosterEntry {
  name: string;
  color: string;
}

export interface BossView {
  defId: string;
  name: string;
  title: string;
  hpFrac: number;
  color: string;
}

function rgb(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export class SnapshotView {
  readonly world: GameWorld;
  /** Markers for every player, in snapshot order (stable objects, reused every frame). */
  readonly markers: PlayerMarker[] = [];
  /** The newest applied snapshot's players, for the HUD. */
  players: DecodedPlayer[] = [];
  boss: BossView | null = null;
  sharedKills = 0;
  time = 0;

  private readonly enemyById = new Map<number, EnemyEntity>();
  private readonly projectileById = new Map<number, ProjectileEntity>();
  private readonly pickupById = new Map<number, PickupEntity>();
  private readonly markerById = new Map<string, PlayerMarker>();
  private readonly localEntity: PlayerEntity;
  private readonly prevPos = new Map<string, { x: number; y: number }>();
  private readonly prevEnemyHp = new Map<number, number>();
  private readonly deadSince = new Map<number, number>();
  private localPlayerId = '';
  private followId = '';

  constructor(width: number, height: number, localClassId: string) {
    this.world = createGameWorld(width, height, localClassId, false);
    this.localEntity = this.world.player;
  }

  setLocal(playerId: string, classId: string): void {
    this.localPlayerId = playerId;
    this.followId = playerId;
    this.world.classId = classId;
  }

  /** Whom the camera follows (the local player, or a teammate when spectating). */
  setFollow(playerId: string): void {
    this.followId = playerId;
  }

  get followedId(): string {
    return this.followId;
  }

  /** World position of the camera target, or null before the first snapshot. */
  followTarget(): { x: number; y: number } | null {
    const m = this.markerById.get(this.followId) ?? this.markerById.get(this.localPlayerId);
    return m ? { x: m.x, y: m.y } : null;
  }

  /**
   * Fill the world from `snap`. `dt` is the frame time in seconds (drives sprite
   * animation and corpse fade only; positions come straight from the snapshot).
   */
  apply(snap: DecodedSnapshot, roster: ReadonlyMap<string, RosterEntry>, dt: number): void {
    const world = this.world;
    world.time = snap.time;
    world.bossActive = snap.bossActive;
    world.bossWarning = snap.bossWarning;
    this.sharedKills = snap.sharedKills;
    this.time = snap.time;
    this.players = snap.players;

    this.applyPlayers(snap, roster, dt);
    this.applyEnemies(snap, dt);
    this.applyProjectiles(snap);
    this.applyPickups(snap);
  }

  private applyPlayers(snap: DecodedSnapshot, roster: ReadonlyMap<string, RosterEntry>, dt: number): void {
    const seen = new Set<string>();
    this.markers.length = 0;
    for (const p of snap.players) {
      seen.add(p.playerId);
      let m = this.markerById.get(p.playerId);
      if (!m) {
        m = {
          playerId: p.playerId,
          name: '',
          color: '#ffffff',
          classId: p.classId,
          x: p.x,
          y: p.y,
          radius: PLAYER_RADIUS,
          facingX: 1,
          facingY: 0,
          hp: p.hp,
          maxHp: p.maxHp,
          state: PLAYER_ALIVE,
          downTimer: 0,
          revive: 0,
          isLocal: p.playerId === this.localPlayerId,
        };
        this.markerById.set(p.playerId, m);
      }
      const r = roster.get(p.playerId);
      m.name = r?.name ?? p.playerId.slice(0, 6);
      m.color = r?.color ?? '#ffffff';
      m.classId = p.classId;
      m.isLocal = p.playerId === this.localPlayerId;
      m.x = p.x;
      m.y = p.y;
      m.facingX = p.facingX;
      m.facingY = p.facingY;
      m.hp = p.hp;
      m.maxHp = p.maxHp;
      m.state = p.state;
      m.downTimer = p.downTimer;
      m.revive = p.revive;

      // Walk / idle animation from how far the body moved since the last frame.
      const prev = this.prevPos.get(p.playerId);
      const moving = !!prev && dt > 0 && Math.hypot(p.x - prev.x, p.y - prev.y) / dt > 8;
      this.prevPos.set(p.playerId, { x: p.x, y: p.y });
      m.animState = this.animate(m.animState, p.classId, p.facingX, p.facingY, moving, dt);

      if (m.isLocal) {
        const e = this.localEntity;
        e.x = p.x;
        e.y = p.y;
        e.facingX = p.facingX || 1;
        e.facingY = p.facingY;
        e.hp = p.hp;
        e.maxHp = p.maxHp;
        e.iFrames = p.invuln ? 0.5 : 0;
        e.animState = m.animState;
        this.world.classId = p.classId;
      }
      this.markers.push(m);
    }
    for (const id of this.markerById.keys()) {
      if (!seen.has(id)) {
        this.markerById.delete(id);
        this.prevPos.delete(id);
      }
    }
  }

  private animate(
    state: AnimationState | undefined,
    classId: string,
    fx: number,
    fy: number,
    moving: boolean,
    dt: number,
  ): AnimationState | undefined {
    const sprites = getPlayerSprites(classId);
    if (!sprites) return state;
    const { animation } = pickDirectionalAnim(sprites, fx, fy, moving);
    if (!state || state.animation !== animation) state = createAnimState(animation);
    updateAnimation(state, dt);
    return state;
  }

  private applyEnemies(snap: DecodedSnapshot, dt: number): void {
    const out: EnemyEntity[] = [];
    const seen = new Set<number>();
    for (const d of snap.enemies) {
      seen.add(d.id);
      let e = this.enemyById.get(d.id);
      if (!e) {
        const radius = (d.isBoss ? BOSS_RADIUS.get(d.defId) : ENEMY_RADIUS.get(d.defId)) ?? 12;
        e = {
          id: d.id,
          x: d.x,
          y: d.y,
          radius,
          defId: d.defId,
          hp: d.hpFrac,
          maxHp: 1,
          damage: 0,
          speed: 0,
          xpDrop: 0,
          flashTimer: 0,
          aiState: 'chase',
          aiTimer: 0,
          aiTimer2: 0,
          aiParams: {},
          statusEffects: [],
          isBoss: d.isBoss,
          bossId: d.isBoss ? d.defId : undefined,
          armor: 0,
          intangible: false,
          canFly: false,
          opacity: 1,
          dashVx: 0,
          dashVy: 0,
          lastMoveVx: 0,
          lastMoveVy: 0,
          isDead: false,
          corpseTimer: 0,
        };
        this.enemyById.set(d.id, e);
      }
      if (dt > 0) {
        e.lastMoveVx = (d.x - e.x) / dt;
        e.lastMoveVy = (d.y - e.y) / dt;
      }
      const prevHp = this.prevEnemyHp.get(d.id);
      if (prevHp !== undefined && d.hpFrac < prevHp - 0.001) e.flashTimer = 0.08;
      else if (e.flashTimer > 0) e.flashTimer = Math.max(0, e.flashTimer - dt);
      this.prevEnemyHp.set(d.id, d.hpFrac);
      e.x = d.x;
      e.y = d.y;
      e.hp = d.hpFrac;
      e.isDead = d.isDead;
      if (d.isDead) {
        const since = this.deadSince.get(d.id) ?? snap.time;
        this.deadSince.set(d.id, since);
        e.corpseTimer = Math.max(0, CORPSE_SECONDS - (snap.time - since));
      }
      updateEnemyAnimation(e, dt);
      out.push(e);
    }
    for (const id of this.enemyById.keys()) {
      if (!seen.has(id)) {
        this.enemyById.delete(id);
        this.prevEnemyHp.delete(id);
        this.deadSince.delete(id);
      }
    }
    this.world.enemies = out;

    let boss: BossView | null = null;
    for (const d of snap.enemies) {
      if (d.isBoss && !d.isDead) {
        const def = BOSSES.find((b) => b.id === d.defId);
        if (def) boss = { defId: def.id, name: def.name, title: def.title, hpFrac: d.hpFrac, color: def.color };
        break;
      }
    }
    this.boss = boss;
  }

  private applyProjectiles(snap: DecodedSnapshot): void {
    const out: ProjectileEntity[] = [];
    const seen = new Set<number>();
    for (const d of snap.projectiles) {
      seen.add(d.id);
      let p = this.projectileById.get(d.id);
      if (!p) {
        p = {
          id: d.id,
          x: d.x,
          y: d.y,
          radius: d.radius,
          vx: d.vx,
          vy: d.vy,
          damage: 0,
          pierceLeft: 0,
          hitEnemyIds: new Set<number>(),
          lifetime: 1,
          isEnemy: d.isEnemy,
          color: rgb(d.color),
        };
        this.projectileById.set(d.id, p);
      }
      p.x = d.x;
      p.y = d.y;
      p.vx = d.vx;
      p.vy = d.vy;
      p.isEnemy = d.isEnemy;
      p.color = rgb(d.color);
      const pool = d.vx === 0 && d.vy === 0 && d.radius >= POOL_MIN_RADIUS;
      p.isPool = pool;
      if (pool) {
        p.poolRadius = d.radius;
        p.radius = d.radius;
        p.poolTimer = (p.poolTimer ?? 0) + 0.05;
      } else {
        p.radius = d.radius;
      }
      out.push(p);
    }
    for (const id of this.projectileById.keys()) if (!seen.has(id)) this.projectileById.delete(id);
    this.world.projectiles = out;
  }

  private applyPickups(snap: DecodedSnapshot): void {
    const out: PickupEntity[] = [];
    const seen = new Set<number>();
    for (const d of snap.pickups) {
      seen.add(d.id);
      let p = this.pickupById.get(d.id);
      if (!p) {
        p = { id: d.id, x: d.x, y: d.y, radius: 8, type: d.type as PickupEntity['type'], value: d.value, magnetized: false };
        this.pickupById.set(d.id, p);
      }
      p.x = d.x;
      p.y = d.y;
      p.value = d.value;
      out.push(p);
    }
    for (const id of this.pickupById.keys()) if (!seen.has(id)) this.pickupById.delete(id);
    this.world.pickups = out;
  }
}

/** The local player's own row of a snapshot, if present. */
export function findPlayer(snap: DecodedSnapshot | null, playerId: string): DecodedPlayer | undefined {
  return snap?.players.find((p) => p.playerId === playerId);
}
