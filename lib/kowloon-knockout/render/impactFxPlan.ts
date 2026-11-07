// ============================================================
// What an impact draws — the plan, decided apart from any renderer.
//
// `planImpactFx` turns an ImpactEvent + its ImpactProfile into plain numbers: which rings, the contact
// flash and the spark volleys to spawn. The ImpactFx component only executes it into pools, so every
// decision (a block is a tight cool shower and a small hard ring, a hit's sparks fly along the blow in
// the attacker's colour, a knockout is one huge golden ring) is unit-tested.
// ============================================================
import { powerWeight, type ImpactEvent, type ImpactProfile } from './impact';

export interface RingPlan {
    /** `ground`: flat shockwave at the victim's feet. `contact`: a ring facing the camera at the contact point. */
    kind: 'ground' | 'contact';
    size: number;
    life: number;
    color: string;
}

export interface FlashPlan { size: number; life: number; color: string }

export interface SparkPlan {
    count: number;
    /** Metres per second, min..max. */
    speedMin: number;
    speedMax: number;
    /** Half-angle of the cone around the blow direction, as a 0..1 spread (0 = laser, 1 = every way). */
    spread: number;
    /** Upward bias added to the direction (0..1). */
    up: number;
    dirX: number;
    dirZ: number;
    lifeMin: number;
    lifeMax: number;
    color: string;
}

export interface FxPlan {
    rings: RingPlan[];
    flash: FlashPlan | null;
    sparks: SparkPlan[];
}

export interface PlanOptions {
    /** Sparks this scene can still afford (the pool's free slots). */
    sparkBudget: number;
    /** A cheaper rendition for weak devices: no contact ring. */
    lite: boolean;
}

export const BLOCK_COLOR = '#bfe9ff';
export const KO_COLOR = '#ffcc00';
export const KO_SPARK_COLOR = '#fff2b0';
export const DEFAULT_HIT_COLOR = '#ffcc00';

export function planImpactFx(e: ImpactEvent, prof: ImpactProfile, opts: PlanOptions): FxPlan {
    const w = powerWeight(e.power);
    const rings: RingPlan[] = [];
    let flash: FlashPlan | null = null;
    const sparks: SparkPlan[] = [];
    const budget = Math.max(0, Math.floor(opts.sparkBudget));
    const take = (n: number) => Math.min(n, budget);

    const dir = { dirX: e.dirX, dirZ: e.dirZ };
    const hitColor = e.color || DEFAULT_HIT_COLOR;

    if (e.kind === 'ko') {
        if (prof.ringSize > 0) {
            rings.push({ kind: 'ground', size: prof.ringSize, life: prof.ringLife, color: KO_COLOR });
            if (!opts.lite) rings.push({ kind: 'contact', size: prof.ringSize * 0.5, life: prof.ringLife * 0.45, color: KO_SPARK_COLOR });
        }
        if (prof.flash > 0) flash = { size: 0.9, life: 0.16, color: KO_SPARK_COLOR };
        // Everything flies: a big omnidirectional burst, with a ring of heavier gold streaks.
        sparks.push({ count: take(prof.sparks), speedMin: 4, speedMax: 11, spread: 1, up: 0.5, ...dir, lifeMin: 0.45, lifeMax: 0.9, color: KO_SPARK_COLOR });
        return { rings, flash, sparks };
    }

    if (e.kind === 'block') {
        if (prof.ringSize > 0) {
            // A small hard ring at the guard, nothing on the ground: the blow did not get through.
            rings.push({ kind: 'contact', size: prof.ringSize, life: prof.ringLife, color: BLOCK_COLOR });
        }
        if (prof.flash > 0) flash = { size: 0.22 + 0.1 * w, life: 0.09, color: BLOCK_COLOR };
        // A tight, fast, forward shower along the blow, cool white-blue.
        sparks.push({
            count: take(prof.sparks), speedMin: 4.5 + 2 * w, speedMax: 9 + 3 * w, spread: 0.28, up: 0.25, ...dir,
            lifeMin: 0.18, lifeMax: 0.34, color: BLOCK_COLOR,
        });
        return { rings, flash, sparks };
    }

    // A hit: a ground shockwave, a bright contact flash and ring, sparks along the blow in the attacker's colour,
    // with a few hot white ones among them.
    if (prof.ringSize > 0) {
        rings.push({ kind: 'ground', size: prof.ringSize, life: prof.ringLife, color: hitColor });
        if (!opts.lite) rings.push({ kind: 'contact', size: prof.ringSize * 0.42, life: 0.2 + 0.08 * w, color: '#ffffff' });
    }
    if (prof.flash > 0) flash = { size: 0.3 + 0.35 * w, life: 0.12, color: '#fff6e0' };
    const total = take(prof.sparks);
    const hot = Math.round(total * 0.25);
    sparks.push({
        count: total - hot, speedMin: 3.2 + 2 * w, speedMax: 7 + 5 * w, spread: 0.55, up: 0.35, ...dir,
        lifeMin: 0.28, lifeMax: 0.55, color: hitColor,
    });
    if (hot > 0) {
        sparks.push({
            count: hot, speedMin: 5 + 3 * w, speedMax: 10 + 5 * w, spread: 0.4, up: 0.3, ...dir,
            lifeMin: 0.2, lifeMax: 0.4, color: '#ffffff',
        });
    }
    return { rings, flash, sparks };
}

// ── Motion curves ──────────────────────────────────────────────────────────────

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A ring's radius and brightness `age` seconds into its `life`: it flies out fast and slows (ease-out) while fading. */
export function ringAt(age: number, life: number, size: number): { radius: number; fade: number } {
    const u = clamp01(life > 0 ? age / life : 1);
    const out = 1 - (1 - u) ** 3;
    return { radius: size * out, fade: (1 - u) ** 1.6 };
}

/** The contact flash: a quick swell and a fade (radius up to `size`, brightness down). */
export function flashAt(age: number, life: number, size: number): { radius: number; fade: number } {
    const u = clamp01(life > 0 ? age / life : 1);
    return { radius: size * (0.35 + 0.65 * Math.sqrt(u)), fade: (1 - u) ** 2 };
}

/**
 * A spark's launch velocity for volley `plan`, given three uniform randoms in 0..1. The direction is the
 * blow direction plus `up`, blurred by `spread` (a cone, not a fan); the result is NOT unit length — it is
 * scaled by the chosen speed.
 */
export function sparkVelocity(plan: SparkPlan, r1: number, r2: number, r3: number): [number, number, number] {
    const speed = plan.speedMin + (plan.speedMax - plan.speedMin) * r1;
    const dl = Math.hypot(plan.dirX, plan.dirZ) || 1;
    // base direction on the ground plane, with the upward bias
    let x = plan.dirX / dl;
    let y = plan.up;
    let z = plan.dirZ / dl;
    // random vector in a ball, scaled by the spread (r2 → azimuth, r3 → elevation/length)
    const az = r2 * Math.PI * 2;
    const el = (r3 * 2 - 1) * Math.PI * 0.5;
    const ce = Math.cos(el);
    x += Math.cos(az) * ce * plan.spread;
    y += Math.sin(el) * plan.spread;
    z += Math.sin(az) * ce * plan.spread;
    const l = Math.hypot(x, y, z) || 1;
    return [(x / l) * speed, (y / l) * speed, (z / l) * speed];
}

/** Streak length (m) for a spark moving at `speed` m/s: faster sparks draw longer, capped so none is a pole. */
export function streakLength(speed: number): number {
    return Math.min(0.9, Math.max(0.05, speed * 0.055));
}
