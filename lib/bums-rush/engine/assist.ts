/**
 * Assist: beams, the rescue drone, and Inkblot the studio cat (§6.4).
 *
 * Three escalating supports, all optional, none of which asks permission.
 *
 * **Beams** are authored per level, always present and always grabbable. They
 * cost the Clock objective if used, so skilled play still has a reason to ignore
 * them — that price is the entire mechanism by which an assist can be visible
 * without being a scold.
 *
 * **The drone** is the fix for "one player is stuck behind a wall while three
 * wait". It is summoned by the stranded player, never automatically: taking
 * control away from someone who is still trying is worse than the wait.
 *
 * **Inkblot** arrives after repeated wipes on the same checkpoint and turns
 * everyone into a flying drone until the next one. It is presented as a joke —
 * the cat is bored of watching — because that framing is what stops a mercy
 * mechanic from reading as an insult, and because a page covered in your own
 * splats (§2.7) has already made the point.
 */

import Matter from 'matter-js';
import { ASSIST, NET } from '../constants';
import type { Level, SeatIndex, Shape, Vec2 } from '../types';
import type { Character } from './character';
import { GRAVITY_SCALE, P } from './tuning';
import { defaultMeta, shapeToBody, type PhysWorld } from './world';

const { Body } = Matter;

export interface AssistState {
  beams: Matter.Body[];
  /** Any beam has been gripped this attempt — the Clock objective is void. */
  beamUsed: boolean;
  /** Consecutive party wipes since the last checkpoint advance. */
  wipes: number;
  wipeCheckpoint: number;
  catActive: boolean;
  catUsed: boolean;
  catThreshold: number;
  droneCooldownUntil: Float64Array;
  droneUntil: Float64Array;
  droneTargetX: number;
  droneTargetY: number;
}

export interface AssistContext {
  world: PhysWorld;
  characters: (Character | null)[];
  nowMs: number;
  checkpoint: Vec2;
}

const forceScratch: Vec2 = { x: 0, y: 0 };

export function createAssist(world: PhysWorld, level: Level, catAfterWipes: 0 | 3 | 6): AssistState {
  const beams: Matter.Body[] = [];
  for (let i = 0; i < level.assistBeams.length; i++) {
    const shape: Shape = level.assistBeams[i];
    const body = shapeToBody(shape, { isStatic: true, material: 'rubber' });
    body.sleepThreshold = Infinity;
    world.add(
      body,
      defaultMeta({ role: 'beam', grabbable: true, material: 'rubber', refId: `beam-${i}` }),
    );
    beams.push(body);
  }
  return {
    beams,
    beamUsed: false,
    wipes: 0,
    wipeCheckpoint: 0,
    catActive: false,
    catUsed: false,
    catThreshold: catAfterWipes === 0 ? Infinity : catAfterWipes,
    droneCooldownUntil: new Float64Array(NET.MAX_SEATS),
    droneUntil: new Float64Array(NET.MAX_SEATS),
    droneTargetX: 0,
    droneTargetY: 0,
  };
}

export function noteBeamGrab(state: AssistState, refId: string): void {
  if (refId.startsWith('beam-')) state.beamUsed = true;
}

/**
 * A party wipe. Returns true when this is the wipe that summons Inkblot.
 * The counter resets on reaching a new checkpoint — the cat is a response to
 * being stuck *here*, not to a long level.
 */
export function noteWipe(state: AssistState, checkpointIndex: number): boolean {
  if (checkpointIndex !== state.wipeCheckpoint) {
    state.wipeCheckpoint = checkpointIndex;
    state.wipes = 0;
  }
  state.wipes++;
  if (!state.catActive && state.wipes >= state.catThreshold) {
    state.catActive = true;
    state.catUsed = true;
    return true;
  }
  return false;
}

export function noteCheckpoint(state: AssistState, checkpointIndex: number): void {
  state.wipeCheckpoint = checkpointIndex;
  state.wipes = 0;
  // The cat's help ends at the next checkpoint; it is a bridge over one hard
  // stretch, not a mode.
  state.catActive = false;
}

export function canSummonDrone(state: AssistState, ch: Character, nowMs: number): boolean {
  return (
    ch.strandedMs >= ASSIST.DRONE_STRANDED_MS && nowMs >= state.droneCooldownUntil[ch.seat]
  );
}

export function summonDrone(state: AssistState, ch: Character, nowMs: number): boolean {
  if (!canSummonDrone(state, ch, nowMs)) return false;
  state.droneCooldownUntil[ch.seat] = nowMs + ASSIST.DRONE_COOLDOWN_MS;
  // Three seconds is long enough to read as a rescue and short enough that
  // nobody sits through it twice.
  state.droneUntil[ch.seat] = nowMs + 3000;
  ch.state = 'drone';
  ch.strandedMs = 0;
  return true;
}

/**
 * Drone flight and Inkblot's paw. Both replace gravity with directional
 * control on the head; the arms keep their solver so a drone still *looks* like
 * a character with arms rather than a cursor.
 */
export function updateAssist(ctx: AssistContext, state: AssistState, dtMs: number): void {
  for (const ch of ctx.characters) {
    if (!ch) continue;
    const seat = ch.seat as SeatIndex;

    if (ch.state === 'drone' && ctx.nowMs >= state.droneUntil[seat]) {
      ch.state = 'alive';
      continue;
    }

    if (ch.state === 'drone') {
      // Carried to the checkpoint on a fixed glide: predictable beats physical
      // here, because the whole point is that it cannot fail.
      const dx = ctx.checkpoint.x - ch.head.position.x;
      const dy = ctx.checkpoint.y - ch.head.position.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = Math.min(d, (700 * dtMs) / 1000);
      hover(ch);
      forceScratch.x = (dx / d) * speed * ch.head.mass * 0.02;
      forceScratch.y = (dy / d) * speed * ch.head.mass * 0.02;
      Body.applyForce(ch.head, ch.head.position, forceScratch);
      continue;
    }

    if (state.catActive && ch.state === 'alive') {
      hover(ch);
      const aim = ch.arms[ch.activeArm].aim;
      const mag = Math.hypot(aim.x, aim.y);
      if (mag > 0.12) {
        forceScratch.x = (aim.x / mag) * ch.head.mass * GRAVITY_SCALE * 2.2;
        forceScratch.y = (aim.y / mag) * ch.head.mass * GRAVITY_SCALE * 2.2;
        Body.applyForce(ch.head, ch.head.position, forceScratch);
      }
    }
  }
}

/** Cancel gravity on the head only — the arms should still dangle. */
function hover(ch: Character): void {
  forceScratch.x = 0;
  forceScratch.y = -ch.head.mass * P.GRAVITY_Y * GRAVITY_SCALE;
  Body.applyForce(ch.head, ch.head.position, forceScratch);
}

/**
 * "Stranded" is deliberately about *progress*, not about being airborne: a
 * player wedged in a corner mashing grab is stranded, and a player calmly
 * swinging a long traverse is not, even though both are off the ground.
 */
export function trackStranded(ch: Character, dtMs: number): void {
  const moved = Math.hypot(ch.head.position.x - ch.strandedX, ch.head.position.y - ch.strandedY);
  if (moved > 220 || ch.state === 'drone') {
    ch.strandedMs = 0;
    ch.strandedX = ch.head.position.x;
    ch.strandedY = ch.head.position.y;
  } else {
    ch.strandedMs += dtMs;
  }
}
