/**
 * Danmaku pattern emitters.
 *
 * A pattern is a pure-ish function called once per frame while its emitter is
 * active. It decides what to fire based on `t` (frames since the emitter's
 * phase began) and the shared RNG, then spawns bullets through `fire`. Keeping
 * emission keyed on `t` (not on accumulated state) makes a client's field
 * reproducible and lets the boss's spell timer drive everything.
 *
 * Hitboxes and bullet sizing are deliberately tuned to be *fair*: collision
 * radii are noticeably smaller than the drawn sprite (the Touhou convention),
 * so grazing reads as close but survivable.
 */

import type { Bullet, BulletColorName, BulletShape, DifficultyMul, PatternId, Vec2 } from '../types';
import { bulletRadius } from '../render/bullets';
import { Rng } from '../rng';
import { PLAYFIELD_W } from '../constants';

export interface FireOpts {
    x?: number;
    y?: number;
    angle: number;
    speed: number;
    shape?: BulletShape;
    color?: BulletColorName;
    radius?: number; // collision radius override
    accel?: number;
    angularVel?: number;
    minSpeed?: number;
    maxSpeed?: number;
    ttl?: number;
    spin?: number;
}

export interface PatternCtx {
    /** Frames since this emitter's phase/spell started. */
    t: number;
    x: number;
    y: number;
    rng: Rng;
    diff: DifficultyMul;
    /** Nearest living player (target for aimed fire), or playfield centre-bottom. */
    target: Vec2;
    themeColors: BulletColorName[];
    fire: (o: FireOpts) => Bullet | null;
}

const TAU = Math.PI * 2;

function aimAngle(ctx: PatternCtx): number {
    return Math.atan2(ctx.target.y - ctx.y, ctx.target.x - ctx.x);
}

/**
 * Aim at the player, but on lower difficulties scatter the shot a little so
 * aimed fire is forgiving (gives you room to drift); on Lunatic it's exact.
 */
function aim(ctx: PatternCtx): number {
    return aimAngle(ctx) + ctx.rng.spread(ctx.diff.aimError);
}

/**
 * Effective firing period for a base cadence, scaled by the difficulty's
 * fireRate (Easy fires less often, Lunatic more). Floored so heavy patterns
 * never collapse into an undodgeable solid stream.
 */
function every(ctx: PatternCtx, base: number, floor = 3): number {
    return Math.max(floor, Math.round(base / ctx.diff.fireRate));
}

/** Collision radius is ~62% of the visual radius — close grazes stay survivable. */
function hitR(shape: BulletShape): number {
    return Math.max(2.2, bulletRadius(shape) * 0.62);
}

/**
 * Ring bullet count scaled by difficulty but capped so adjacent bullets always
 * leave a navigable angular gap — a dense ring with no seam is never fair.
 */
function ringCount(ctx: PatternCtx, base: number, max = 30): number {
    return Math.max(3, Math.min(max, Math.round(base * ctx.diff.bulletCount)));
}

function fanCount(ctx: PatternCtx, base: number, max = 13): number {
    return Math.max(1, Math.min(max, Math.round(base)));
}

function fan(ctx: PatternCtx, count: number, center: number, spread: number, speed: number, o: Partial<FireOpts>): void {
    if (count <= 1) {
        ctx.fire({ angle: center, speed, ...o });
        return;
    }
    const start = center - spread / 2;
    const step = spread / (count - 1);
    for (let i = 0; i < count; i++) ctx.fire({ angle: start + step * i, speed, ...o });
}

function ring(ctx: PatternCtx, count: number, offset: number, speed: number, o: Partial<FireOpts>): void {
    for (let i = 0; i < count; i++) ctx.fire({ angle: offset + (TAU / count) * i, speed, ...o });
}

function pick(ctx: PatternCtx, i: number): BulletColorName {
    return ctx.themeColors[((i % ctx.themeColors.length) + ctx.themeColors.length) % ctx.themeColors.length];
}

// ─── Enemy patterns ───

const enemyPatterns: Record<string, (c: PatternCtx) => void> = {
    none() {},
    aimed3(c) {
        if (c.t % every(c, 46, 18) === 0) fan(c, 3, aim(c), 0.35, 2.0 * c.diff.bulletSpeed, { shape: 'pellet', color: pick(c, 0), radius: hitR('pellet') });
    },
    aimed5(c) {
        if (c.t % every(c, 54, 22) === 0) fan(c, fanCount(c, 3 + 2 * c.diff.bulletCount, 9), aim(c), 0.5, 2.2 * c.diff.bulletSpeed, { shape: 'rice', color: pick(c, 1), radius: hitR('rice') });
    },
    ring8(c) {
        if (c.t % every(c, 70, 26) === 0) ring(c, ringCount(c, 8, 22), c.rng.next() * TAU, 1.7 * c.diff.bulletSpeed, { shape: 'orb', color: pick(c, 0), radius: hitR('orb') });
    },
    spreadDown(c) {
        // Wide downward fan — aimed slightly off-centre so a still target always
        // has an out, and never a full-width wall.
        if (c.t % every(c, 40, 18) === 0) fan(c, fanCount(c, 4 * c.diff.bulletCount, 9), Math.PI / 2 + c.rng.spread(0.18), 0.7, 1.9 * c.diff.bulletSpeed, { shape: 'pellet', color: pick(c, 2), radius: hitR('pellet') });
    },
    spiralSmall(c) {
        if (c.t % every(c, 6, 4) === 0) {
            const a = c.t * 0.4;
            arm(c, a, 1.8);
            arm(c, a + Math.PI, 1.8);
        }
        function arm(cc: PatternCtx, ang: number, sp: number) {
            cc.fire({ angle: ang, speed: sp * cc.diff.bulletSpeed, shape: 'pellet', color: pick(cc, 0), radius: hitR('pellet') });
        }
    },
};

// ─── Boss patterns ───

const bossPatterns: Record<string, (c: PatternCtx) => void> = {
    // Generic non-spell: slow rotating rings + occasional aimed spray
    'nonspell-petals'(c) {
        if (c.t % every(c, 26, 14) === 0) {
            ring(c, ringCount(c, 10, 26), (c.t * 0.05) % TAU, 1.6 * c.diff.bulletSpeed, { shape: 'orb', color: pick(c, (c.t / 26) | 0), radius: hitR('orb') });
        }
        if (c.t % every(c, 90, 48) === 45 % every(c, 90, 48)) fan(c, fanCount(c, 5, 9), aim(c), 0.6, 2.4 * c.diff.bulletSpeed, { shape: 'rice', color: pick(c, 1), radius: hitR('rice') });
    },

    // STAGE 1 — Shrine
    'spell-spiralRose'(c) {
        if (c.t % every(c, 4, 3) === 0) {
            const arms = 5;
            const base = c.t * 0.13;
            for (let a = 0; a < arms; a++) {
                c.fire({ angle: base + (TAU / arms) * a, speed: (1.5 + Math.sin(c.t * 0.05) * 0.5) * c.diff.bulletSpeed, shape: 'orb', color: pick(c, a), radius: hitR('orb'), spin: 0.1 });
            }
        }
    },
    'spell-fanBarrage'(c) {
        if (c.t % every(c, 60, 34) === 0) {
            const a = aim(c);
            for (let r = 0; r < 4; r++) {
                fan(c, fanCount(c, 5 + 2 * c.diff.bulletCount, 11), a, 0.55, (1.6 + r * 0.3) * c.diff.bulletSpeed, { shape: 'kunai', color: pick(c, r), radius: hitR('kunai') });
            }
        }
        if (c.t % every(c, 12, 6) === 0) ring(c, ringCount(c, 16, 26), c.rng.next() * TAU, 1.2 * c.diff.bulletSpeed, { shape: 'pellet', color: pick(c, 0), radius: hitR('pellet') });
    },
    'spell-amuletRain'(c) {
        if (c.t % every(c, 8, 5) === 0) {
            const x = c.rng.range(20, PLAYFIELD_W - 20);
            c.fire({ x, y: 0, angle: Math.PI / 2 + c.rng.spread(0.25), speed: 1.6 * c.diff.bulletSpeed, shape: 'amulet', color: pick(c, 1), radius: hitR('amulet'), spin: 0.05 });
        }
        if (c.t % every(c, 70, 40) === 35 % every(c, 70, 40)) fan(c, fanCount(c, 7, 9), aim(c), 0.9, 2.2 * c.diff.bulletSpeed, { shape: 'orb', color: pick(c, 0), radius: hitR('orb') });
    },

    // STAGE 2 — Sea
    'nonspell-tide'(c) {
        if (c.t % every(c, 20, 12) === 0) {
            const dir = (c.t / 20) % 2 === 0 ? 1 : -1;
            const n = ringCount(c, 9, 16);
            for (let i = 0; i < n; i++) {
                const a = Math.PI / 2 + dir * (-0.7 + (1.4 * i) / (n - 1));
                c.fire({ angle: a, speed: 2.0 * c.diff.bulletSpeed, shape: 'orb', color: pick(c, 0), radius: hitR('orb') });
            }
        }
    },
    'spell-bubbleStream'(c) {
        if (c.t % every(c, 18, 10) === 0) {
            const a = aim(c) + c.rng.spread(0.2);
            c.fire({ angle: a, speed: 1.1 * c.diff.bulletSpeed, shape: 'bubble', color: pick(c, 2), radius: hitR('bubble') });
        }
        if (c.t % every(c, 5, 4) === 0) {
            const a = c.t * 0.21;
            ring(c, ringCount(c, 3, 6), a, 1.7 * c.diff.bulletSpeed, { shape: 'pellet', color: pick(c, 1), radius: hitR('pellet') });
        }
    },
    'spell-whirlpool'(c) {
        if (c.t % every(c, 3, 3) === 0) {
            const a = c.t * 0.22;
            c.fire({ angle: a, speed: 2.4 * c.diff.bulletSpeed, angularVel: 0.012, shape: 'rice', color: pick(c, c.t & 1 ? 0 : 1), radius: hitR('rice') });
            c.fire({ angle: -a, speed: 2.4 * c.diff.bulletSpeed, angularVel: -0.012, shape: 'rice', color: pick(c, 2), radius: hitR('rice') });
        }
    },
    'spell-crossWaves'(c) {
        if (c.t % every(c, 44, 26) === 0) {
            for (let q = 0; q < 4; q++) {
                fan(c, fanCount(c, 6 * c.diff.bulletCount, 11), (TAU / 4) * q + Math.sin(c.t * 0.03), 0.5, 1.9 * c.diff.bulletSpeed, { shape: 'star', color: pick(c, q), radius: hitR('star') });
            }
        }
    },

    // STAGE 3 — Astral
    'nonspell-starfall'(c) {
        if (c.t % every(c, 16, 10) === 0) {
            const n = ringCount(c, 7, 12);
            for (let i = 0; i < n; i++) {
                const x = (PLAYFIELD_W / n) * (i + 0.5) + c.rng.spread(8);
                c.fire({ x, y: 0, angle: Math.PI / 2, speed: 2.1 * c.diff.bulletSpeed, shape: 'star', color: pick(c, i), radius: hitR('star'), spin: 0.12 });
            }
        }
        if (c.t % every(c, 80, 46) === 40 % every(c, 80, 46)) fan(c, fanCount(c, 5, 9), aim(c), 0.5, 2.6 * c.diff.bulletSpeed, { shape: 'kunai', color: pick(c, 0), radius: hitR('kunai') });
    },
    'spell-galaxySpiral'(c) {
        if (c.t % every(c, 3, 3) === 0) {
            const arms = 4;
            const base = c.t * 0.09;
            for (let a = 0; a < arms; a++) {
                c.fire({ angle: base + (TAU / arms) * a, speed: 1.9 * c.diff.bulletSpeed, angularVel: -0.006, shape: 'orb', color: pick(c, a), radius: hitR('orb') });
                c.fire({ angle: -base + (TAU / arms) * a, speed: 1.9 * c.diff.bulletSpeed, angularVel: 0.006, shape: 'star', color: pick(c, a + 1), radius: hitR('star') });
            }
        }
    },
    'spell-novaRings'(c) {
        const period = every(c, 70, 44);
        if (c.t % period === 0) {
            ring(c, ringCount(c, 24, 30), ((c.t / period) * 0.2) % TAU, 2.4 * c.diff.bulletSpeed, { shape: 'orbL', color: pick(c, (c.t / period) | 0), radius: hitR('orbL'), accel: -0.02, minSpeed: 0.6 });
        }
        // Aimed pacer — kept at a fair cadence so it reads as pressure, not a wall.
        if (c.t % every(c, 10, 8) === 0) c.fire({ angle: aim(c), speed: 3.0 * c.diff.bulletSpeed, shape: 'pellet', color: pick(c, 2), radius: hitR('pellet') });
    },
    'spell-voidLances'(c) {
        if (c.t % every(c, 50, 30) === 0) {
            const a = aim(c);
            for (let i = -3; i <= 3; i++) {
                c.fire({ angle: a + i * 0.12, speed: 1.0, accel: 0.07, maxSpeed: 4.2, shape: 'knife', color: pick(c, 0), radius: hitR('knife') });
            }
        }
        if (c.t % every(c, 9, 6) === 0) ring(c, ringCount(c, 12, 24), c.t * 0.08, 1.4 * c.diff.bulletSpeed, { shape: 'orb', color: pick(c, 1), radius: hitR('orb') });
    },
    'spell-finale'(c) {
        // everything at once — climactic survival
        if (c.t % every(c, 4, 3) === 0) {
            const base = c.t * 0.11;
            for (let a = 0; a < 6; a++) c.fire({ angle: base + (TAU / 6) * a, speed: 2.0 * c.diff.bulletSpeed, angularVel: 0.004, shape: 'orb', color: pick(c, a), radius: hitR('orb') });
        }
        if (c.t % every(c, 36, 22) === 0) ring(c, ringCount(c, 20, 28), c.rng.next() * TAU, 2.6 * c.diff.bulletSpeed, { shape: 'star', color: pick(c, 2), radius: hitR('star') });
        if (c.t % every(c, 14, 10) === 0) c.fire({ angle: aim(c), speed: 3.2 * c.diff.bulletSpeed, shape: 'kunai', color: pick(c, 0), radius: hitR('kunai') });
    },
};

const ALL: Record<string, (c: PatternCtx) => void> = { ...enemyPatterns, ...bossPatterns };

export function runPattern(id: PatternId, ctx: PatternCtx): void {
    const fn = ALL[id];
    if (fn) fn(ctx);
}

export function patternExists(id: PatternId): boolean {
    return id in ALL;
}
