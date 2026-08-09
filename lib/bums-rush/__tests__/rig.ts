/**
 * The headless rig the three engine test files share.
 *
 * Everything here builds a `Level` inline rather than loading one from
 * `data/bums-rush/levels/` on purpose: these tests are about whether the
 * *physics* feels right, and a feel test that fails because someone moved a
 * crate in World 1 is a feel test nobody trusts. The fixtures are the smallest
 * geometry that can pose the question.
 *
 * One rig detail is load-bearing and easy to get wrong when writing a new
 * fixture. A character spawns with its arms hanging straight down, so its left
 * hand starts at `spawn + (-SHOULDER_OFFSET_X, ARM_SPAN)`. `anchorFor` puts a
 * small grabbable circle just to the *side* of that point — close enough to
 * latch on the first frame the grip is held, far enough that the head (r = 26)
 * clears it on the way past. Put the anchor directly under the hand instead and
 * the character lands on top of its own handhold and never hangs.
 */

import {
  DEFAULT_ASSISTS,
  DEFAULT_COSMETICS,
  PHYSICS,
} from '../constants';
import { createSimulation } from '../engine';
import type { SimulationOptions } from '../engine';
import type {
  Assists,
  GameEvent,
  GeometryPiece,
  InputFrame,
  Level,
  MaterialId,
  RenderSeat,
  SeatIndex,
  Simulation,
  Vec2,
} from '../types';

/** Where a spawned character's hand sits, relative to its head. */
export const ARM_SPAN = PHYSICS.SHOULDER_OFFSET_Y + PHYSICS.ARM_SEG_LENGTH * PHYSICS.ARM_SEGMENTS;
export const SHOULDER = PHYSICS.SHOULDER_OFFSET_X;
/** One character's weight in matter force units — the unit tensions are read in. */
export const BODY_WEIGHT =
  (PHYSICS.HEAD_MASS + PHYSICS.ARM_SEGMENTS * 2 * PHYSICS.ARM_SEG_MASS + 2 * PHYSICS.HAND_MASS) *
  PHYSICS.GRAVITY_Y *
  0.001;

export function makeLevel(over: Partial<Level> = {}): Level {
  return {
    version: 1,
    id: 'test-rig',
    world: 1,
    index: 1,
    name: 'rig.name',
    minPlayers: 1,
    maxPlayers: 4,
    parSeconds: 60,
    bounds: { x: -6000, y: -6000, w: 14000, h: 14000 },
    palette: { paper: '#f4ead6', ink: '#1e2430', accent: '#d1495b', flashSafe: true, contrastRatio: 12 },
    spawn: [{ x: 0, y: 0 }],
    // Parked far outside `bounds` so no fixture finishes by accident.
    goal: { shape: { kind: 'rect', x: 500000, y: 500000, w: 10, h: 10 }, requires: 'any' },
    checkpoints: [],
    geometry: [],
    props: [],
    hazards: [],
    objectives: [],
    decorations: [],
    assistBeams: [],
    music: 'none',
    ...over,
  };
}

/** A grabbable handhold positioned for the left hand of a character at `spawn`. */
export function anchorFor(spawn: Vec2, material: MaterialId = 'paper'): GeometryPiece {
  return {
    shape: { kind: 'circle', x: spawn.x - SHOULDER - 16, y: spawn.y + ARM_SPAN, r: 6 },
    material,
    render: 'drawn',
    grabbable: true,
  };
}

export function anchorPoint(spawn: Vec2): Vec2 {
  return { x: spawn.x - SHOULDER - 16, y: spawn.y + ARM_SPAN };
}

export function slab(x: number, y: number, w: number, h: number, grabbable = true): GeometryPiece {
  return { shape: { kind: 'rect', x, y, w, h }, material: 'paper', render: 'drawn', grabbable };
}

/**
 * Spawns for `n` players already in hand-to-hand range of each other: seat i's
 * left hand lands exactly on seat i-1's right hand, which is the only spacing
 * at which a chain can form on the first frame (GRAB_RADIUS is 18 px).
 */
export function chainSpawns(n: number, at: Vec2 = { x: 0, y: 0 }): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) out.push({ x: at.x + i * SHOULDER * 2, y: at.y });
  return out;
}

export function assists(over: Partial<Assists> = {}): Assists {
  return { ...DEFAULT_ASSISTS, ...over };
}

export function simFor(level: Level, seats: number, opts: SimulationOptions = {}): Simulation {
  return createSimulation(level, {
    seed: 1,
    ...opts,
    seats: Array.from({ length: seats }, (_, i) => ({
      seat: i as SeatIndex,
      cosmetics: DEFAULT_COSMETICS,
      assists: opts.seats?.[i]?.assists ?? assists(),
    })),
  });
}

export function input(
  seat: SeatIndex,
  frame: number,
  aimL: Vec2,
  aimR: Vec2,
  gripL: number,
  gripR: number,
  buttons = 0,
): InputFrame {
  return { seat, frame, aimL, aimR, gripL, gripR, buttons };
}

export function unit(x: number, y: number): Vec2 {
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m };
}

export interface RunResult {
  events: GameEvent[];
  /** Furthest each seat's head got, and its final state. */
  maxX: number[];
  minX: number[];
  maxHandX: number[];
  /** Peak grip tension seen on each seat's left hand — the chain's load. */
  maxTension: number[];
  deaths: number;
  seats: RenderSeat[];
}

/**
 * Drive a simulation for `steps` fixed ticks, asking `script` for each seat's
 * input every tick. The script sees the render state from the previous tick,
 * which is exactly what a real player sees.
 */
export function run(
  sim: Simulation,
  seats: number,
  steps: number,
  script: (seat: SeatIndex, step: number, view: RenderSeat, all: RenderSeat[]) => InputFrame,
): RunResult {
  const events: GameEvent[] = [];
  const maxX = new Array<number>(seats).fill(-Infinity);
  const minX = new Array<number>(seats).fill(Infinity);
  const maxHandX = new Array<number>(seats).fill(-Infinity);
  const maxTension = new Array<number>(seats).fill(0);
  let deaths = 0;
  const frames: InputFrame[] = [];

  for (let step = 0; step < steps; step++) {
    const view = sim.render(1);
    frames.length = 0;
    for (let i = 0; i < seats; i++) {
      const s = view.seats[i];
      if (!s) continue;
      frames.push(script(i as SeatIndex, step, s, view.seats));
    }
    sim.step(frames);
    const after = sim.render(1);
    for (let i = 0; i < seats; i++) {
      const s = after.seats[i];
      if (!s) continue;
      if (s.head.x > maxX[i]) maxX[i] = s.head.x;
      if (s.head.x < minX[i]) minX[i] = s.head.x;
      const hx = Math.max(s.armL[s.armL.length - 1].x, s.armR[s.armR.length - 1].x);
      if (hx > maxHandX[i]) maxHandX[i] = hx;
      if (s.tensionL > maxTension[i]) maxTension[i] = s.tensionL;
    }
    for (const e of sim.drainEvents()) {
      events.push(e);
      if (e.kind === 'death') deaths++;
    }
  }
  return { events, maxX, minX, maxHandX, maxTension, deaths, seats: sim.render(1).seats };
}

/**
 * The pump. Aiming a gripping arm along the head's own motion drives the body
 * further round the anchor, which is how a player builds a swing — and it is
 * the only input in these tests that has to be *played* rather than held.
 */
export function pumpAim(view: RenderSeat, anchor: Vec2, bias: number): Vec2 {
  const rx = view.head.x - anchor.x;
  const ry = view.head.y - anchor.y;
  const r = Math.hypot(rx, ry) || 1;
  // Tangent, in the direction the body is already travelling.
  const tx = -ry / r;
  const ty = rx / r;
  const sign = tx * bias >= 0 ? 1 : -1;
  return unit(tx * sign, ty * sign);
}
