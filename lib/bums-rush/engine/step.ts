/**
 * The fixed-timestep loop and the `Simulation` implementation (§3.7).
 *
 * `Simulation.step` advances exactly one 1/60 s tick. The accumulator that
 * decides *how many* ticks a rendered frame owes is separate (`createAccumulator`)
 * and lives with the host loop, because the sim must never be able to see how
 * fast the display is: a 144 Hz monitor and a 30 fps phone have to simulate
 * identically or a chain that holds on a desktop tears on a handset.
 *
 * Two rules this file exists to keep:
 *
 * **The renderer never sees a body.** `render(alpha)` fills a reused
 * `RenderState` from two buffered snapshots of the actor transforms, so the
 * whole draw path is positions and flags. That seam is also what lets a guest
 * client feed interpolated network snapshots into the same renderer with no
 * engine present at all.
 *
 * **Nothing allocates in here.** Every vector, every array and both output
 * structures are created once and mutated. A GC pause in a physics game is
 * indistinguishable from input lag, and this is the loop that would cause it.
 * The returned `RenderState` and `Snapshot` are therefore *reused* — read them
 * before the next `step()`, never retain them.
 */

import Matter from 'matter-js';
import { ASSIST, NET, RENDER } from '../constants';
import type {
  Assists,
  Cosmetics,
  GameEvent,
  InputFrame,
  Level,
  RenderProp,
  RenderSeat,
  RenderState,
  RoomMode,
  SeatIndex,
  Simulation,
  Snapshot,
  SnapshotProp,
  SnapshotSeat,
  Vec2,
} from '../types';
import { InputButton, SnapshotFlag } from '../types';
import {
  applyAim,
  armPolyline,
  createCharacter,
  deriveSquash,
  destroyCharacter,
  noteImpact,
  relaxArms,
  clampActorSpeed,
  smoothAim,
  trackAcceleration,
  type Character,
} from './character';
import {
  createAssist,
  noteBeamGrab,
  noteCheckpoint,
  noteWipe,
  summonDrone,
  trackStranded,
  updateAssist,
  type AssistContext,
  type AssistState,
} from './assist';
import {
  createCamera,
  snapCamera,
  updateCamera,
  type Camera,
  type CameraSeat,
} from './camera';
import {
  attachGrip,
  createGrabState,
  detachGrip,
  gripFor,
  limitGrip,
  queryGrab,
  recordHistory,
  sampleHistory,
  trackSwingPeak,
  updateGrips,
  type GrabContext,
  type GrabHit,
  type GrabState,
  type Transform,
} from './grab';
import {
  armCrumble,
  createHazards,
  hazardKills,
  outOfBounds,
  resetHazardGrace,
  updateHazards,
  type HazardContext,
  type HazardRuntime,
} from './hazards';
import {
  chainSize,
  createObjectives,
  goalReached,
  scoreOnFinish,
  sweepRelics,
  takePhoto,
  updateObjectives,
  type ObjectiveContext,
  type ObjectiveState,
} from './objectives';
import {
  armFallingPlatform,
  createProps,
  dropProp,
  firePopCannon,
  propAt,
  sweepPickups,
  updateProps,
  activateProp,
  type PropContext,
  type PropRuntime,
} from './props';
import { createRng, hashSeed, type Rng } from './rng';
import { createSignalBus, type SignalBus } from './signals';
import { DT, ENGINE, P } from './tuning';
import { assertBodyBudget, createPhysWorld, FILTERS, teleport, type PhysWorld } from './world';

const { Engine } = Matter;

const ARM_NODES = P.ARM_SEGMENTS + 1;

export interface SimulationOptions {
  seed?: number;
  mode?: RoomMode;
  /** Showdown rules: the PvP grip cap and respawn invulnerability (§8.3). */
  pvp?: boolean;
  /** Tighter camera framing when there is nobody to frame with (§5). */
  solo?: boolean;
  reducedMotion?: boolean;
  catAfterWipes?: 0 | 3 | 6;
  viewport?: { width: number; height: number };
  seats?: { seat: SeatIndex; cosmetics: Cosmetics; assists: Assists }[];
}

/**
 * The accumulator (§3.7). Clamped to `MAX_SUBSTEPS` so a backgrounded tab that
 * comes back owing four seconds of simulation drops the debt instead of
 * spiralling through it and freezing the page.
 */
export interface Accumulator {
  /** Feed real elapsed ms; returns how many fixed steps to run now. */
  advance(elapsedMs: number): number;
  /** 0..1 between the last step and the next — pass to `render`. */
  readonly alpha: number;
  reset(): void;
}

export function createAccumulator(): Accumulator {
  let acc = 0;
  const api = {
    advance(elapsedMs: number): number {
      acc += Math.max(0, elapsedMs);
      let steps = 0;
      while (acc >= P.FIXED_DT_MS && steps < P.MAX_SUBSTEPS) {
        acc -= P.FIXED_DT_MS;
        steps++;
      }
      if (acc > P.FIXED_DT_MS * P.MAX_SUBSTEPS) acc = 0;
      return steps;
    },
    get alpha(): number {
      return acc / P.FIXED_DT_MS;
    },
    reset(): void {
      acc = 0;
    },
  };
  return api;
}

interface PairLike {
  isActive: boolean;
  bodyA: Matter.Body;
  bodyB: Matter.Body;
  collision: { normal: Vec2 };
}
interface PairsLike {
  list: PairLike[];
  collisionStart: PairLike[];
}

/** `BodyMeta.seat` carries -1 for anything that is not an actor part. */
function isSeat(n: SeatIndex | -1): n is SeatIndex {
  return n >= 0;
}

interface SeatTransform {
  headX: number;
  headY: number;
  headAngle: number;
  scaleX: number;
  scaleY: number;
  arms: [Vec2[], Vec2[]];
}

function blankTransform(): SeatTransform {
  const mk = (): Vec2[] => {
    const a: Vec2[] = [];
    for (let i = 0; i < ARM_NODES; i++) a.push({ x: 0, y: 0 });
    return a;
  };
  return { headX: 0, headY: 0, headAngle: 0, scaleX: 1, scaleY: 1, arms: [mk(), mk()] };
}

export function createSimulation(level: Level, opts: SimulationOptions = {}): Simulation {
  const rng: Rng = createRng(opts.seed ?? hashSeed(level.id));
  const world: PhysWorld = createPhysWorld(level);
  const signals: SignalBus = createSignalBus();
  const props: PropRuntime[] = createProps(world, level.props, signals);
  const hazards: HazardRuntime[] = createHazards(world, level.hazards);
  const assist: AssistState = createAssist(world, level, opts.catAfterWipes ?? ASSIST.CAT_WIPES_DEFAULT);
  const objectives: ObjectiveState = createObjectives(level.objectives);
  const camera: Camera = createCamera(level, {
    solo: opts.solo,
    reducedMotion: opts.reducedMotion,
    viewW: opts.viewport?.width,
    viewH: opts.viewport?.height,
  });

  assertBodyBudget(world, NET.MAX_SEATS);

  const characters: (Character | null)[] = [null, null, null, null];
  // History slots must cover the actor bodies that do not exist yet: each seat
  // adds a head, eight arm segments and two hands to `world.tracked`.
  const grab: GrabState = createGrabState(
    world.tracked.length + NET.MAX_SEATS * (1 + P.ARM_SEGMENTS * 2 + 2),
  );
  const pvp = opts.pvp === true;

  let frame = 0;
  let elapsedMs = 0;
  let checkpointIndex = 0;
  let deaths = 0;
  let finished = false;
  let extraCheckpoints = false;

  // Double-buffered so `drainEvents` never allocates.
  let events: GameEvent[] = [];
  let eventsSpare: GameEvent[] = [];

  const splats: { at: Vec2; sprite: number; angle: number; seat: SeatIndex }[] = [];
  const prevT: SeatTransform[] = [blankTransform(), blankTransform(), blankTransform(), blankTransform()];
  const currT: SeatTransform[] = [blankTransform(), blankTransform(), blankTransform(), blankTransform()];

  const lastInputFrame = new Int32Array(NET.MAX_SEATS).fill(-1);
  const gripHeld: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  const gripWas: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  const buttonsWas = new Int32Array(NET.MAX_SEATS);
  const grounded: boolean[] = [false, false, false, false];
  const deadForMs = new Float64Array(NET.MAX_SEATS);
  const reaching: boolean[] = [false, false, false, false, false, false, false, false];

  const hit: GrabHit = { body: null, meta: null, priority: -1, x: 0, y: 0, dist: Infinity };
  const rewind: Transform = { x: 0, y: 0, angle: 0 };
  const scale: Vec2 = { x: 1, y: 1 };
  const chainLinks: [SeatIndex, SeatIndex][] = [];
  const relicsAtGoal = new Set<string>();
  const recipesDone = new Set<string>();

  const grabCtx: GrabContext = { world, characters, nowMs: 0, pvp, rewindFrame: -1 };
  const emit = (e: GameEvent): void => {
    events.push(e);
  };
  const propCtx: PropContext = { world, characters, signals, nowMs: 0, rng, emit };
  const hazardCtx: HazardContext = { world, characters, nowMs: 0 };
  const checkpointAt: Vec2 = { x: level.spawn[0]?.x ?? 0, y: level.spawn[0]?.y ?? 0 };
  const assistCtx: AssistContext = { world, characters, nowMs: 0, checkpoint: checkpointAt };
  const objCtx: ObjectiveContext = {
    characters,
    props,
    camera,
    goal: level.goal.shape,
    grounded,
    chainSize: 1,
    elapsedMs: 0,
    parSeconds: level.parSeconds,
    deaths: 0,
    assisted: false,
    relicsAtGoal,
    recipesDone,
    emit: (id) => emit({ kind: 'objective', objectiveId: id }),
  };

  const cameraSeats: CameraSeat[] = [0, 1, 2, 3].map((i) => ({
    seat: i as SeatIndex,
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    deadForMs: 0,
  }));

  // ─── Reused outputs ───────────────────────────────────────────────────────

  const renderSeats: RenderSeat[] = [0, 1, 2, 3].map((i) => ({
    seat: i as SeatIndex,
    state: 'alive',
    cosmetics: { head: '', hat: null, gloves: '', ink: '' },
    head: { x: 0, y: 0 },
    headAngle: 0,
    scaleX: 1,
    scaleY: 1,
    armL: Array.from({ length: ARM_NODES }, () => ({ x: 0, y: 0 })),
    armR: Array.from({ length: ARM_NODES }, () => ({ x: 0, y: 0 })),
    gripL: false,
    gripR: false,
    tensionL: 0,
    tensionR: 0,
    reachingL: false,
    reachingR: false,
    carrying: null,
  }));
  const renderProps: RenderProp[] = props.map((rt) => ({
    id: rt.prop.id,
    kind: rt.kind,
    at: { x: rt.prop.at.x, y: rt.prop.at.y },
    angle: 0,
    active: false,
    progress: 0,
  }));
  const renderHazards = hazards.map((rt) => ({ id: rt.hazard.id, active: rt.active, progress: 0 }));
  const renderState: RenderState = {
    seats: [],
    props: renderProps,
    hazards: renderHazards,
    splats,
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
    frame: 0,
    elapsedMs: 0,
    checkpointIndex: 0,
    catActive: false,
  };

  const snapSeats: SnapshotSeat[] = [0, 1, 2, 3].map((i) => ({
    seat: i as SeatIndex,
    state: 'alive',
    head: { x: 0, y: 0 },
    headV: { x: 0, y: 0 },
    headAngle: 0,
    handL: { x: 0, y: 0 },
    handR: { x: 0, y: 0 },
    gripL: 0,
    gripR: 0,
    gripTargetL: 0,
    gripTargetR: 0,
  }));
  const snapProps: SnapshotProp[] = props.map((_, i) => ({ id: i, x: 0, y: 0, angle: 0 }));
  const lastSentProp = new Float64Array(props.length * 3);
  const snapshotOut: Snapshot = { frame: 0, flags: 0, seats: [], props: [] };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function activeCheckpoint(index: number, out: Vec2): void {
    let seen = -1;
    for (const cp of level.checkpoints) {
      if (cp.optional && !extraCheckpoints) continue;
      seen++;
      if (seen === index) {
        out.x = cp.at.x;
        out.y = cp.at.y;
        return;
      }
    }
    out.x = level.spawn[0]?.x ?? 0;
    out.y = level.spawn[0]?.y ?? 0;
  }

  function effectiveGrabRadius(ch: Character): number {
    return ch.assists.grabAssist ? P.GRAB_RADIUS_ASSIST : P.GRAB_RADIUS;
  }

  function gripScaleFor(ch: Character, analog: number): number {
    if (!ch.assists.analogTriggers) return analog > 0.5 ? 1 : 0;
    if (analog < P.TRIGGER_GRIP_FLOOR) return 0;
    const t = (analog - P.TRIGGER_GRIP_FLOOR) / (1 - P.TRIGGER_GRIP_FLOOR);
    return P.TRIGGER_GRIP_MIN_SCALE + (1 - P.TRIGGER_GRIP_MIN_SCALE) * t;
  }

  function tryGrab(ch: Character, hand: 'l' | 'r', atFrame: number, gripScale: number): void {
    const arm = hand === 'l' ? ch.arms[0] : ch.arms[1];
    let hx = arm.hand.position.x;
    let hy = arm.hand.position.y;
    grabCtx.rewindFrame = -1;
    if (atFrame >= 0 && atFrame < frame) {
      const meta = world.meta.get(arm.hand.id);
      if (meta && meta.histIndex >= 0 && sampleHistory(grab.history, atFrame, meta.histIndex, rewind)) {
        hx = rewind.x;
        hy = rewind.y;
        grabCtx.rewindFrame = atFrame;
      }
    }
    if (queryGrab(grabCtx, grab, ch.seat, hx, hy, effectiveGrabRadius(ch), hit)) {
      attachGrip(grabCtx, grab, ch, hand, hit, gripScale);
      const meta = hit.meta;
      if (meta) {
        noteBeamGrab(assist, meta.refId);
        if (meta.refId) {
          armFallingPlatform(props, meta.refId);
          armCrumble(hazards, meta.refId);
        }
      }
      emit({ kind: 'grip', seat: ch.seat, hand, on: true });
    }
    grabCtx.rewindFrame = -1;
  }

  function killSeat(ch: Character, cause: 'bounds' | 'hazard' | 'impact'): void {
    if (ch.state === 'dead' || ch.state === 'respawning') return;
    for (const hand of ['l', 'r'] as const) detachGrip(grabCtx, grab, gripFor(grab, ch.seat, hand), false);
    ch.state = 'dead';
    ch.deaths++;
    deaths++;
    ch.respawnAtMs = elapsedMs + P.RESPAWN_DELAY_MS;
    deadForMs[ch.seat] = 0;
    emit({ kind: 'death', seat: ch.seat, at: { x: ch.head.position.x, y: ch.head.position.y }, cause });
    // Splats persist for the whole attempt: after a few failed tries a hard
    // section is visibly covered in the marks of your failures, which is both
    // the joke and free telemetry for the player (§2.7).
    if (splats.length >= RENDER.MAX_SPLATS) splats.shift();
    splats.push({
      at: { x: ch.head.position.x, y: ch.head.position.y },
      sprite: rng.int(6),
      angle: rng.range(0, Math.PI * 2),
      seat: ch.seat,
    });
    // Dead bodies stop interacting rather than being removed: matter keeps its
    // broadphase happy and respawn is a teleport rather than a rebuild.
    for (const b of ch.bodies) b.collisionFilter = { category: 0, mask: 0, group: 0 };
  }

  function respawnSeat(ch: Character): void {
    activeCheckpoint(checkpointIndex, checkpointAt);
    const dx = checkpointAt.x - ch.head.position.x;
    const dy = checkpointAt.y - ch.head.position.y;
    for (const b of ch.bodies) teleport(b, b.position.x + dx, b.position.y + dy);
    restoreFilters(ch);
    ch.state = 'alive';
    ch.invulnUntilMs = elapsedMs + P.RESPAWN_INVULN_MS;
    ch.strandedMs = 0;
    ch.strandedX = ch.head.position.x;
    ch.strandedY = ch.head.position.y;
    resetHazardGrace(hazards, ch.seat);
    emit({ kind: 'respawn', seat: ch.seat, at: { x: checkpointAt.x, y: checkpointAt.y } });
  }

  /** Restore the collision filters `killSeat` zeroed. */
  function restoreFilters(ch: Character): void {
    ch.head.collisionFilter = { ...FILTERS.head };
    for (const arm of ch.arms) {
      for (const seg of arm.segs) seg.collisionFilter = { ...FILTERS.arm };
      arm.hand.collisionFilter = { ...FILTERS.hand };
    }
  }

  function applyInputs(inputs: InputFrame[]): void {
    for (const input of inputs) {
      const ch = characters[input.seat];
      if (!ch) continue;
      // The wire repeats the last three frames for loss tolerance (§9.4), so
      // de-duplication by frame number is what keeps a resend from replaying a
      // grab the player already made.
      if (input.frame <= lastInputFrame[input.seat]) continue;
      lastInputFrame[input.seat] = input.frame;

      const smoothing = ch.assists.aimSmoothing;
      if (ch.assists.oneHanded) {
        // Both arms from one stick: the active arm steers, the other dangles.
        smoothAim(ch.arms[ch.activeArm], input.aimL.x, input.aimL.y, smoothing);
        smoothAim(ch.arms[1 - ch.activeArm], 0, 0, smoothing);
      } else {
        smoothAim(ch.arms[0], input.aimL.x, input.aimL.y, smoothing);
        smoothAim(ch.arms[1], input.aimR.x, input.aimR.y, smoothing);
      }

      const base = ch.seat * 2;
      gripHeld[base] = input.gripL;
      gripHeld[base + 1] = input.gripR;

      const pressed = input.buttons & ~buttonsWas[ch.seat];
      buttonsWas[ch.seat] = input.buttons;
      if (pressed & InputButton.SwapArm) ch.activeArm = ch.activeArm === 0 ? 1 : 0;
      if (pressed & InputButton.Drop) {
        for (const rt of props) if (rt.carriedBy === ch.seat) dropProp(propCtx, rt);
      }
      if (pressed & InputButton.Emote) emit({ kind: 'emote', seat: ch.seat, emoteId: 'holler' });
      if (pressed & InputButton.UseItem) handleUseItem(ch);

      // Grab edges, resolved against the frame the player actually saw.
      for (let h = 0; h < 2; h++) {
        const hand = h === 0 ? 'l' : 'r';
        const scaleNow = gripScaleFor(ch, gripHeld[base + h]);
        const scaleBefore = gripWas[base + h];
        const grip = gripFor(grab, ch.seat, hand);
        if (scaleNow > 0 && scaleBefore <= 0 && !grip.active) {
          // The rising edge is the only attempt that gets lag compensation —
          // it is the frame the player was actually looking at. Later attempts
          // while the button stays down resolve against the present world.
          tryGrab(ch, hand, input.frame, scaleNow);
        } else if (scaleNow <= 0 && grip.active) {
          detachGrip(grabCtx, grab, grip, true);
          emit({ kind: 'grip', seat: ch.seat, hand, on: false });
        } else if (grip.active) {
          // An analog trigger eased off mid-swing weakens the grip in place —
          // a light grip that slips is a mechanic, not a bug (§4.1).
          grip.breakForce = ch.assists.stickyGrip ? Infinity : grip.baseBreak * scaleNow;
        }
        gripWas[base + h] = scaleNow;
      }
    }
  }

  function handleUseItem(ch: Character): void {
    if (activateProp(propCtx, props, ch)) return;
    for (const rt of props) if (rt.carriedBy === ch.seat && rt.kind === 'camera') takePhoto(objCtx, objectives);
    // A gripped pop cannon fires; whoever is standing in the barrel leaves.
    for (const hand of ['l', 'r'] as const) {
      const grip = gripFor(grab, ch.seat, hand);
      if (!grip.active || !grip.targetRef) continue;
      const rt = propAt(props, grip.targetRef);
      if (rt && rt.kind === 'popCannon' && firePopCannon(propCtx, rt)) return;
    }
    if (summonDrone(assist, ch, elapsedMs)) {
      emit({ kind: 'item', propId: 'rescue-drone', seat: ch.seat, kindOf: 'rescueDrone' });
    }
  }

  function scanContacts(): void {
    const pairs = world.engine.pairs as unknown as PairsLike;
    for (let i = 0; i < grounded.length; i++) grounded[i] = false;

    for (const pair of pairs.list) {
      if (!pair.isActive) continue;
      markGrounded(pair.bodyA);
      markGrounded(pair.bodyB);
    }

    for (const pair of pairs.collisionStart) {
      const seat = seatOfImpact(pair);
      if (seat < 0) continue;
      const ch = characters[seat];
      if (!ch || ch.state !== 'alive') continue;
      const speed = ch.prevSpeed;
      if (speed < P.DEATH_SPEED * ENGINE.SQUASH_IMPACT_RATIO) continue;
      noteImpact(ch, pair.collision.normal.x, pair.collision.normal.y, elapsedMs);
      if (!ch.assists.noFallDamage && speed >= P.DEATH_SPEED) killSeat(ch, 'impact');
    }
  }

  function markGrounded(body: Matter.Body): void {
    const meta = world.meta.get(body.id);
    if (meta && meta.seat >= 0 && (meta.role === 'head' || meta.role === 'hand')) {
      grounded[meta.seat] = true;
    }
  }

  /** Which seat's head just hit something solid, or -1. */
  function seatOfImpact(pair: PairLike): number {
    const a = world.meta.get(pair.bodyA.id);
    const b = world.meta.get(pair.bodyB.id);
    if (a && a.role === 'head' && (!b || b.role !== 'head')) return a.seat;
    if (b && b.role === 'head' && (!a || a.role !== 'head')) return b.seat;
    return -1;
  }

  function updateChain(): void {
    chainLinks.length = 0;
    for (const grip of grab.grips) {
      if (!grip.active || !isSeat(grip.targetSeat)) continue;
      chainLinks.push([grip.seat, grip.targetSeat]);
    }
    let seats = 0;
    for (const ch of characters) if (ch) seats++;
    objCtx.chainSize = chainSize(chainLinks, seats);
  }

  function updateCheckpoints(): void {
    let index = -1;
    let visible = -1;
    for (const cp of level.checkpoints) {
      if (cp.optional && !extraCheckpoints) continue;
      visible++;
      if (visible <= checkpointIndex) continue;
      for (const ch of characters) {
        if (!ch || ch.state !== 'alive') continue;
        const d = Math.hypot(ch.head.position.x - cp.at.x, ch.head.position.y - cp.at.y);
        if (d <= ENGINE.CHECKPOINT_RADIUS) index = visible;
      }
    }
    if (index > checkpointIndex) {
      checkpointIndex = index;
      noteCheckpoint(assist, checkpointIndex);
      activeCheckpoint(checkpointIndex, checkpointAt);
      emit({ kind: 'checkpoint', index: checkpointIndex });
    }
  }

  function updateDeaths(dtMs: number): void {
    let live = 0;
    let dead = 0;
    for (const ch of characters) {
      if (!ch) continue;
      if (ch.state === 'dead') {
        dead++;
        deadForMs[ch.seat] += dtMs;
        if (elapsedMs >= ch.respawnAtMs) respawnSeat(ch);
        continue;
      }
      live++;
      deadForMs[ch.seat] = 0;
      if (ch.state === 'frozen') {
        if (elapsedMs >= ch.respawnAtMs) {
          ch.state = 'alive';
          Matter.Body.setStatic(ch.head, false);
        }
        continue;
      }
      if (ch.state !== 'alive') continue;
      if (elapsedMs < ch.invulnUntilMs) continue;
      if (outOfBounds(world, ch)) killSeat(ch, 'bounds');
      else if (hazardKills(hazards, ch, dtMs)) killSeat(ch, 'hazard');
    }
    // A party wipe is what Inkblot counts (§6.4). One player dying never
    // blocks the party — they respawn alone while everyone else keeps playing.
    if (live === 0 && dead > 0 && !finished) {
      if (noteWipe(assist, checkpointIndex)) emit({ kind: 'cat' });
    }
  }

  function updateReaching(): void {
    grabCtx.rewindFrame = -1;
    for (const ch of characters) {
      if (!ch) continue;
      for (let h = 0; h < 2; h++) {
        const arm = ch.arms[h];
        const idx = ch.seat * 2 + h;
        if (gripFor(grab, ch.seat, h === 0 ? 'l' : 'r').active || ch.state !== 'alive') {
          reaching[idx] = false;
          continue;
        }
        // Auto-grab (§4.7) widens the catch a little; it is the touch scheme's
        // compensation for having no analog trigger to time.
        const radius = effectiveGrabRadius(ch) + (ch.assists.autoGrab ? ENGINE.AUTO_GRAB_PAD : 0);
        reaching[idx] = queryGrab(
          grabCtx,
          grab,
          ch.seat,
          arm.hand.position.x,
          arm.hand.position.y,
          radius,
          hit,
        );
        // Holding the button keeps reaching. §3.3 latches on the first thing
        // that comes within range, not only on whatever happened to be there
        // on the frame the button went down — a hand that had to be pressed at
        // exactly the right pixel would make the whole game a timing test.
        const scaleNow = gripScaleFor(ch, gripHeld[idx]);
        if (reaching[idx] && scaleNow > 0) {
          tryGrab(ch, h === 0 ? 'l' : 'r', -1, scaleNow);
        }
      }
    }
  }

  function captureTransforms(): void {
    for (let s = 0; s < NET.MAX_SEATS; s++) {
      const ch = characters[s];
      if (!ch) continue;
      const prev = prevT[s];
      const curr = currT[s];
      prev.headX = curr.headX;
      prev.headY = curr.headY;
      prev.headAngle = curr.headAngle;
      prev.scaleX = curr.scaleX;
      prev.scaleY = curr.scaleY;
      for (let a = 0; a < 2; a++) {
        for (let i = 0; i < ARM_NODES; i++) {
          prev.arms[a][i].x = curr.arms[a][i].x;
          prev.arms[a][i].y = curr.arms[a][i].y;
        }
      }
      curr.headX = ch.head.position.x;
      curr.headY = ch.head.position.y;
      curr.headAngle = ch.head.angle;
      deriveSquash(ch, elapsedMs, scale);
      curr.scaleX = scale.x;
      curr.scaleY = scale.y;
      armPolyline(ch, ch.arms[0], curr.arms[0]);
      armPolyline(ch, ch.arms[1], curr.arms[1]);
    }
  }

  function seedTransforms(ch: Character): void {
    const s = ch.seat;
    currT[s].headX = ch.head.position.x;
    currT[s].headY = ch.head.position.y;
    armPolyline(ch, ch.arms[0], currT[s].arms[0]);
    armPolyline(ch, ch.arms[1], currT[s].arms[1]);
    const prev = prevT[s];
    prev.headX = currT[s].headX;
    prev.headY = currT[s].headY;
    for (let a = 0; a < 2; a++) {
      for (let i = 0; i < ARM_NODES; i++) {
        prev.arms[a][i].x = currT[s].arms[a][i].x;
        prev.arms[a][i].y = currT[s].arms[a][i].y;
      }
    }
  }

  // ─── The step ─────────────────────────────────────────────────────────────

  function step(inputs: InputFrame[]): void {
    frame++;
    elapsedMs += DT;
    grabCtx.nowMs = elapsedMs;
    propCtx.nowMs = elapsedMs;
    hazardCtx.nowMs = elapsedMs;
    assistCtx.nowMs = elapsedMs;

    applyInputs(inputs);

    signals.update(DT);
    updateProps(propCtx, props, DT);
    updateHazards(hazardCtx, hazards, DT);
    updateAssist(assistCtx, assist, DT);

    for (const ch of characters) {
      if (!ch) continue;
      // A short EMA, not the instantaneous speed. matter's Verlet velocity is
      // the *position delta*, so every constraint correction lands in it as
      // noise — a falling head reads 24, 27, 25, 29 on consecutive steps, and
      // a raw threshold at DEATH_SPEED would kill the same fall about a third
      // of the time. The lag this costs is ~0.7 px/step at 1 g, which is well
      // inside the gap between a survivable fall and a fatal one.
      const speedNow = Math.hypot(ch.head.velocity.x, ch.head.velocity.y);
      ch.prevSpeed = ch.prevSpeed * 0.6 + speedNow * 0.4;
      if (ch.state === 'dead' || ch.state === 'respawning') continue;
      applyAim(ch, ch.arms[0], elapsedMs);
      applyAim(ch, ch.arms[1], elapsedMs);
      trackSwingPeak(ch, elapsedMs);
    }

    Engine.update(world.engine, DT);

    // Arms and grips are one constraint network, so the limiter sweeps both
    // together and repeats: fixing an arm moves the hand a grip is holding, and
    // one pass leaves the load half-propagated up a four-player chain.
    for (let it = 0; it < ENGINE.LIMIT_ITERATIONS; it++) {
      for (const ch of characters) {
        if (ch) relaxArms(ch);
      }
      for (const grip of grab.grips) {
        if (grip.active) limitGrip(grip);
      }
    }
    for (const ch of characters) {
      if (!ch) continue;
      clampActorSpeed(ch);
      trackAcceleration(ch);
      trackStranded(ch, DT);
    }

    updateGrips(
      grabCtx,
      grab,
      DT,
      (grip) => emit({ kind: 'grip', seat: grip.seat, hand: grip.hand, on: false }),
      (grip) => {
        // `crumbly` gave way under the hand that was holding it.
        const target = grip.target;
        detachGrip(grabCtx, grab, grip, false);
        if (target) world.remove(target);
      },
    );

    scanContacts();
    sweepPickups(propCtx, props);
    updateDeaths(DT);
    updateCheckpoints();
    updateReaching();
    updateChain();

    objCtx.elapsedMs = elapsedMs;
    objCtx.deaths = deaths;
    objCtx.assisted = assist.beamUsed || assist.catUsed;
    sweepRelics(objCtx);
    for (const rt of props) {
      if (rt.kind === 'plate' && rt.active) {
        recipesDone.add((rt.prop as Extract<PropRuntime['prop'], { kind: 'plate' }>).recipeId);
      }
    }
    updateObjectives(objCtx, objectives, DT);

    for (let s = 0; s < NET.MAX_SEATS; s++) {
      const ch = characters[s];
      const cs = cameraSeats[s];
      cs.active = ch !== null;
      if (!ch) continue;
      cs.x = ch.head.position.x;
      cs.y = ch.head.position.y;
      cs.vx = ch.head.velocity.x * (1000 / DT);
      cs.vy = ch.head.velocity.y * (1000 / DT);
      cs.deadForMs = ch.state === 'dead' ? deadForMs[s] : 0;
    }
    updateCamera(camera, cameraSeats, DT);

    if (!finished && goalReached(objCtx, level.goal.requires)) {
      finished = true;
      const ids = scoreOnFinish(objCtx, objectives);
      emit({
        kind: 'finish',
        ms: elapsedMs,
        objectives: ids,
        deaths,
        assisted: assist.beamUsed || assist.catUsed,
      });
    }

    recordHistory(grab.history, frame, world.tracked);
    captureTransforms();
  }

  // ─── Public surface ───────────────────────────────────────────────────────

  function addSeat(seat: SeatIndex, cosmetics: Cosmetics, assists: Assists): void {
    if (characters[seat]) return;
    const spawn = level.spawn[seat] ?? level.spawn[0] ?? { x: 0, y: 0 };
    activeCheckpoint(checkpointIndex, checkpointAt);
    const at = checkpointIndex > 0 ? checkpointAt : spawn;
    const ch = createCharacter(world, seat, at, cosmetics, assists);
    characters[seat] = ch;
    if (assists.extraCheckpoints) extraCheckpoints = true;
    renderSeats[seat].cosmetics = cosmetics;
    seedTransforms(ch);
    const cs = cameraSeats[seat];
    cs.active = true;
    cs.x = ch.head.position.x;
    cs.y = ch.head.position.y;
    cs.vx = 0;
    cs.vy = 0;
    cs.deadForMs = 0;
    snapCamera(camera, cameraSeats);
  }

  function removeSeat(seat: SeatIndex): void {
    const ch = characters[seat];
    if (!ch) return;
    for (const hand of ['l', 'r'] as const) detachGrip(grabCtx, grab, gripFor(grab, seat, hand), false);
    for (const rt of props) if (rt.carriedBy === seat) dropProp(propCtx, rt);
    destroyCharacter(world, ch);
    characters[seat] = null;
  }

  function snapshot(keyframe: boolean): Snapshot {
    snapshotOut.frame = frame;
    snapshotOut.flags = keyframe ? SnapshotFlag.Keyframe : 0;
    if (assist.catActive) snapshotOut.flags |= SnapshotFlag.CatActive;
    if (finished) snapshotOut.flags |= SnapshotFlag.Finished;

    const seats = snapshotOut.seats;
    seats.length = 0;
    for (let s = 0; s < NET.MAX_SEATS; s++) {
      const ch = characters[s];
      if (!ch) continue;
      const out = snapSeats[s];
      out.state = ch.state;
      out.head.x = ch.head.position.x;
      out.head.y = ch.head.position.y;
      out.headV.x = ch.head.velocity.x;
      out.headV.y = ch.head.velocity.y;
      out.headAngle = ch.head.angle;
      out.handL.x = ch.arms[0].hand.position.x;
      out.handL.y = ch.arms[0].hand.position.y;
      out.handR.x = ch.arms[1].hand.position.x;
      out.handR.y = ch.arms[1].hand.position.y;
      const gl = gripFor(grab, ch.seat, 'l');
      const gr = gripFor(grab, ch.seat, 'r');
      out.gripL = gl.active ? Math.max(1, Math.round(gl.tension * 255)) : 0;
      out.gripR = gr.active ? Math.max(1, Math.round(gr.tension * 255)) : 0;
      out.gripTargetL = gl.active && gl.target && !gl.target.isStatic ? gl.target.id : 0;
      out.gripTargetR = gr.active && gr.target && !gr.target.isStatic ? gr.target.id : 0;
      seats.push(out);
    }

    const out = snapshotOut.props;
    out.length = 0;
    for (let i = 0; i < props.length; i++) {
      const body = props[i].body;
      if (!body) continue;
      const o = i * 3;
      // Delta encoding: a prop that has not moved by a quarter pixel is not
      // news, and 20 Hz × 4 seats of unchanged crates is most of the packet.
      if (
        !keyframe &&
        Math.abs(body.position.x - lastSentProp[o]) < NET.PROP_DIRTY_EPSILON &&
        Math.abs(body.position.y - lastSentProp[o + 1]) < NET.PROP_DIRTY_EPSILON &&
        Math.abs(body.angle - lastSentProp[o + 2]) < NET.PROP_DIRTY_EPSILON / 10
      ) {
        continue;
      }
      lastSentProp[o] = body.position.x;
      lastSentProp[o + 1] = body.position.y;
      lastSentProp[o + 2] = body.angle;
      const sp = snapProps[i];
      sp.x = body.position.x;
      sp.y = body.position.y;
      sp.angle = body.angle;
      out.push(sp);
    }
    return snapshotOut;
  }

  function drainEvents(): GameEvent[] {
    const drained = events;
    events = eventsSpare;
    events.length = 0;
    eventsSpare = drained;
    return drained;
  }

  function render(alpha: number): RenderState {
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    const seats = renderState.seats;
    seats.length = 0;
    for (let s = 0; s < NET.MAX_SEATS; s++) {
      const ch = characters[s];
      if (!ch) continue;
      const rs = renderSeats[s];
      const p = prevT[s];
      const c = currT[s];
      rs.state = ch.state;
      rs.cosmetics = ch.cosmetics;
      rs.head.x = p.headX + (c.headX - p.headX) * a;
      rs.head.y = p.headY + (c.headY - p.headY) * a;
      rs.headAngle = p.headAngle + (c.headAngle - p.headAngle) * a;
      rs.scaleX = p.scaleX + (c.scaleX - p.scaleX) * a;
      rs.scaleY = p.scaleY + (c.scaleY - p.scaleY) * a;
      for (let i = 0; i < ARM_NODES; i++) {
        rs.armL[i].x = p.arms[0][i].x + (c.arms[0][i].x - p.arms[0][i].x) * a;
        rs.armL[i].y = p.arms[0][i].y + (c.arms[0][i].y - p.arms[0][i].y) * a;
        rs.armR[i].x = p.arms[1][i].x + (c.arms[1][i].x - p.arms[1][i].x) * a;
        rs.armR[i].y = p.arms[1][i].y + (c.arms[1][i].y - p.arms[1][i].y) * a;
      }
      const gl = gripFor(grab, ch.seat, 'l');
      const gr = gripFor(grab, ch.seat, 'r');
      rs.gripL = gl.active;
      rs.gripR = gr.active;
      rs.tensionL = gl.tension;
      rs.tensionR = gr.tension;
      rs.reachingL = reaching[s * 2];
      rs.reachingR = reaching[s * 2 + 1];
      rs.carrying = ch.carrying;
      seats.push(rs);
    }

    for (let i = 0; i < props.length; i++) {
      const rt = props[i];
      const rp = renderProps[i];
      rp.at.x = rt.body ? rt.body.position.x : rt.prop.at.x;
      rp.at.y = rt.body ? rt.body.position.y : rt.prop.at.y;
      rp.angle = rt.body ? rt.body.angle : (rt.prop.angle ?? 0);
      rp.active = rt.active;
      rp.progress = rt.progress;
    }
    for (let i = 0; i < hazards.length; i++) {
      renderHazards[i].active = hazards[i].active && !hazards[i].gone;
      renderHazards[i].progress = hazards[i].progress;
    }

    renderState.camera.x = camera.x;
    renderState.camera.y = camera.y;
    renderState.camera.zoom = camera.zoom;
    renderState.frame = frame;
    renderState.elapsedMs = elapsedMs;
    renderState.checkpointIndex = checkpointIndex;
    renderState.catActive = assist.catActive;
    return renderState;
  }

  function resolveGrabAt(seat: SeatIndex, hand: 'l' | 'r', atFrame: number): void {
    const ch = characters[seat];
    if (!ch || ch.state !== 'alive') return;
    const grip = gripFor(grab, seat, hand);
    if (grip.active) return;
    const clamped = Math.max(frame - (grab.history.capacity - 1), Math.min(frame, atFrame));
    tryGrab(ch, hand, clamped, gripScaleFor(ch, 1));
  }

  const sim: Simulation = {
    step,
    get frame(): number {
      return frame;
    },
    snapshot,
    drainEvents,
    render,
    addSeat,
    removeSeat,
    setAssists(seat, assists) {
      const ch = characters[seat];
      if (!ch) return;
      ch.assists = assists;
      if (assists.extraCheckpoints) extraCheckpoints = true;
    },
    resolveGrabAt,
    dispose() {
      for (let s = 0; s < NET.MAX_SEATS; s++) removeSeat(s as SeatIndex);
      Matter.Composite.clear(world.engine.world, false, true);
      Engine.clear(world.engine);
      world.meta.clear();
      world.grabbables.length = 0;
      world.tracked.length = 0;
    },
  };

  for (const seat of opts.seats ?? []) addSeat(seat.seat, seat.cosmetics, seat.assists);
  return sim;
}
