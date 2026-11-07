// ============================================================
// The menu duel — a scripted sparring loop for two fighters.
//
// Pure: `duelAt(t)` returns what each seat should look like at time `t` seconds,
// in exactly the fields the real fighter renderers read (state, punch,
// actionProgress, hitFlash, x, yaw, alive), so the menu can drive the same
// SkeletalFighter / SourceFighter the match uses. No sim, no randomness: the same
// t is always the same frame, the loop repeats every DUEL_PERIOD seconds.
// ============================================================
import type { PunchType } from '@/lib/kowloon-knockout/game/fighters/types';

export type DuelState = 'idle' | 'walking' | 'punching' | 'blocking' | 'hit' | 'knockedOut';

export interface DuelFrame {
    x: number;
    /** Sim yaw: 0 faces +X (the right), PI faces -X. */
    yaw: number;
    state: DuelState;
    punch: PunchType | null;
    actionProgress: number;
    hitFlash: number;
    alive: boolean;
}

type Reaction = 'block' | 'hit' | 'ko';
interface Beat { attacker: 0 | 1; punch: PunchType; reaction: Reaction; length: number }

const BEAT = 1.5;
export const BEATS: readonly Beat[] = [
    { attacker: 0, punch: 'jab', reaction: 'block', length: BEAT },
    { attacker: 0, punch: 'cross', reaction: 'hit', length: BEAT },
    { attacker: 1, punch: 'jab', reaction: 'block', length: BEAT },
    { attacker: 1, punch: 'hook', reaction: 'hit', length: BEAT },
    { attacker: 0, punch: 'uppercut', reaction: 'hit', length: BEAT },
    { attacker: 1, punch: 'cross', reaction: 'block', length: BEAT },
    { attacker: 0, punch: 'hook', reaction: 'ko', length: 3.4 },
];
export const DUEL_PERIOD = BEATS.reduce((s, b) => s + b.length, 0);

/** Where each fighter stands at rest, and how far the attacker lunges in. */
export const HOME_X = 0.8;
const LUNGE = 0.28;
const WINDUP = 0.35;
const PUNCH_TIME = 0.55;
const HIT_AT = WINDUP + PUNCH_TIME * 0.5;
const HIT_TIME = 0.5;
const KO_TIME = 1.0;
const FLASH_TIME = 0.25;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => { const c = clamp01(v); return c * c * (3 - 2 * c); };

function side(i: 0 | 1): { home: number; yaw: number; dir: 1 | -1 } {
    return i === 0 ? { home: -HOME_X, yaw: 0, dir: 1 } : { home: HOME_X, yaw: Math.PI, dir: -1 };
}

function beatFrames(beat: Beat, u: number): [DuelFrame, DuelFrame] {
    const frames = [0, 1].map((i): DuelFrame => ({
        x: side(i as 0 | 1).home, yaw: side(i as 0 | 1).yaw, state: 'idle', punch: null,
        actionProgress: 0, hitFlash: 0, alive: true,
    })) as [DuelFrame, DuelFrame];

    const a = frames[beat.attacker];
    const d = frames[(1 - beat.attacker) as 0 | 1];
    const sa = side(beat.attacker);
    const sd = side((1 - beat.attacker) as 0 | 1);

    // Attacker: step in, throw, step back out.
    const stepIn = smooth(u / WINDUP) - smooth((u - (WINDUP + PUNCH_TIME + 0.15)) / 0.35);
    a.x = sa.home + sa.dir * LUNGE * stepIn;
    if (u < WINDUP) a.state = 'walking';
    else if (u < WINDUP + PUNCH_TIME) { a.state = 'punching'; a.punch = beat.punch; a.actionProgress = (u - WINDUP) / PUNCH_TIME; }
    else if (u < WINDUP + PUNCH_TIME + 0.5) a.state = 'walking';

    // Defender: guards, takes it, or goes down.
    const sinceHit = u - HIT_AT;
    if (beat.reaction === 'block') {
        if (u > WINDUP * 0.6 && u < WINDUP + PUNCH_TIME + 0.2) d.state = 'blocking';
        if (sinceHit > 0 && sinceHit < 0.2) d.x = sd.home + sd.dir * -0.04;
    } else if (beat.reaction === 'hit') {
        if (sinceHit >= 0 && sinceHit < HIT_TIME) {
            d.state = 'hit';
            d.actionProgress = sinceHit / HIT_TIME;
            d.hitFlash = 8 * (1 - clamp01(sinceHit / FLASH_TIME));
            d.x = sd.home - sd.dir * 0.12 * smooth(sinceHit / 0.2);
        } else if (sinceHit >= HIT_TIME) d.x = sd.home - sd.dir * 0.12 * (1 - smooth((sinceHit - HIT_TIME) / 0.4));
    } else if (sinceHit >= 0) {
        d.state = 'knockedOut';
        d.actionProgress = clamp01(sinceHit / KO_TIME);
        d.hitFlash = 8 * (1 - clamp01(sinceHit / FLASH_TIME));
        d.alive = false;
        d.x = sd.home - sd.dir * 0.2 * smooth(sinceHit / 0.6);
    }
    return frames;
}

/** The two fighters (seat 0 on the left, seat 1 on the right) at time `t`. */
export function duelAt(t: number): [DuelFrame, DuelFrame] {
    let u = ((t % DUEL_PERIOD) + DUEL_PERIOD) % DUEL_PERIOD;
    for (const beat of BEATS) {
        if (u < beat.length) return beatFrames(beat, u);
        u -= beat.length;
    }
    return beatFrames(BEATS[0], 0);
}

/** Times (seconds into the loop) at which a hit lands — for flash-rate accounting and tests. */
export function hitTimes(): number[] {
    const out: number[] = [];
    let start = 0;
    for (const beat of BEATS) {
        if (beat.reaction !== 'block') out.push(start + HIT_AT);
        start += beat.length;
    }
    return out;
}

/** How far back the menu camera sits so both fighters (± halfWidth metres) fit at this aspect. */
export function cameraDistance(aspect: number, fovDeg: number, halfWidth = 2.3, minDistance = 3.6): number {
    const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
    return Math.max(minDistance, halfWidth / (tanHalf * Math.max(0.2, aspect)));
}
