/**
 * One character: a head, two four-segment arms, two hands, and the solver that
 * makes an arm point where the stick points (§3.1–3.2).
 *
 * The mechanic that falls out of the aim solver is worth stating, because it is
 * not obvious from the pseudocode and everything else in the game rests on it.
 * Each segment is pulled toward `shoulder + dir × (segLen × (i + 0.5))`. With a
 * free hand that just lays the arm out along the stick. With a *gripped* hand
 * the target is unreachable — the hand is pinned — so the error never closes
 * and the residual force keeps pulling the shoulder, which is to say the head,
 * around the anchor. That is the swing, the climb and the throw, all three, and
 * it is why `ARM_FORCE_MAX` is a feel constant rather than a stability one:
 * raise it and the character stops swinging and starts flying.
 *
 * The arm forces are applied at each segment's centre of mass on purpose. Off-
 * centre application would add torque and make the arm spin about its own
 * joints instead of laying out; the constraints supply all the rotation the arm
 * needs.
 */

import Matter from 'matter-js';
import { RENDER } from '../constants';
import type { Assists, Cosmetics, SeatIndex, SeatLifeState, Vec2 } from '../types';
import { cancelSeparation, correctPosition, defaultMeta, FILTERS, type PhysWorld } from './world';
import { ENGINE, GRAVITY_SCALE, P } from './tuning';

const { Bodies, Body } = Matter;

export interface Arm {
  side: 'l' | 'r';
  segs: Matter.Body[];
  hand: Matter.Body;
  /** Shoulder anchor in head-local space. */
  shoulderLocal: Vec2;
  joints: Matter.Constraint[];
  /** Smoothed aim; length 0 means limp. */
  aim: Vec2;
  /** The commanded arm direction — the aim, slewed (see `applyAim`). */
  dir: Vec2;
  limp: boolean;
  /** 1, or ARM_REACH_PX_STRETCHED/ARM_REACH_PX while Stretch Ink is up. */
  reachScale: number;
  stretchUntilMs: number;
  /** Release assist (§3.4) needs the peak of the swing, not the current speed. */
  peakSpeed: number;
  peakAtMs: number;
  /** Grease coats a hand for a while after contact (§6.6 W2). */
  greaseUntilMs: number;
  /**
   * Whether this hand is currently holding something.
   *
   * The aim solver needs it because a free arm and a gripped arm want very
   * different authority — see `FREE_ARM_AUTHORITY` in `applyAim`.
   */
  gripped: boolean;
}

export interface Character {
  seat: SeatIndex;
  cosmetics: Cosmetics;
  assists: Assists;
  head: Matter.Body;
  arms: [Arm, Arm];
  bodies: Matter.Body[];
  state: SeatLifeState;
  /** Wall clock (sim ms) at which a dead seat comes back. */
  respawnAtMs: number;
  invulnUntilMs: number;
  /** How long this seat has been unable to make progress (§6.4 drone). */
  strandedMs: number;
  strandedX: number;
  strandedY: number;
  carrying: string | null;
  /** One-handed assist (§4.7): which arm the single stick is driving. */
  activeArm: 0 | 1;
  /** Squash/stretch state (§2.7). */
  impactMs: number;
  impactNX: number;
  impactNY: number;
  /** Speed at the end of the previous step — the collision has already eaten it. */
  prevSpeed: number;
  /**
   * Smoothed per-step velocity change of the head, in px/step². This is what
   * `gripLoad` weighs: a chain's tension is the mass hanging from it times how
   * hard that mass is being accelerated, and matter's raw Verlet velocity is
   * far too noisy to differentiate without smoothing.
   */
  accX: number;
  accY: number;
  prevVX: number;
  prevVY: number;
  droneAim: Vec2;
  deaths: number;
}

const SEG_HALF = P.ARM_SEG_LENGTH / 2;
const STRETCH_SCALE = P.ARM_REACH_PX_STRETCHED / P.ARM_REACH_PX;

/** Scratch — the step path must not allocate (§17). */
const forceScratch: Vec2 = { x: 0, y: 0 };
const shoulderScratch: Vec2 = { x: 0, y: 0 };
const dirScratch: Vec2 = { x: 0, y: 0 };
const clampScratch: Vec2 = { x: 0, y: 0 };

/** Four times a fatal fall — unreachable in play; see `clampActorSpeed`. */
const SPEED_CEILING = P.DEATH_SPEED * 4;

function signedAngle(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
}

function clampAngle(a: number, limit: number): number {
  return a > limit ? limit : a < -limit ? -limit : a;
}

function rotate(v: Vec2, angle: number, out: Vec2): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = v.x * c - v.y * s;
  out.y = v.x * s + v.y * c;
  out.x = x;
}

export function shoulderWorld(ch: Character, arm: Arm, out: Vec2): Vec2 {
  const c = Math.cos(ch.head.angle);
  const s = Math.sin(ch.head.angle);
  out.x = ch.head.position.x + arm.shoulderLocal.x * c - arm.shoulderLocal.y * s;
  out.y = ch.head.position.y + arm.shoulderLocal.x * s + arm.shoulderLocal.y * c;
  return out;
}

function createArm(world: PhysWorld, seat: SeatIndex, side: 'l' | 'r', at: Vec2): Arm {
  const sign = side === 'l' ? -1 : 1;
  const shoulderLocal: Vec2 = { x: P.SHOULDER_OFFSET_X * sign, y: P.SHOULDER_OFFSET_Y };
  const segs: Matter.Body[] = [];
  const joints: Matter.Constraint[] = [];

  const originX = at.x + shoulderLocal.x;
  const originY = at.y + shoulderLocal.y;

  for (let i = 0; i < P.ARM_SEGMENTS; i++) {
    const seg = Bodies.rectangle(
      originX,
      originY + P.ARM_SEG_LENGTH * (i + 0.5),
      P.ARM_SEG_LENGTH,
      P.ARM_SEG_RADIUS * 2,
      {
        angle: Math.PI / 2,
        collisionFilter: FILTERS.arm,
        friction: 0.4,
        // Every part of a character carries the head's air friction, and that
        // is load-bearing rather than tidy. The aim solver is deliberately not
        // momentum-conserving (see above), so any *systematic* lag between the
        // arm and the shoulder it chases becomes a permanent force on the whole
        // body. With draggier limbs a falling player's limp arms trail the
        // head, the solver reads that as error, and the character accelerates
        // downward at five times gravity — measured, before this line existed.
        frictionAir: P.HEAD_AIR_FRICTION,
        label: `arm-${seat}-${side}-${i}`,
      },
    );
    Body.setMass(seg, P.ARM_SEG_MASS);
    seg.sleepThreshold = Infinity;
    segs.push(seg);
    world.add(seg, defaultMeta({ role: 'arm', seat, grabbable: false }));
  }

  const hand = Bodies.circle(originX, originY + P.ARM_SEG_LENGTH * P.ARM_SEGMENTS, P.HAND_RADIUS, {
    collisionFilter: FILTERS.hand,
    friction: P.HAND_FRICTION,
    frictionStatic: P.HAND_FRICTION,
    frictionAir: P.HEAD_AIR_FRICTION,
    label: `hand-${seat}-${side}`,
  });
  Body.setMass(hand, P.HAND_MASS);
  hand.sleepThreshold = Infinity;
  // A hand is grabbable so another player can take it — hand-to-hand is the
  // highest-priority target in the grab query (§3.3) and the whole chain
  // mechanic depends on it.
  world.add(hand, defaultMeta({ role: 'hand', seat, grabbable: true, material: 'paper' }));

  return {
    side,
    segs,
    hand,
    shoulderLocal,
    joints,
    aim: { x: 0, y: 0 },
    dir: { x: 0, y: 1 },
    limp: true,
    reachScale: 1,
    stretchUntilMs: 0,
    peakSpeed: 0,
    peakAtMs: -1e9,
    greaseUntilMs: 0,
    gripped: false,
  };
}

function linkArm(world: PhysWorld, head: Matter.Body, arm: Arm): void {
  const { Constraint } = Matter;
  arm.joints.push(
    Constraint.create({
      bodyA: head,
      pointA: { x: arm.shoulderLocal.x, y: arm.shoulderLocal.y },
      bodyB: arm.segs[0],
      pointB: { x: -SEG_HALF, y: 0 },
      length: 0,
      stiffness: 1,
      label: 'shoulder',
    }),
  );
  for (let i = 0; i < arm.segs.length - 1; i++) {
    arm.joints.push(
      Constraint.create({
        bodyA: arm.segs[i],
        pointA: { x: SEG_HALF, y: 0 },
        bodyB: arm.segs[i + 1],
        pointB: { x: -SEG_HALF, y: 0 },
        length: 0,
        stiffness: 0.9,
        damping: 0.08,
        label: 'seg',
      }),
    );
  }
  arm.joints.push(
    Constraint.create({
      bodyA: arm.segs[arm.segs.length - 1],
      pointA: { x: SEG_HALF, y: 0 },
      bodyB: arm.hand,
      pointB: { x: 0, y: 0 },
      length: 0,
      stiffness: 1,
      label: 'wrist',
    }),
  );
  for (const j of arm.joints) world.addConstraint(j);
}

export function createCharacter(
  world: PhysWorld,
  seat: SeatIndex,
  at: Vec2,
  cosmetics: Cosmetics,
  assists: Assists,
): Character {
  const head = Bodies.circle(at.x, at.y, P.HEAD_RADIUS, {
    collisionFilter: FILTERS.head,
    frictionAir: P.HEAD_AIR_FRICTION,
    restitution: P.HEAD_RESTITUTION,
    friction: 0.35,
    label: `head-${seat}`,
  });
  Body.setMass(head, P.HEAD_MASS);
  head.sleepThreshold = Infinity;
  world.add(head, defaultMeta({ role: 'head', seat, grabbable: true, material: 'paper' }));

  const left = createArm(world, seat, 'l', at);
  const right = createArm(world, seat, 'r', at);
  linkArm(world, head, left);
  linkArm(world, head, right);

  const bodies: Matter.Body[] = [head, ...left.segs, left.hand, ...right.segs, right.hand];

  return {
    seat,
    cosmetics,
    assists,
    head,
    arms: [left, right],
    bodies,
    state: 'alive',
    respawnAtMs: 0,
    invulnUntilMs: 0,
    strandedMs: 0,
    strandedX: at.x,
    strandedY: at.y,
    carrying: null,
    activeArm: 0,
    impactMs: -1e9,
    impactNX: 0,
    impactNY: 1,
    prevSpeed: 0,
    accX: 0,
    accY: 0,
    prevVX: 0,
    prevVY: 0,
    droneAim: { x: 0, y: 0 },
    deaths: 0,
  };
}

export function destroyCharacter(world: PhysWorld, ch: Character): void {
  for (const arm of ch.arms) for (const j of arm.joints) world.removeConstraint(j);
  for (const b of ch.bodies) world.remove(b);
}

/**
 * Fold this frame's stick into the arm's smoothed aim. `aimSmoothing` is the
 * fraction of the previous vector retained per step — a low-pass for tremor and
 * for worn sticks, not a lag budget, so the default 0.35 settles inside two
 * frames.
 */
export function smoothAim(arm: Arm, x: number, y: number, smoothing: number): void {
  const k = smoothing <= 0 ? 0 : smoothing >= 1 ? 0.99 : smoothing;
  arm.aim.x = arm.aim.x * k + x * (1 - k);
  arm.aim.y = arm.aim.y * k + y * (1 - k);
}

/** §3.2. Called once per arm per step, before `Engine.update`. */
export function applyAim(ch: Character, arm: Arm, nowMs: number): void {
  if (arm.stretchUntilMs > 0 && nowMs >= arm.stretchUntilMs) {
    arm.stretchUntilMs = 0;
    arm.reachScale = 1;
  }

  const ax = arm.aim.x;
  const ay = arm.aim.y;
  const mag = Math.hypot(ax, ay);
  // A centred stick means the arm dangles. It is the only way to read, at a
  // glance and across the screen, that a player has let go and is falling.
  arm.limp = mag < 0.12;
  /*
   * A FREE arm gets a fraction of the authority a gripped one does, and this is
   * the fix for "he can fly".
   *
   * The full force exists for one job: a gripped hand is pinned, the target is
   * unreachable, and the residual error hauls the body around the anchor. That
   * is the swing, and it needs every bit of `ARM_FORCE_MAX`.
   *
   * A free arm has nothing to pull against, so all that force goes into the
   * reaction on the head. Held straight up — four point masses on constraints,
   * an inverted pendulum the controller can never win — it saturated forever
   * and pressed the head down with SIX TIMES the character's weight. Standing
   * on the ground that drove the head through the floor (measured: rest at
   * y=674, through by step 427, gone to y=11571 and back out the top); in the
   * air it kept every segment at full drive, which is what "the arms move on
   * their own" looked like.
   *
   * Scaling by grip state rather than clamping the reaction keeps Newton's
   * third law exact — the pair still sums to zero, so this cannot become
   * thrust — and costs the swing nothing, because a swinging arm is by
   * definition gripped.
   */
  const authority = arm.gripped ? ENGINE.GRIPPED_ARM_AUTHORITY : ENGINE.FREE_ARM_AUTHORITY;
  const gain = (arm.limp ? P.ARM_REACH_GAIN * P.ARM_LIMP_GAIN : P.ARM_REACH_GAIN) * authority;
  // The clamp goes limp with the gain. Scaling only the gain leaves a dangling
  // arm able to saturate at full force the moment the error grows, which is
  // exactly a falling player — and a dangling arm that can shove the body is
  // not dangling.
  const forceMax = (arm.limp ? P.ARM_FORCE_MAX * P.ARM_LIMP_GAIN : P.ARM_FORCE_MAX) * authority;

  let wantX: number;
  let wantY: number;
  if (arm.limp) {
    wantX = 0;
    wantY = 1;
  } else {
    const inv = 1 / mag;
    wantX = ax * inv;
    wantY = ay * inv;
  }

  const sh = shoulderWorld(ch, arm, shoulderScratch);

  /*
   * The commanded direction is `arm.dir`: persistent state, slewed toward the
   * stick at a bounded rate and then held within a right angle of where the arm
   * actually points.
   *
   * Both halves are load-bearing and they fix opposite failures. Take the
   * command straight from the stick, as §3.2 reads, and an arm hanging down
   * that is asked to point up hands all four segments a target on the far side
   * of the shoulder; they take the shortest path, through each other, and
   * arrive as a knot with no order left. Arms do not collide with arms
   * (`MASK.ARM`, and that is not negotiable), so nothing untangles it — measured,
   * the arm sat at half extension in a permanent tangle. Slewing fixes that.
   *
   * But re-derive the command from the arm's *current* direction every step and
   * a gripped arm can never be commanded anywhere: the hand is pinned, the
   * command tracks the arm it is supposed to be moving, the error stays near
   * zero and the swing loses its drive entirely. So the command is remembered,
   * and only *clamped* to the arm — at 90°, the largest offset whose targets
   * are still on the arm's own side of the shoulder. That clamp is what a
   * gripped arm runs into, and the residual error it leaves is the force that
   * swings the body.
   */
  const maxSlew = (ENGINE.ARM_SLEW_RATE * P.FIXED_DT_MS) / 1000;
  const slew = clampAngle(signedAngle(arm.dir.x, arm.dir.y, wantX, wantY), maxSlew);
  rotate(arm.dir, slew, arm.dir);

  let curX = arm.hand.position.x - sh.x;
  let curY = arm.hand.position.y - sh.y;
  const curLen = Math.hypot(curX, curY);
  if (curLen > 1e-3) {
    curX /= curLen;
    curY /= curLen;
    const off = signedAngle(curX, curY, arm.dir.x, arm.dir.y);
    if (Math.abs(off) > ENGINE.ARM_MAX_OFFSET) {
      dirScratch.x = curX;
      dirScratch.y = curY;
      rotate(dirScratch, off > 0 ? ENGINE.ARM_MAX_OFFSET : -ENGINE.ARM_MAX_OFFSET, arm.dir);
    }
  }
  const dirX = arm.dir.x;
  const dirY = arm.dir.y;
  const segLen = P.ARM_SEG_LENGTH * arm.reachScale;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < arm.segs.length; i++) {
    const seg = arm.segs[i];
    const reach = segLen * (i + 0.5);
    const towardX = sh.x + dirX * reach - seg.position.x;
    const towardY = sh.y + dirY * reach - seg.position.y;
    const w = gain * P.ARM_SEG_WEIGHT[i];

    /*
     * Feed-forward: carry the segment's own weight before the controller sees
     * the error at all.
     *
     * Without this, a raised arm can never reach its target — gravity holds it
     * below the line — so a pure proportional controller sits at its clamp
     * FOREVER. That is not a small inefficiency, it is the bug: four saturated
     * segments per arm put a constant 4× body weight of reaction through the
     * head, which on the ground drove the character down through the floor at
     * 5px/step (measured: rest at y=674, through the floor by step 427, gone to
     * y=11571) and in the air kept every segment permanently at full drive,
     * which is what "the arms move on their own" looks like.
     *
     * Cancelling the segment's weight and charging it to the head is exactly
     * what a body does when it holds an arm up, costs nothing in net force
     * (it is still an internal pair), and leaves the P term doing only the job
     * it is good at: correcting real pose error, and going quiet at rest.
     */
    const lift = seg.mass * P.GRAVITY_Y * GRAVITY_SCALE;

    /*
     * And a damping term, because a spring with no damper is an oscillator.
     * The segments are 24× lighter than the head, so an undamped P controller
     * rings at a frequency the eye reads as buzzing — the second half of "the
     * arms rotate very fast". Damping is on the segment's own velocity, so it
     * costs nothing when the arm is still and only bites when it whips.
     */
    let fx = towardX * w - seg.velocity.x * ENGINE.ARM_DAMPING;
    let fy = towardY * w - seg.velocity.y * ENGINE.ARM_DAMPING;

    const fm = Math.hypot(fx, fy);
    if (fm > forceMax) {
      const s = forceMax / fm;
      fx *= s;
      fy *= s;
    }
    // The lift is added AFTER the clamp: it is not the controller's effort, it
    // is the weight the arm was always carrying, and clamping it would put the
    // sag straight back.
    fy -= lift;

    forceScratch.x = fx;
    forceScratch.y = fy;
    Body.applyForce(seg, seg.position, forceScratch);
    sumX += fx;
    sumY += fy;
  }

  // The reaction. Muscles are internal forces, and leaving this out is the
  // single most expensive mistake available here: a raised arm never reaches
  // `shoulder + dir × reach` (gravity keeps it sagging), so its controller sits
  // permanently at the clamp, and four saturated segments pushing on nothing
  // lift a 1.84-mass character at six times gravity. Measured: aim one arm
  // straight up with no grip and the character hovers, then drifts. With the
  // reaction, a free arm can only pose itself, and the character's centre of
  // mass does not move — which is also why a grip is the only thing that
  // converts arm force into travel, and therefore why the game is about
  // grabbing.
  forceScratch.x = -sumX;
  forceScratch.y = -sumY;
  Body.applyForce(ch.head, ch.head.position, forceScratch);
}

/**
 * Post-solve joint limiter.
 *
 * matter solves an arm as six soft constraints between a 1.2 head and 0.05
 * segments. At that mass ratio a character hanging by one hand puts its whole
 * weight through joints whose combined inverse mass is 40, and the joint has to
 * separate ~15 px per step to generate the force to hold it — the arm becomes
 * rope and the head sinks. This pass runs after `Engine.update` and pulls any
 * joint that is stretched past its slack back to the slack limit, weighted by
 * inverse mass, correcting position without touching `positionPrev` so the
 * correction registers as the deceleration a taut arm actually applies.
 *
 * It is a *limiter*: inside the slack it does nothing, so the whippy, springy
 * character of the arm in free motion is matter's and stays matter's.
 */
/**
 * Smooth first, then differentiate.
 *
 * matter's Verlet velocity is a position delta, so every constraint correction
 * lands in it: a chain hanging perfectly still reports per-step velocity swings
 * of several px, and differentiating that directly gives an "acceleration" of
 * nine gravities for a body that is not moving. Low-passing the velocity and
 * taking the difference of the *smoothed* signal is the standard fix and the
 * only one that leaves a resting chain reading its own weight. The window is
 * ~170 ms, which is short against anything a swing does and long against the
 * solver's buzz.
 */
export function trackAcceleration(ch: Character): void {
  const k = ENGINE.ACCEL_SMOOTH;
  const nx = ch.prevVX + (ch.head.velocity.x - ch.prevVX) * k;
  const ny = ch.prevVY + (ch.head.velocity.y - ch.prevVY) * k;
  ch.accX = nx - ch.prevVX;
  ch.accY = ny - ch.prevVY;
  ch.prevVX = nx;
  ch.prevVY = ny;
}

/**
 * The last line of defence: no part of a character may exceed this speed.
 *
 * `DEATH_SPEED` is 26 px/step, which is a fatal fall, so `SPEED_CEILING` at
 * four times that is unreachable by anything the game asks a player to do —
 * it is a safety net, not a tuning knob, and if it is ever load-bearing for
 * feel something else is wrong.
 *
 * It exists because the arm controller is not a muscle. Four point masses on
 * constraints cannot stand up: an arm held straight overhead is an inverted
 * pendulum, so the controller is permanently correcting a buckle it can never
 * win, and pose-dependent resonances between that and the joint limiter can
 * still run away even with the energy pump fixed and gravity fed forward.
 * Measured before this: a character resting on the floor with both arms up
 * left through the world at y=11571.
 *
 * Clamping speed cannot create motion, only remove it, so it can never be the
 * cause of a launch — it is strictly the thing that stops one.
 */
export function clampActorSpeed(ch: Character): void {
  for (const body of ch.bodies) {
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    const speed = Math.hypot(vx, vy);
    if (speed <= SPEED_CEILING || speed < 1e-9) continue;
    const s = SPEED_CEILING / speed;
    clampScratch.x = vx * s;
    clampScratch.y = vy * s;
    Body.setVelocity(body, clampScratch);
  }
}

export function relaxArms(ch: Character): void {
  dampHeadSpin(ch);
  const slack = ENGINE.JOINT_SLACK_PX;
  {
    for (const arm of ch.arms) {
      const sh = shoulderWorld(ch, arm, shoulderScratch);
      // shoulder → seg0 tail
      limitPair(ch.head, sh.x, sh.y, arm.segs[0], -SEG_HALF, slack);
      for (let i = 0; i < arm.segs.length - 1; i++) {
        const a = arm.segs[i];
        const c = Math.cos(a.angle);
        const s = Math.sin(a.angle);
        limitPair(a, a.position.x + SEG_HALF * c, a.position.y + SEG_HALF * s, arm.segs[i + 1], -SEG_HALF, slack);
      }
      const last = arm.segs[arm.segs.length - 1];
      const lc = Math.cos(last.angle);
      const ls = Math.sin(last.angle);
      limitPair(last, last.position.x + SEG_HALF * lc, last.position.y + SEG_HALF * ls, arm.hand, 0, slack);

      // Overall tendon: whatever the joints did, the hand may not end up
      // further from the shoulder than an arm can physically reach.
      const span = P.ARM_SEG_LENGTH * P.ARM_SEGMENTS * arm.reachScale * ENGINE.SEG_STRETCH_LIMIT;
      limitCentres(ch.head, sh.x, sh.y, arm.hand, span);
    }
  }
}

/**
 * A head is a circle on two shoulder pins, and matter's constraints torque both
 * bodies they touch. Over a few seconds of arm work that torque accumulates
 * with nothing to bleed it — measured, the head reached 5 rad/s and stayed
 * there, whirling both shoulders (and therefore both arm roots) around itself.
 * A neck's worth of angular friction costs one multiply and leaves the head
 * free to roll on impact, which is the rotation the game actually wants.
 */
function dampHeadSpin(ch: Character): void {
  Body.setAngularVelocity(ch.head, ch.head.angularVelocity * (1 - ENGINE.HEAD_SPIN_DAMP));
  /*
   * The segments need this at least as much as the head, and for a while they
   * did not have it — which was the whole of "the arms rotate very fast".
   *
   * The aim solver drives each segment by its CENTRE, deliberately: applying
   * force off-centre would spin the segment about its own joints instead of
   * laying the arm out. But that leaves segment ORIENTATION controlled only by
   * the constraints, and constraint torque has nothing to dissipate it — so
   * the segments kept whatever spin they picked up, forever.
   *
   * It is invisible in the positions and glaring on screen, because
   * `armPolyline` builds every node from `seg.position + SEG_HALF × (cos a,
   * sin a)`: a segment whose centre is perfectly still still whirls its two
   * endpoints around itself. Measured on a HELD pose, the drawn arm swept a
   * mean of 17 rad/s with peaks over 180 — against a commanded slew cap of
   * 12.6 rad/s, i.e. the arm was moving faster than the player could ever
   * command it to.
   */
  for (const arm of ch.arms) {
    for (const seg of arm.segs) {
      Body.setAngularVelocity(seg, seg.angularVelocity * (1 - ENGINE.ARM_SPIN_DAMP));
    }
    Body.setAngularVelocity(arm.hand, arm.hand.angularVelocity * (1 - ENGINE.ARM_SPIN_DAMP));
  }
}

/** `bLocal` is `b`'s attach point along its own long axis. */
function limitPair(a: Matter.Body, ax: number, ay: number, b: Matter.Body, bLocal: number, slack: number): void {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  const bx = b.position.x + bLocal * c;
  const by = b.position.y + bLocal * s;
  limitCentres(a, ax, ay, b, slack, bx, by);
}

function limitCentres(
  a: Matter.Body,
  ax: number,
  ay: number,
  b: Matter.Body,
  maxDist: number,
  bx = b.position.x,
  by = b.position.y,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  if (d <= maxDist || d < 1e-6) return;
  const wa = a.isStatic ? 0 : a.inverseMass;
  const wb = b.isStatic ? 0 : b.inverseMass;
  const wsum = wa + wb;
  if (wsum <= 0) return;
  const ux = dx / d;
  const uy = dy / d;
  const excess = d - maxDist;
  const nx = ux * excess;
  const ny = uy * excess;
  correctPosition(a, (nx * wa) / wsum, (ny * wa) / wsum);
  correctPosition(b, (-nx * wb) / wsum, (-ny * wb) / wsum);
  // The projection above moves the bodies without touching their velocity, so
  // on its own it leaves them still travelling apart and the joint re-stretches
  // next step — a limiter that fights the same separation forever. This is the
  // other half: take away the separating velocity, and only that. It is a
  // subtraction, which is what keeps the pair stable instead of pumping.
  cancelSeparation(a, b, ux, uy);
}

/** Fill `out` with ARM_SEGMENTS+1 points, shoulder → hand (§Simulation.render). */
export function armPolyline(ch: Character, arm: Arm, out: Vec2[]): void {
  const sh = shoulderWorld(ch, arm, shoulderScratch);
  out[0].x = sh.x;
  out[0].y = sh.y;
  for (let i = 0; i < arm.segs.length; i++) {
    const seg = arm.segs[i];
    const c = Math.cos(seg.angle);
    const s = Math.sin(seg.angle);
    out[i + 1].x = seg.position.x + SEG_HALF * c;
    out[i + 1].y = seg.position.y + SEG_HALF * s;
  }
  // The last node IS the hand — the wrist joint is zero-length, so using the
  // hand centre keeps the drawn arm and the drawn mitten from disagreeing when
  // the joint is under load and momentarily separated.
  out[out.length - 1].x = arm.hand.position.x;
  out[out.length - 1].y = arm.hand.position.y;
}

export function startStretchInk(arm: Arm, nowMs: number): void {
  arm.reachScale = STRETCH_SCALE;
  arm.stretchUntilMs = nowMs + P.STRETCH_INK_MS;
}

export function noteImpact(ch: Character, nx: number, ny: number, nowMs: number): void {
  ch.impactMs = nowMs;
  ch.impactNX = nx;
  ch.impactNY = ny;
}

/**
 * Velocity stretch and impact squash, collapsed to the axis-aligned scale pair
 * the renderer carries. The true transform is `R S Rᵀ` and has a shear term;
 * `RenderSeat` has no channel for it and a head is a circle, so dropping it
 * costs nothing visible and saves the renderer a matrix.
 */
export function deriveSquash(ch: Character, nowMs: number, out: { x: number; y: number }): void {
  const vx = ch.head.velocity.x;
  const vy = ch.head.velocity.y;
  const speed = Math.hypot(vx, vy) * (1000 / P.FIXED_DT_MS);
  const stretch = 1 + Math.min(RENDER.STRETCH_MAX, speed / RENDER.STRETCH_REF_SPEED);
  let ux = 0;
  let uy = 1;
  if (speed > 1e-3) {
    const inv = 1 / Math.hypot(vx, vy);
    ux = vx * inv;
    uy = vy * inv;
  }
  const ux2 = ux * ux;
  const uy2 = uy * uy;
  let sx = stretch * ux2 + (1 / stretch) * uy2;
  let sy = stretch * uy2 + (1 / stretch) * ux2;

  const since = nowMs - ch.impactMs;
  if (since >= 0 && since < RENDER.SQUASH_RECOVER_MS) {
    const k = 1 - since / RENDER.SQUASH_RECOVER_MS;
    const squash = 1 - (1 - RENDER.SQUASH_ON_IMPACT) * k;
    const nx2 = ch.impactNX * ch.impactNX;
    const ny2 = ch.impactNY * ch.impactNY;
    sx *= squash * nx2 + (1 / squash) * ny2;
    sy *= squash * ny2 + (1 / squash) * nx2;
  }
  out.x = sx;
  out.y = sy;
}
