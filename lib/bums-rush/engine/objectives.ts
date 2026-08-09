/**
 * Objective evaluation (§7), including the snapshot predicate.
 *
 * A level carries exactly three optional objectives and they drive cosmetic
 * progression only — the level is *cleared* by reaching the goal. That split is
 * why nothing in here can fail a level, and why the photo objective is a
 * predicate over sim state at the shutter frame rather than image analysis: the
 * question "were all four of you airborne and was one of you upside down" is
 * one the simulation can answer exactly, cheaply, and identically on a phone.
 *
 * Objectives are scored **for everyone present**. The alternative teaches four
 * people to race each other for a collectible in a co-operative game, which is
 * the opposite of what the collectible is for (§10.5).
 */

import type { Objective, SeatIndex, Shape, SnapshotPredicate } from '../types';
import type { Camera } from './camera';
import { cameraContains } from './camera';
import type { Character } from './character';
import type { PropRuntime } from './props';
import { propContains } from './props';
import { ENGINE } from './tuning';
import { shapeContains } from './world';

export interface ObjectiveState {
  objectives: Objective[];
  scored: boolean[];
  /** Per objective: ms a pose has been held inside tolerance. */
  poseHoldMs: number[];
  /** Photos taken this attempt, for the results Polaroids. */
  photos: number;
}

export interface ObjectiveContext {
  characters: (Character | null)[];
  props: PropRuntime[];
  camera: Camera;
  goal: Shape;
  /** Seats with a static contact this step — `allAirborne` needs the negation. */
  grounded: boolean[];
  /** Largest set of seats linked hand-to-hand right now. */
  chainSize: number;
  elapsedMs: number;
  parSeconds: number;
  deaths: number;
  /** Clock is void if an assist beam or Inkblot carried the party (§6.4). */
  assisted: boolean;
  relicsAtGoal: Set<string>;
  recipesDone: Set<string>;
  emit(objectiveId: string): void;
}

export function createObjectives(objectives: Objective[]): ObjectiveState {
  return {
    objectives,
    scored: objectives.map(() => false),
    poseHoldMs: objectives.map(() => 0),
    photos: 0,
  };
}

/**
 * Per-step progress for the objectives that accumulate. The rest
 * (`clock`, `haul`, `flawless`) are resolved once, at the goal.
 */
export function updateObjectives(ctx: ObjectiveContext, state: ObjectiveState, dtMs: number): void {
  for (let i = 0; i < state.objectives.length; i++) {
    if (state.scored[i]) continue;
    const obj = state.objectives[i];
    switch (obj.kind) {
      case 'pose': {
        const outline = findPose(ctx.props, obj.poseId);
        if (!outline) break;
        const tolerance = (outline.prop as Extract<PropRuntime['prop'], { kind: 'poseOutline' }>)
          .tolerance;
        let inside = false;
        for (const ch of ctx.characters) {
          if (!ch || ch.state !== 'alive') continue;
          const d = Math.hypot(
            ch.head.position.x - outline.prop.at.x,
            ch.head.position.y - outline.prop.at.y,
          );
          if (d <= tolerance) {
            inside = true;
            break;
          }
        }
        state.poseHoldMs[i] = inside ? state.poseHoldMs[i] + dtMs : 0;
        if (state.poseHoldMs[i] >= ENGINE.POSE_HOLD_MS) score(ctx, state, i);
        break;
      }
      case 'recipe': {
        if (ctx.recipesDone.has(obj.recipeId)) score(ctx, state, i);
        break;
      }
      default:
        break;
    }
  }
}

/** The shutter. Returns true when the photo satisfied a snapshot objective. */
export function takePhoto(ctx: ObjectiveContext, state: ObjectiveState): boolean {
  state.photos++;
  let any = false;
  for (let i = 0; i < state.objectives.length; i++) {
    const obj = state.objectives[i];
    if (obj.kind !== 'snapshot' || state.scored[i]) continue;
    if (evaluateSnapshot(obj.predicate, ctx)) {
      score(ctx, state, i);
      any = true;
    }
  }
  return any;
}

/** Every field is optional and ANDed together (§7). */
export function evaluateSnapshot(pred: SnapshotPredicate, ctx: ObjectiveContext): boolean {
  let inFrame = 0;
  let live = 0;
  let allAirborne = true;
  let anyInverted = false;
  let nearProp = false;

  const target = pred.nearPropId ? findProp(ctx.props, pred.nearPropId) : null;
  if (pred.nearPropId && !target) return false;

  for (const ch of ctx.characters) {
    if (!ch || ch.state === 'dead' || ch.state === 'respawning') continue;
    live++;
    const seen = cameraContains(ctx.camera, ch.head.position.x, ch.head.position.y);
    if (seen) inFrame++;
    if (ctx.grounded[ch.seat]) allAirborne = false;
    // A head is a circle, so "upside down" is the body angle, which matter
    // spins through friction exactly as a rolling head would.
    const a = normalizeAngle(ch.head.angle);
    if (Math.abs(a) > Math.PI / 2) anyInverted = true;
    if (target && propContains(target, ch.head.position.x, ch.head.position.y)) nearProp = true;
    else if (
      target &&
      Math.hypot(ch.head.position.x - target.prop.at.x, ch.head.position.y - target.prop.at.y) <=
        ENGINE.SNAPSHOT_NEAR_PX
    ) {
      nearProp = true;
    }
  }

  if (live === 0) return false;
  if (pred.minSeats !== undefined && inFrame < pred.minSeats) return false;
  if (pred.allSeatsInFrame && inFrame < live) return false;
  if (pred.allAirborne && !allAirborne) return false;
  if (pred.anyInverted && !anyInverted) return false;
  if (pred.nearPropId && !nearProp) return false;
  if (pred.chainedSeats !== undefined && ctx.chainSize < pred.chainedSeats) return false;
  return true;
}

/** Resolved when the goal triggers; returns the ids that scored overall. */
export function scoreOnFinish(ctx: ObjectiveContext, state: ObjectiveState): string[] {
  for (let i = 0; i < state.objectives.length; i++) {
    if (state.scored[i]) continue;
    const obj = state.objectives[i];
    switch (obj.kind) {
      case 'clock':
        // Assist beams and Inkblot both void the Clock. That price is what
        // lets the assists exist without a prompt or an apology (§6.4).
        if (!ctx.assisted && ctx.elapsedMs <= ctx.parSeconds * 1000) score(ctx, state, i);
        break;
      case 'haul': {
        let all = true;
        for (const id of obj.relicIds) if (!ctx.relicsAtGoal.has(id)) all = false;
        if (all && obj.relicIds.length > 0) score(ctx, state, i);
        break;
      }
      case 'flawless':
        if (ctx.deaths === 0) score(ctx, state, i);
        break;
      default:
        break;
    }
  }
  const ids: string[] = [];
  for (let i = 0; i < state.objectives.length; i++) if (state.scored[i]) ids.push(state.objectives[i].id);
  return ids;
}

/** Relics count when they are at the goal *as the goal triggers* (§7). */
export function sweepRelics(ctx: ObjectiveContext): void {
  for (const rt of ctx.props) {
    if (rt.kind !== 'relic' || !rt.body) continue;
    const relicId = (rt.prop as Extract<PropRuntime['prop'], { kind: 'relic' }>).relicId;
    if (shapeContains(ctx.goal, rt.body.position.x, rt.body.position.y)) ctx.relicsAtGoal.add(relicId);
    else ctx.relicsAtGoal.delete(relicId);
  }
}

/** `goal.requires` decides whether one seat or all of them must be inside. */
export function goalReached(ctx: ObjectiveContext, requires: 'any' | 'all'): boolean {
  let live = 0;
  let inside = 0;
  for (const ch of ctx.characters) {
    if (!ch || ch.state === 'dead' || ch.state === 'respawning') continue;
    live++;
    if (shapeContains(ctx.goal, ch.head.position.x, ch.head.position.y)) inside++;
  }
  if (live === 0) return false;
  return requires === 'any' ? inside > 0 : inside === live;
}

/**
 * Largest connected set of seats linked hand-to-hand. Union-find on four
 * elements is a four-entry array; anything cleverer would be longer than this.
 */
export function chainSize(links: readonly (readonly [SeatIndex, SeatIndex])[], seats: number): number {
  const parent = [0, 1, 2, 3];
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  for (const [a, b] of links) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  let best = seats > 0 ? 1 : 0;
  for (let root = 0; root < 4; root++) {
    let n = 0;
    for (let i = 0; i < seats; i++) if (find(i) === find(root)) n++;
    if (n > best) best = n;
  }
  return best;
}

function score(ctx: ObjectiveContext, state: ObjectiveState, index: number): void {
  if (state.scored[index]) return;
  state.scored[index] = true;
  ctx.emit(state.objectives[index].id);
}

function findPose(props: PropRuntime[], poseId: string): PropRuntime | null {
  for (const rt of props) {
    if (rt.kind === 'poseOutline') {
      const prop = rt.prop as Extract<PropRuntime['prop'], { kind: 'poseOutline' }>;
      if (prop.poseId === poseId) return rt;
    }
  }
  return null;
}

function findProp(props: PropRuntime[], id: string): PropRuntime | null {
  for (const rt of props) if (rt.prop.id === id) return rt;
  return null;
}

function normalizeAngle(a: number): number {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
}
