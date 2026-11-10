// =============================================================================
// ALTAIR MULTIPLAYER -- Snapshot encode / decode / interpolate (pure)
// =============================================================================
// The host encodes its world into the compact GameStateSnapshot (types.ts) at
// 20 Hz; guests decode two of them and interpolate between them ~100 ms behind.
// No DOM, no engine imports beyond the id tables: runs in the hub tests too.
// =============================================================================

import {
  POS_Q,
  ENEMY_STRIDE,
  PROJECTILE_STRIDE,
  PICKUP_STRIDE,
  ENEMY_FLAG_BOSS,
  ENEMY_FLAG_DEAD,
  type GameStateSnapshot,
  type PlayerStateSnapshot,
} from './types';
import { ENEMIES } from '../data/enemies';
import { BOSSES } from '../data/bosses';
import { lerp } from '@/lib/core/math';

// ---- Id tables (identical on host and guest: same build, same data) ---------

/** Enemy and boss definition ids, in a stable order; the wire carries the index. */
export const DEF_IDS: readonly string[] = [...ENEMIES.map((e) => e.id), ...BOSSES.map((b) => b.id)];
const DEF_INDEX = new Map<string, number>(DEF_IDS.map((id, i) => [id, i]));

export const PICKUP_TYPES = [
  'xp_small',
  'xp_medium',
  'xp_large',
  'coin',
  'food',
  'magnet',
  'vacuum',
  'rosary',
  'chest',
  'clock',
  'shield_orb',
  'bomb',
] as const;
const PICKUP_INDEX = new Map<string, number>(PICKUP_TYPES.map((t, i) => [t, i]));

// ---- Interest management ----------------------------------------------------

/** Entities farther than this from every living player are not sent. */
export const INTEREST_RADIUS = 1100;
export const MAX_SNAPSHOT_ENEMIES = 300;
export const MAX_SNAPSHOT_PROJECTILES = 400;
export const MAX_SNAPSHOT_PICKUPS = 300;

// ---- Encode -----------------------------------------------------------------

/** What the encoder reads (the engine's entities satisfy these structurally). */
export interface SnapshotSource {
  tick: number;
  time: number;
  sharedKills: number;
  bossActive: boolean;
  bossWarning: { bossId: string; timer: number } | null;
  players: PlayerStateSnapshot[];
  enemies: ReadonlyArray<{
    id: number;
    defId: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    isBoss: boolean;
    isDead: boolean;
  }>;
  projectiles: ReadonlyArray<{
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    isEnemy: boolean;
    isPool?: boolean;
    poolRadius?: number;
    color: string;
  }>;
  pickups: ReadonlyArray<{ id: number; type: string; x: number; y: number; value: number }>;
}

export function quantise(v: number): number {
  return Math.round(v * POS_Q);
}

function parseRgb(color: string): number {
  // '#rrggbb' (the engine's only form); anything else renders white.
  if (color.length === 7 && color.charCodeAt(0) === 35) {
    const n = parseInt(color.slice(1), 16);
    if (n >= 0 && n <= 0xffffff) return n;
  }
  return 0xffffff;
}

/**
 * Encode `src`, keeping only entities within INTEREST_RADIUS of a point in
 * `near` (the living players; bosses are always kept). Pass the previous result
 * as `out` to reuse its arrays: socket.io serialises synchronously on emit, so
 * the host can recycle one snapshot object and allocate nothing per send.
 */
export function encodeSnapshot(
  src: SnapshotSource,
  near: ReadonlyArray<{ x: number; y: number }>,
  out?: GameStateSnapshot,
): GameStateSnapshot {
  const snap: GameStateSnapshot = out ?? {
    tick: 0,
    time: 0,
    sharedKills: 0,
    bossActive: false,
    bossWarning: null,
    players: [],
    enemies: [],
    projectiles: [],
    pickups: [],
  };
  snap.tick = src.tick;
  snap.time = Math.round(src.time * 100) / 100;
  snap.sharedKills = src.sharedKills;
  snap.bossActive = src.bossActive;
  snap.bossWarning = src.bossWarning;
  snap.players = src.players;
  snap.enemies.length = 0;
  snap.projectiles.length = 0;
  snap.pickups.length = 0;

  const r2 = INTEREST_RADIUS * INTEREST_RADIUS;
  const inRange = (x: number, y: number): boolean => {
    for (let i = 0; i < near.length; i++) {
      const dx = x - near[i].x;
      const dy = y - near[i].y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  };

  const en = snap.enemies;
  for (let i = 0; i < src.enemies.length && en.length < MAX_SNAPSHOT_ENEMIES * ENEMY_STRIDE; i++) {
    const e = src.enemies[i];
    if (!e.isBoss && !inRange(e.x, e.y)) continue;
    const di = DEF_INDEX.get(e.defId);
    if (di === undefined) continue;
    const frac = e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;
    en.push(
      e.id,
      di,
      quantise(e.x),
      quantise(e.y),
      Math.round(frac * 1000),
      (e.isBoss ? ENEMY_FLAG_BOSS : 0) | (e.isDead ? ENEMY_FLAG_DEAD : 0),
    );
  }

  const pr = snap.projectiles;
  for (let i = 0; i < src.projectiles.length && pr.length < MAX_SNAPSHOT_PROJECTILES * PROJECTILE_STRIDE; i++) {
    const p = src.projectiles[i];
    if (!inRange(p.x, p.y)) continue;
    const radius = Math.min(255, Math.round(p.isPool ? (p.poolRadius ?? p.radius) : p.radius));
    pr.push(
      p.id,
      quantise(p.x),
      quantise(p.y),
      Math.round(p.vx),
      Math.round(p.vy),
      (p.isEnemy ? 1 : 0) + 2 * radius + 512 * parseRgb(p.color),
    );
  }

  const pk = snap.pickups;
  for (let i = 0; i < src.pickups.length && pk.length < MAX_SNAPSHOT_PICKUPS * PICKUP_STRIDE; i++) {
    const p = src.pickups[i];
    if (!inRange(p.x, p.y)) continue;
    const ti = PICKUP_INDEX.get(p.type);
    if (ti === undefined) continue;
    pk.push(p.id, ti, quantise(p.x), quantise(p.y), Math.round(p.value));
  }
  return snap;
}

// ---- Decode -----------------------------------------------------------------

export interface DecodedPlayer {
  playerId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  facingX: number;
  facingY: number;
  state: 0 | 1 | 2;
  downTimer: number;
  revive: number; // 0..1
  invuln: boolean;
  classId: string;
  slot: number;
  level: number;
  kills: number;
  coins: number;
  levelUpPending: boolean;
}
export interface DecodedEnemy {
  id: number;
  defId: string;
  x: number;
  y: number;
  hpFrac: number; // 0..1
  isBoss: boolean;
  isDead: boolean;
}
export interface DecodedProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isEnemy: boolean;
  color: number; // 0xRRGGBB
}
export interface DecodedPickup {
  id: number;
  type: string;
  x: number;
  y: number;
  value: number;
}
export interface DecodedSnapshot {
  tick: number;
  time: number;
  sharedKills: number;
  bossActive: boolean;
  bossWarning: { bossId: string; timer: number } | null;
  players: DecodedPlayer[];
  enemies: DecodedEnemy[];
  projectiles: DecodedProjectile[];
  pickups: DecodedPickup[];
}

/** Validate-and-decode. Returns null for anything that is not a well-formed snapshot (guests trust nothing). */
export function decodeSnapshot(raw: unknown): DecodedSnapshot | null {
  const s = raw as Partial<GameStateSnapshot> | null;
  if (!s || typeof s !== 'object') return null;
  if (typeof s.tick !== 'number' || typeof s.time !== 'number' || !Array.isArray(s.players)) return null;
  if (!Array.isArray(s.enemies) || !Array.isArray(s.projectiles) || !Array.isArray(s.pickups)) return null;
  if (s.enemies.length % ENEMY_STRIDE || s.projectiles.length % PROJECTILE_STRIDE || s.pickups.length % PICKUP_STRIDE) {
    return null;
  }

  const players: DecodedPlayer[] = [];
  for (const p of s.players) {
    if (!p || typeof p.playerId !== 'string') return null;
    players.push({
      playerId: p.playerId,
      x: p.x / POS_Q,
      y: p.y / POS_Q,
      hp: p.hp,
      maxHp: p.maxHp,
      facingX: p.fx / 100,
      facingY: p.fy / 100,
      state: p.state,
      downTimer: p.downTimer,
      revive: p.revive / 100,
      invuln: p.invuln,
      classId: p.classId,
      slot: p.slot,
      level: p.level,
      kills: p.kills,
      coins: p.coins,
      levelUpPending: p.levelUpPending,
    });
  }

  const enemies: DecodedEnemy[] = [];
  for (let i = 0; i < s.enemies.length; i += ENEMY_STRIDE) {
    const defId = DEF_IDS[s.enemies[i + 1]];
    if (defId === undefined) continue;
    const flags = s.enemies[i + 5];
    enemies.push({
      id: s.enemies[i],
      defId,
      x: s.enemies[i + 2] / POS_Q,
      y: s.enemies[i + 3] / POS_Q,
      hpFrac: s.enemies[i + 4] / 1000,
      isBoss: (flags & ENEMY_FLAG_BOSS) !== 0,
      isDead: (flags & ENEMY_FLAG_DEAD) !== 0,
    });
  }

  const projectiles: DecodedProjectile[] = [];
  for (let i = 0; i < s.projectiles.length; i += PROJECTILE_STRIDE) {
    const meta = s.projectiles[i + 5];
    const rgb = Math.floor(meta / 512);
    const low = meta - rgb * 512;
    projectiles.push({
      id: s.projectiles[i],
      x: s.projectiles[i + 1] / POS_Q,
      y: s.projectiles[i + 2] / POS_Q,
      vx: s.projectiles[i + 3],
      vy: s.projectiles[i + 4],
      radius: Math.floor(low / 2),
      isEnemy: (low & 1) === 1,
      color: rgb,
    });
  }

  const pickups: DecodedPickup[] = [];
  for (let i = 0; i < s.pickups.length; i += PICKUP_STRIDE) {
    const type = PICKUP_TYPES[s.pickups[i + 1]];
    if (type === undefined) continue;
    pickups.push({
      id: s.pickups[i],
      type,
      x: s.pickups[i + 2] / POS_Q,
      y: s.pickups[i + 3] / POS_Q,
      value: s.pickups[i + 4],
    });
  }

  return {
    tick: s.tick,
    time: s.time,
    sharedKills: s.sharedKills ?? 0,
    bossActive: !!s.bossActive,
    bossWarning: s.bossWarning ?? null,
    players,
    enemies,
    projectiles,
    pickups,
  };
}

// ---- Interpolate ------------------------------------------------------------

/** alpha runs 0 (at `a`) .. 1 (at `b`) and may extrapolate up to this (one interval past `b`). */
export const MAX_ALPHA = 2;
/** A jump larger than this between snapshots is a teleport (revive, spawn), not motion: snap, don't glide. */
export const SNAP_DISTANCE = 400;

/**
 * Position of render time between two snapshot arrival times, clamped to
 * [0, MAX_ALPHA]. Degenerate spacing (equal/reversed times) returns 1: show `b`.
 */
export function snapshotAlpha(renderTime: number, aTime: number, bTime: number): number {
  const span = bTime - aTime;
  if (!(span > 0)) return 1;
  const alpha = (renderTime - aTime) / span;
  if (!(alpha >= 0)) return 0; // also catches NaN
  return alpha > MAX_ALPHA ? MAX_ALPHA : alpha;
}

function glide(from: { x: number; y: number }, to: { x: number; y: number }, alpha: number): [number, number] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx * dx + dy * dy > SNAP_DISTANCE * SNAP_DISTANCE) return [to.x, to.y];
  return [from.x + dx * alpha, from.y + dy * alpha];
}

/**
 * Blend two decoded snapshots for drawing. Entities present in both are
 * interpolated (extrapolated past `b` for alpha > 1); entities only in `b`
 * appear at their `b` position; entities only in `a` are gone. Discrete state
 * (hp, flags, class...) comes from `b`. With no `a`, `b` is returned as is.
 */
export function interpolateSnapshots(
  a: DecodedSnapshot | null,
  b: DecodedSnapshot,
  alphaIn: number,
): DecodedSnapshot {
  if (!a) return b;
  const alpha = !(alphaIn >= 0) ? 0 : alphaIn > MAX_ALPHA ? MAX_ALPHA : alphaIn;

  const pa = new Map<string, DecodedPlayer>();
  for (const p of a.players) pa.set(p.playerId, p);
  const players = b.players.map((p) => {
    const prev = pa.get(p.playerId);
    if (!prev) return p;
    const [x, y] = glide(prev, p, alpha);
    return { ...p, x, y };
  });

  const ea = new Map<number, DecodedEnemy>();
  for (const e of a.enemies) ea.set(e.id, e);
  const enemies = b.enemies.map((e) => {
    const prev = ea.get(e.id);
    if (!prev) return e;
    const [x, y] = glide(prev, e, alpha);
    return { ...e, x, y };
  });

  const pra = new Map<number, DecodedProjectile>();
  for (const p of a.projectiles) pra.set(p.id, p);
  const projectiles = b.projectiles.map((p) => {
    const prev = pra.get(p.id);
    if (!prev) return p;
    const [x, y] = glide(prev, p, alpha);
    return { ...p, x, y };
  });

  const pka = new Map<number, DecodedPickup>();
  for (const p of a.pickups) pka.set(p.id, p);
  const pickups = b.pickups.map((p) => {
    const prev = pka.get(p.id);
    if (!prev) return p;
    const [x, y] = glide(prev, p, alpha);
    return { ...p, x, y };
  });

  return {
    ...b,
    time: lerp(a.time, b.time, alpha),
    players,
    enemies,
    projectiles,
    pickups,
  };
}
