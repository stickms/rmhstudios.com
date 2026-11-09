// ============================================================
// Impact — what a hit, a block and a knockout do to the picture.
//
// Render-only (the sim is untouched): the arena and the main menu both feed `ImpactEvent`s to one
// `ImpactBus`, and every visual reads the bus:
//   * the camera adds `shake()` (a trauma model: amplitude grows with trauma², decays smoothly, and
//     is band-limited noise — not a random jolt per frame, so it is the same at 60 and 144 Hz),
//   * fighters freeze for a beat on contact (`timeScaleFor`: hit-stop) and a knockout drops
//     everything into slow motion,
//   * the victim is knocked back, squashed and flashed (`reaction`: damped springs, so it settles
//     with a small overshoot instead of snapping),
//   * the effects layer spawns sparks, a shockwave ring and a flash from `impactProfile`.
// Pure and dependency-free: time comes in as `now` (ms) and `dt` (s), so every behaviour is testable.
// ============================================================

import { clamp01, lerp } from '@/lib/core/math';
export type ImpactKind = 'hit' | 'block' | 'ko';

export interface ImpactEvent {
    kind: ImpactKind;
    /** The seat that took it. */
    victim: number;
    /** The seat that threw it (null for a block, whose event names only the defender). */
    attacker: number | null;
    /** Damage dealt (or that would have been); 0..~45. */
    power: number;
    /** World position of the contact (victim's chest). */
    x: number; y: number; z: number;
    /** Unit vector on the ground plane, attacker → victim: which way the victim is pushed. */
    dirX: number; dirZ: number;
    /** The attacker's accent colour (hits): sparks and rings take it. Optional: blocks and KOs have their own. */
    color?: string;
}

export interface ImpactProfile {
    /** Added to camera trauma (0..1). */
    trauma: number;
    /** How long contact freezes the two fighters' animation, ms. */
    hitStopMs: number;
    /** Whole-scene slow motion after the freeze: speed (1 = none) and how long it lasts, ms. */
    slowMo: number;
    slowMoMs: number;
    /** Visual knock-back distance of the victim, metres. */
    recoil: number;
    /** Squash of the victim's body, as a fraction (0.1 = 10% shorter, wider). */
    squash: number;
    /** Hit-flash strength on the victim, 0..1. */
    flash: number;
    /** Shockwave ring: radius reached (m) and lifetime (s). */
    ringSize: number;
    ringLife: number;
    /** Spark count and the field-of-view kick (degrees) the camera takes. */
    sparks: number;
    fovKick: number;
}

/** Damage → 0..1 weight. A jab is ~4-8, a fully comboed uppercut ~40+. */
export function powerWeight(power: number): number {
    return clamp01((power - 3) / 25);
}

/**
 * The numbers for one impact. Hits scale with damage; a block is a short, hard stop (the same freeze as
 * a light hit, a shower of sparks, little knock-back); a knockout is the biggest thing in the game.
 */
export function impactProfile(kind: ImpactKind, power: number): ImpactProfile {
    const p = powerWeight(power);
    switch (kind) {
        case 'ko':
            return {
                trauma: 1, hitStopMs: 150, slowMo: 0.28, slowMoMs: 650, recoil: 0.7, squash: 0.2, flash: 1,
                ringSize: 5, ringLife: 0.85, sparks: 64, fovKick: 4.5,
            };
        case 'block':
            return {
                trauma: lerp(0.2, 0.34, p), hitStopMs: lerp(55, 85, p), slowMo: 1, slowMoMs: 0,
                recoil: lerp(0.07, 0.15, p), squash: lerp(0.03, 0.06, p), flash: 0.5,
                ringSize: lerp(0.9, 1.5, p), ringLife: 0.3, sparks: Math.round(lerp(18, 30, p)), fovKick: lerp(0.5, 1.1, p),
            };
        case 'hit':
        default:
            return {
                trauma: lerp(0.3, 0.8, p), hitStopMs: lerp(50, 135, p), slowMo: 1, slowMoMs: 0,
                recoil: lerp(0.14, 0.42, p), squash: lerp(0.06, 0.16, p), flash: lerp(0.55, 1, p),
                ringSize: lerp(1.3, 3.1, p), ringLife: lerp(0.32, 0.5, p), sparks: Math.round(lerp(14, 38, p)), fovKick: lerp(0.8, 3, p),
            };
    }
}

// ── Camera shake ───────────────────────────────────────────────────────────────

export interface ShakeSample { x: number; y: number; roll: number }

/** Largest camera offset (metres) / roll (radians) at full trauma. */
export const SHAKE_MAX_OFFSET = 0.55;
export const SHAKE_MAX_ROLL = 0.045;
/** Trauma lost per second: a full-trauma shake lasts ~0.9 s, a small one is gone in ~0.3 s. */
export const TRAUMA_DECAY = 1.15;

/** A few incommensurate sines: smooth, never repeating within a shake, no per-frame randomness. */
const wobble = (t: number, a: number, b: number, c: number) =>
    (Math.sin(t * a) + Math.sin(t * b + 1.7) * 0.6 + Math.sin(t * c + 4.1) * 0.35) / 1.95;

/** Camera offset for `trauma` (0..1) at time `t` seconds. Amplitude is trauma², so small hits are subtle. */
export function shakeSample(trauma: number, t: number): ShakeSample {
    const amp = clamp01(trauma) ** 2;
    if (amp === 0) return { x: 0, y: 0, roll: 0 };
    return {
        x: wobble(t, 23, 37, 59) * SHAKE_MAX_OFFSET * amp,
        y: wobble(t, 29, 43, 67) * SHAKE_MAX_OFFSET * amp * 0.8,
        roll: wobble(t, 19, 31, 53) * SHAKE_MAX_ROLL * amp,
    };
}

// ── Per-fighter reaction ───────────────────────────────────────────────────────

export interface Reaction {
    /** Visual knock-back offset on the ground plane, metres (springs back to 0). */
    ox: number; oz: number;
    /** Squash: positive flattens (shorter, wider); springs back to 0, overshoots slightly. */
    squash: number;
    /** Hit flash 0..1, decays quickly. */
    flash: number;
    /** What kind of impact set the flash (the renderer picks white-hot vs cyan from it). */
    flashKind: ImpactKind;
    /** Lean away from the blow, radians about the axis perpendicular to `dir` (springs back). */
    lean: number;
    /** The unit direction of the last blow (attacker → victim), for lean and effects. */
    dirX: number; dirZ: number;
}

interface ReactionInternal extends Reaction { vx: number; vz: number; vsq: number; vlean: number }

const SPRING_K = 260;   // stiffness (1/s²): settles in ~0.35 s
const SPRING_C = 21;    // damping (1/s): ζ ≈ 0.65, a small, quick overshoot
const FLASH_DECAY = 7;  // 1/s

function freshReaction(): ReactionInternal {
    return { ox: 0, oz: 0, squash: 0, flash: 0, flashKind: 'hit', lean: 0, dirX: 0, dirZ: 1, vx: 0, vz: 0, vsq: 0, vlean: 0 };
}

// ── The bus ────────────────────────────────────────────────────────────────────

export type ImpactListener = (event: ImpactEvent, profile: ImpactProfile) => void;

/** How long the freeze takes to ease back to full speed at its end (ms): the stop releases, it doesn't pop. */
const STOP_RELEASE_MS = 30;
/** Speed during the freeze (not exactly 0, so a held pose still has a hair of life). */
const STOP_SPEED = 0.03;

export class ImpactBus {
    /** Camera trauma 0..1 (decays in `step`). */
    trauma = 0;
    /** Added to the camera's field of view, degrees (decays in `step`). */
    fovKick = 0;
    private reactions = new Map<number, ReactionInternal>();
    private stopUntil = new Map<number, number>();
    private stopFrom = new Map<number, number>();
    private slowUntil = 0;
    private slowFrom = 0;
    private slowScale = 1;
    private listeners = new Set<ImpactListener>();
    private clock = 0;

    subscribe(fn: ImpactListener): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    /** Register an impact at time `now` (ms). Returns the profile that was applied. */
    emit(e: ImpactEvent, now: number): ImpactProfile {
        const prof = impactProfile(e.kind, e.power);
        this.trauma = Math.min(1, Math.max(this.trauma, prof.trauma) + prof.trauma * 0.25);
        this.fovKick = Math.max(this.fovKick, prof.fovKick);

        const r = this.ensure(e.victim);
        const len = Math.hypot(e.dirX, e.dirZ) || 1;
        const dx = e.dirX / len;
        const dz = e.dirZ / len;
        r.dirX = dx; r.dirZ = dz;
        // Kick the springs with a velocity that carries the offset out to ~`recoil` before it returns.
        const v = prof.recoil * Math.sqrt(SPRING_K) * 1.5;
        r.vx += dx * v; r.vz += dz * v;
        r.vsq += prof.squash * Math.sqrt(SPRING_K) * 1.6;
        r.vlean += prof.recoil * 3.2;
        r.flash = Math.max(r.flash, prof.flash);
        r.flashKind = e.kind;

        const until = now + prof.hitStopMs;
        for (const seat of e.attacker === null ? [e.victim] : [e.victim, e.attacker]) {
            if (until > (this.stopUntil.get(seat) ?? 0)) { this.stopUntil.set(seat, until); this.stopFrom.set(seat, now); }
        }
        if (prof.slowMoMs > 0) {
            this.slowFrom = until;
            this.slowUntil = until + prof.slowMoMs;
            this.slowScale = prof.slowMo;
        }
        for (const fn of this.listeners) fn(e, prof);
        return prof;
    }

    /**
     * Tell subscribers about an impact WITHOUT any of its physical consequences: no camera trauma, no
     * freeze, no slow motion, no knock-back, no ring. For Jelly motion Still, where only a few sparks
     * mark the contact. Returns the profile the listeners got.
     */
    emitCalm(e: ImpactEvent): ImpactProfile {
        const full = impactProfile(e.kind, e.power);
        const calm: ImpactProfile = {
            ...full, trauma: 0, hitStopMs: 0, slowMo: 1, slowMoMs: 0, recoil: 0, squash: 0, flash: 0,
            ringSize: 0, ringLife: 0, fovKick: 0, sparks: Math.min(full.sparks, 8),
        };
        for (const fn of this.listeners) fn(e, calm);
        return calm;
    }

    /**
     * Advance the springs, decay trauma. `dt` in seconds (clamped: a hidden tab must not explode a spring).
     * Pass `now` (ms, the same clock `emit` used) and each fighter's springs run on ITS time scale, so a
     * hit-stop freezes the victim mid-recoil and a knockout's slow motion slows the fall; without it they
     * run in real time.
     */
    step(dtRaw: number, now?: number): void {
        const dt = Math.min(0.05, Math.max(0, dtRaw));
        this.clock += dt;
        this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);
        this.fovKick *= Math.exp(-9 * dt);
        if (this.fovKick < 0.01) this.fovKick = 0;
        for (const [seat, r] of this.reactions) {
            const d = now === undefined ? dt : dt * this.timeScaleFor(seat, now);
            // semi-implicit Euler: stable for these constants at d <= 0.05
            r.vx += (-SPRING_K * r.ox - SPRING_C * r.vx) * d; r.ox += r.vx * d;
            r.vz += (-SPRING_K * r.oz - SPRING_C * r.vz) * d; r.oz += r.vz * d;
            r.vsq += (-SPRING_K * r.squash - SPRING_C * r.vsq) * d; r.squash += r.vsq * d;
            r.vlean += (-SPRING_K * r.lean - SPRING_C * r.vlean) * d; r.lean += r.vlean * d;
            r.flash = Math.max(0, r.flash - FLASH_DECAY * d * Math.max(0.3, r.flash));
            if (r.flash < 0.004) r.flash = 0;
        }
    }

    /** Camera shake offset at the bus's own clock. */
    shake(): ShakeSample { return shakeSample(this.trauma, this.clock); }

    /** The reaction state for a seat (zeros when nothing has hit it). Read-only. */
    reaction(seat: number): Readonly<Reaction> { return this.reactions.get(seat) ?? ZERO_REACTION; }

    /**
     * How fast this seat's animation should run at time `now` (ms): ~0 during a hit-stop, easing back to
     * 1 over its last 30 ms, multiplied by the knockout slow motion when one is running.
     */
    timeScaleFor(seat: number, now: number): number {
        let s = 1;
        const until = this.stopUntil.get(seat);
        if (until !== undefined && now < until) {
            const left = until - now;
            s = left > STOP_RELEASE_MS ? STOP_SPEED : STOP_SPEED + (1 - STOP_SPEED) * (1 - left / STOP_RELEASE_MS);
        }
        return s * this.slowScaleAt(now);
    }

    /** The slow-motion factor alone (1 when none) — particles and the camera use it too. */
    slowScaleAt(now: number): number {
        if (now < this.slowFrom || now >= this.slowUntil) return 1;
        const into = now - this.slowFrom;
        const left = this.slowUntil - now;
        const ramp = Math.min(into, left, 120) / 120;       // ease in and out of the slow motion
        return 1 - (1 - this.slowScale) * ramp * ramp * (3 - 2 * ramp);
    }

    private ensure(seat: number): ReactionInternal {
        let r = this.reactions.get(seat);
        if (!r) { r = freshReaction(); this.reactions.set(seat, r); }
        return r;
    }
}

const ZERO_REACTION: Readonly<Reaction> = Object.freeze({
    ox: 0, oz: 0, squash: 0, flash: 0, flashKind: 'hit' as ImpactKind, lean: 0, dirX: 0, dirZ: 1,
});
