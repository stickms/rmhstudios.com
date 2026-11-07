// =============================================================================
// KOWLOON MENU -- Fighter choreography (pure)
// =============================================================================
// Two neon stick fighters spar on a 16 s loop behind the main menu: a scripted
// exchange of jab / cross / hook / uppercut, a block, a slip, and a knockdown that
// the loser gets up from. Everything is data: a pose is eleven joints in fighter
// space (x forward, y up is NEGATIVE, origin at the feet), a beat says who throws
// what and when, and `sampleFighter` blends the keyframes those beats expand to.
//
// Accessibility: the only flashes in the scene are hit sparks. `HIT_ONSETS` lists
// them, and the tests prove no one-second window holds more than three
// (WCAG 2.3.1; the script keeps them >= 1 s apart, so the real maximum is 1).
// =============================================================================

/** Joints per pose; each is an (x, y) pair. */
export const JOINT_COUNT = 11;
export const J = {
  head: 0, neck: 1, hip: 2,
  lElbow: 3, lHand: 4, rElbow: 5, rHand: 6,
  lKnee: 7, lFoot: 8, rKnee: 9, rFoot: 10,
} as const;

export const LOOP_SECONDS = 16;

export type PoseName =
  | 'guard' | 'jab' | 'cross' | 'hook' | 'uppercut' | 'windup'
  | 'block' | 'hit' | 'slip' | 'down' | 'kneel' | 'cheer' | 'watch';

type PoseData = readonly number[];

// head, neck, hip, lElbow, lHand, rElbow, rHand, lKnee, lFoot, rKnee, rFoot  (x, y) each.
// The fighter faces +x; the left arm is the lead (nearest the opponent).
const P = (...v: number[]): PoseData => {
  if (v.length !== JOINT_COUNT * 2) throw new Error('pose needs 22 numbers');
  return v;
};

export const POSES: Record<PoseName, PoseData> = {
  guard: P(1, -46, 0, -41, -1, -24, 5, -33, 11, -40, 1, -32, 7, -41, 5, -13, 8, 0, -5, -13, -8, 0),
  windup: P(-1, -45, -2, -40, -2, -24, 3, -32, 8, -38, -2, -32, 3, -40, 4, -13, 7, 0, -6, -13, -9, 0),
  jab: P(4, -46, 2, -41, 0, -24, 13, -38, 24, -40, 1, -32, 7, -41, 7, -13, 11, 0, -5, -13, -9, 0),
  cross: P(5, -46, 3, -41, 0, -24, 5, -33, 9, -41, 12, -37, 25, -40, 6, -13, 10, 0, -6, -13, -10, 0),
  hook: P(4, -46, 2, -41, 0, -24, 8, -40, 19, -43, 1, -32, 7, -41, 6, -13, 10, 0, -5, -13, -9, 0),
  uppercut: P(3, -43, 1, -38, -2, -20, 5, -31, 8, -36, 7, -29, 16, -48, 7, -11, 11, 0, -6, -11, -9, 0),
  block: P(0, -44, -1, -39, -1, -24, 6, -37, 7, -45, 3, -36, 8, -44, 5, -13, 8, 0, -5, -13, -8, 0),
  hit: P(-6, -45, -3, -40, 0, -24, 2, -31, 1, -25, -3, -31, -5, -26, 4, -13, 7, 0, -4, -13, -8, 0),
  slip: P(-5, -41, -3, -36, -1, -22, 3, -31, 8, -37, -1, -31, 4, -38, 5, -12, 8, 0, -5, -12, -8, 0),
  down: P(-34, -5, -27, -4, -9, -4, -22, -3, -14, -1, -20, -7, -12, -9, 3, -5, 14, -2, 5, -3, 16, -1),
  kneel: P(-7, -29, -5, -24, -3, -13, 1, -22, 6, -26, -6, -20, 0, -22, 6, -4, 9, -1, -7, -5, -4, 0),
  cheer: P(1, -46, 0, -41, -1, -24, 5, -50, 6, -60, -5, -50, -7, -60, 5, -13, 8, 0, -5, -13, -8, 0),
  // The bystander: weight on one leg, arms folded across the chest.
  watch: P(0, -46, 0, -41, 0, -24, 3, -30, 8, -35, -3, -30, 4, -34, 2, -13, 3, 0, -4, -13, -6, 0),
};

interface Key { t: number; pose: PoseName; x: number }

export interface Beat {
  /** Seconds into the loop the attacker starts. */
  t: number;
  who: 0 | 1;
  move: 'jab' | 'cross' | 'hook' | 'uppercut';
  /** What the defender does at impact. */
  result: 'hit' | 'block' | 'slip' | 'knockdown';
}

/** Seconds from the start of a throw to contact. */
export const IMPACT_DELAY = 0.3;

/** The exchange. Beats are >= 1.2 s apart, so a loser's recovery never overlaps the next throw. */
export const BEATS: readonly Beat[] = [
  { t: 1.2, who: 0, move: 'jab', result: 'hit' },
  { t: 2.6, who: 0, move: 'cross', result: 'hit' },
  { t: 4.2, who: 1, move: 'hook', result: 'hit' },
  { t: 5.8, who: 0, move: 'uppercut', result: 'block' },
  { t: 7.2, who: 1, move: 'cross', result: 'hit' },
  { t: 8.6, who: 0, move: 'jab', result: 'slip' },
  { t: 10.0, who: 0, move: 'hook', result: 'hit' },
  { t: 11.3, who: 0, move: 'uppercut', result: 'knockdown' },
];

/** Standing spots, either side of centre (px). */
const GAP = 20;
const LUNGE = 9;
const RECOIL = 5;
const KNOCKBACK = 16;

/** Times of the visible hit sparks (a block makes a smaller one, still counted). */
export const HIT_ONSETS: readonly number[] = BEATS.filter((b) => b.result !== 'slip').map((b) => b.t + IMPACT_DELAY);

function buildTrack(who: 0 | 1): Key[] {
  const keys: Key[] = [{ t: 0, pose: 'guard', x: 0 }];
  const push = (t: number, pose: PoseName, x: number) => {
    const last = keys[keys.length - 1];
    keys.push({ t: Math.max(t, last.t + 0.001), pose, x });
  };
  for (const b of BEATS) {
    const hit = b.t + IMPACT_DELAY;
    if (b.who === who) {
      push(b.t - 0.1, 'guard', 0);
      push(b.t, 'windup', -2);
      push(hit, b.move, LUNGE);
      push(hit + 0.22, b.move, LUNGE - 2);
      push(hit + 0.75, 'guard', 0);
    } else if (b.result === 'hit') {
      push(hit - 0.06, 'guard', 0);
      push(hit + 0.06, 'hit', RECOIL);
      push(hit + 0.5, 'guard', 1);
      push(hit + 0.9, 'guard', 0);
    } else if (b.result === 'block') {
      push(hit - 0.2, 'guard', 0);
      push(hit - 0.04, 'block', 1);
      push(hit + 0.55, 'block', 1);
      push(hit + 0.9, 'guard', 0);
    } else if (b.result === 'slip') {
      push(hit - 0.15, 'guard', 0);
      push(hit, 'slip', 2);
      push(hit + 0.35, 'slip', 2);
      push(hit + 0.75, 'guard', 0);
    } else {
      // knockdown: slammed back, lies, kneels, gets up
      push(hit - 0.05, 'guard', 0);
      push(hit + 0.12, 'hit', RECOIL + 4);
      push(hit + 0.6, 'down', KNOCKBACK);
      push(hit + 2.4, 'down', KNOCKBACK);
      push(hit + 3.0, 'kneel', KNOCKBACK - 5);
      push(hit + 3.6, 'guard', 0);
    }
  }
  // The winner celebrates over the loser, then both reset to the opening stance.
  if (who === 0) {
    const hit = 11.3 + IMPACT_DELAY;
    push(hit + 1.2, 'guard', 0);
    push(hit + 1.5, 'cheer', 2);
    push(hit + 2.7, 'cheer', 2);
    push(hit + 3.2, 'guard', 0);
  }
  push(LOOP_SECONDS - 0.3, 'guard', 0);
  push(LOOP_SECONDS, 'guard', 0);
  return keys;
}

const TRACKS: [Key[], Key[]] = [buildTrack(0), buildTrack(1)];

const smooth = (u: number): number => u * u * (3 - 2 * u);

export interface FighterSample {
  /** `JOINT_COUNT * 2` numbers, fighter space, facing +x. Written in place. */
  joints: Float32Array;
  /** Horizontal offset from the standing spot, in the fighter's facing direction (px). */
  x: number;
  /** True while lying on the floor. */
  ground: boolean;
}

export const createFighterSample = (): FighterSample => ({ joints: new Float32Array(JOINT_COUNT * 2), x: 0, ground: false });

/** Standing x of fighter `who` relative to the scene centre, before `sample.x` (+ faces the other fighter). */
export function standingX(who: 0 | 1): number {
  return who === 0 ? -GAP : GAP;
}

/** Fill `out` with fighter `who`'s pose at scene time `t` (looped). Allocation-free. */
export function sampleFighter(who: 0 | 1, t: number, out: FighterSample): void {
  const track = TRACKS[who];
  const lt = ((t % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
  let i = 0;
  while (i < track.length - 2 && track[i + 1].t <= lt) i++;
  const a = track[i];
  const b = track[i + 1];
  const u = smooth(Math.min(1, Math.max(0, (lt - a.t) / (b.t - a.t))));
  const pa = POSES[a.pose];
  const pb = POSES[b.pose];
  // Guard stance breathes: a small bounce on the upper body, strongest when both keys are guard.
  const bounce = Math.sin(t * 6.2 + who * 1.7) * 0.9;
  const lying = a.pose === 'down' || b.pose === 'down';
  const amount = lying ? 0 : a.pose === 'guard' && b.pose === 'guard' ? 1 : 0.3;
  for (let k = 0; k < JOINT_COUNT * 2; k++) {
    let v = pa[k] + (pb[k] - pa[k]) * u;
    const joint = k >> 1;
    const lowerBody = joint === J.lFoot || joint === J.rFoot || joint === J.lKnee || joint === J.rKnee;
    if ((k & 1) === 1 && !lowerBody) v += bounce * amount;
    out.joints[k] = v;
  }
  out.x = a.x + (b.x - a.x) * u;
  out.ground = a.pose === 'down' && b.pose === 'down';
}

/** Where beat `b`'s spark lands relative to the scene centre (px; y is up-negative from the feet line). */
export function sparkSpot(b: Beat): { x: number; y: number } {
  const dir = b.who === 0 ? 1 : -1;
  const defender = standingX(b.who === 0 ? 1 : 0);
  const y = b.move === 'uppercut' ? -44 : b.move === 'hook' ? -41 : -38;
  return { x: defender - dir * 5, y };
}
