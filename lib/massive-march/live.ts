/**
 * Massive March — the hot world state, deliberately outside React.
 *
 * Positions arrive fifteen times a second for up to twelve players and forty
 * loose objects. Putting that through a store would re-render the entire scene
 * at tick rate, which is the one thing a 3D surface cannot afford; so the tick
 * writes here, into plain mutable objects, and the renderer reads it inside
 * `useFrame` where reading a field costs nothing.
 *
 * React still gets everything it should own — session, world state, chat,
 * reveals — through `store.ts`. The rule is simply: if it changes at tick rate,
 * it lives here; if it changes when something *happens*, it lives in the store.
 *
 * Smoothing is exponential rather than a proper interpolation buffer. A buffer
 * is the right answer for a shooter, where being 80ms behind is cheaper than
 * being wrong; here nobody is being shot at, the thing being smoothed is a
 * walking bird, and one alpha per frame with a snap threshold produces motion
 * nobody can distinguish from the real thing.
 */

import type { ItemKind } from './items';
import { ITEM_SLOTS, ITEM_SLOT_MASK, ITEM_SLOT_SHIFT } from './net/events';
import type { ItemTick, PlayerTick, TickFrame } from './net/events';

export interface LivePlayer {
  slot: number;
  /** Rendered position — chases the target. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Latest authoritative position. */
  tx: number;
  ty: number;
  tz: number;
  tyaw: number;
  tpitch: number;
  bits: number;
  gesture: number;
  gestureAt: number;
  /** Metres per second, measured from the target track — drives the walk cycle. */
  speed: number;
  lastAt: number;
  /** Cleared each tick and re-set for anyone present, so leavers can be culled. */
  seen: number;
}

export interface LiveItem {
  id: number;
  kind: ItemKind;
  label: string;
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  /** Slot of whoever is carrying it, or -1. */
  holder: number;
  /** Where the holder is keeping it. Meaningless when `holder` is -1. */
  where: (typeof ITEM_SLOTS)[number];
  lit: boolean;
  flying: boolean;
  seen: number;
}

export interface LiveSelf {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  bits: number;
  /** Ground height under the camera, cached by the controller. */
  ground: number;
}

export interface LiveWorld {
  players: Map<number, LivePlayer>;
  items: Map<number, LiveItem>;
  self: LiveSelf;
  selfSlot: number;
  /** Server `serverTime` of the most recent world snapshot, plus local drift. */
  dayFraction: number;
  dayAt: number;
  /** Milliseconds of in-game day per real millisecond. */
  dayRate: number;
  lastTickAt: number;
  /** Rough round-trip estimate, shown in the connection chip. */
  latency: number;
}

export const live: LiveWorld = {
  players: new Map(),
  items: new Map(),
  self: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bits: 0, ground: 0 },
  selfSlot: -1,
  dayFraction: 0.34,
  dayAt: 0,
  dayRate: 0,
  lastTickAt: 0,
  latency: 0,
};

/** Past this the avatar is teleported rather than slid — a cart ride, a rejoin. */
const SNAP_DISTANCE = 9;

export function applyTick(frame: TickFrame, itemKinds: Map<number, { kind: ItemKind; label: string }>): void {
  const now = performance.now();
  live.lastTickAt = now;

  for (const tick of frame.p) applyPlayer(tick, now);
  for (const tick of frame.i) applyItem(tick, itemKinds, now);

  for (const [slot, player] of live.players) {
    if (player.seen !== now) live.players.delete(slot);
  }
  for (const [id, item] of live.items) {
    if (item.seen !== now) live.items.delete(id);
  }
}

function applyPlayer(tick: PlayerTick, now: number): void {
  const [slot, x, y, z, yaw, pitch, bits, gesture] = tick;
  let player = live.players.get(slot);
  if (!player) {
    player = {
      slot,
      x,
      y,
      z,
      yaw,
      pitch,
      tx: x,
      ty: y,
      tz: z,
      tyaw: yaw,
      tpitch: pitch,
      bits,
      gesture,
      gestureAt: gesture ? now : 0,
      speed: 0,
      lastAt: now,
      seen: now,
    };
    live.players.set(slot, player);
    return;
  }

  const dt = Math.max(0.001, (now - player.lastAt) / 1000);
  player.speed = Math.hypot(x - player.tx, z - player.tz) / dt;
  player.lastAt = now;
  player.tx = x;
  player.ty = y;
  player.tz = z;
  player.tyaw = yaw;
  player.tpitch = pitch;
  player.bits = bits;
  if (gesture !== player.gesture) {
    player.gesture = gesture;
    player.gestureAt = now;
  }
  player.seen = now;

  if (Math.hypot(x - player.x, z - player.z) > SNAP_DISTANCE) {
    player.x = x;
    player.y = y;
    player.z = z;
  }
}

function applyItem(
  tick: ItemTick,
  kinds: Map<number, { kind: ItemKind; label: string }>,
  now: number,
): void {
  const [id, x, y, z, holder, bits] = tick;
  const meta = kinds.get(id);
  // An object whose descriptor has not arrived yet is skipped rather than drawn
  // as a mystery cube; the next world snapshot is at most five seconds away.
  if (!meta) return;

  let item = live.items.get(id);
  if (!item) {
    item = {
      id,
      kind: meta.kind,
      label: meta.label,
      x,
      y,
      z,
      tx: x,
      ty: y,
      tz: z,
      holder,
      where: ITEM_SLOTS[(bits >> ITEM_SLOT_SHIFT) & ITEM_SLOT_MASK],
      lit: (bits & 1) !== 0,
      flying: (bits & 4) !== 0,
      seen: now,
    };
    live.items.set(id, item);
    return;
  }

  item.kind = meta.kind;
  item.label = meta.label;
  item.tx = x;
  item.ty = y;
  item.tz = z;
  item.holder = holder;
  item.where = ITEM_SLOTS[(bits >> ITEM_SLOT_SHIFT) & ITEM_SLOT_MASK];
  item.lit = (bits & 1) !== 0;
  item.flying = (bits & 4) !== 0;
  item.seen = now;

  if (Math.hypot(x - item.x, z - item.z) > SNAP_DISTANCE) {
    item.x = x;
    item.y = y;
    item.z = z;
  }
}

function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * Chase every target. Called once per rendered frame.
 *
 * Frame-rate independent: the alpha is derived from the elapsed time rather
 * than being a constant, so a 144Hz monitor and a struggling laptop settle at
 * the same rate instead of one of them lagging visibly behind the other.
 */
export function smooth(dt: number): void {
  const alpha = 1 - Math.exp(-14 * dt);
  const angular = 1 - Math.exp(-11 * dt);

  for (const player of live.players.values()) {
    player.x += (player.tx - player.x) * alpha;
    player.y += (player.ty - player.y) * alpha;
    player.z += (player.tz - player.z) * alpha;
    player.yaw += shortestAngle(player.yaw, player.tyaw) * angular;
    player.pitch += (player.tpitch - player.pitch) * angular;
  }

  // Objects in flight chase harder: a thrown thing that lags is a thrown thing
  // that appears to land before it arrives.
  const itemAlpha = 1 - Math.exp(-22 * dt);
  for (const item of live.items.values()) {
    const a = item.flying ? itemAlpha : alpha;
    item.x += (item.tx - item.x) * a;
    item.y += (item.ty - item.y) * a;
    item.z += (item.tz - item.z) * a;
  }
}

/**
 * The time of day right now.
 *
 * Interpolated locally between world snapshots so the sun moves smoothly rather
 * than in five-second steps. `dayRate` is derived from consecutive snapshots, so
 * a paused world (nobody connected) correctly stops the sun.
 */
export function currentDayFraction(): number {
  if (live.dayRate === 0) return live.dayFraction;
  const elapsed = performance.now() - live.dayAt;
  return ((live.dayFraction + elapsed * live.dayRate) % 1 + 1) % 1;
}

export function noteDayFraction(fraction: number): void {
  const now = performance.now();
  if (live.dayAt > 0) {
    const elapsed = now - live.dayAt;
    let delta = fraction - live.dayFraction;
    if (delta < -0.5) delta += 1;
    // A rate derived from a single sample is noisy; blend toward it so a late
    // packet nudges the sun rather than jerking it.
    if (elapsed > 500 && delta >= 0 && delta < 0.2) {
      const observed = delta / elapsed;
      live.dayRate = live.dayRate === 0 ? observed : live.dayRate * 0.7 + observed * 0.3;
    }
  }
  live.dayFraction = fraction;
  live.dayAt = now;
}

export function resetLive(): void {
  live.players.clear();
  live.items.clear();
  live.selfSlot = -1;
  live.dayAt = 0;
  live.dayRate = 0;
  live.latency = 0;
}
