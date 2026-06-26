export type SignPattern = 'pulse' | 'scroll' | 'dropout';

export interface SignAnim {
    phase: number;
    speed: number;
    pattern: SignPattern;
}

const PATTERNS: SignPattern[] = ['pulse', 'scroll', 'dropout'];

/** Deterministic hash of an integer to [0, 1). */
function hash01(n: number): number {
    let t = (n ^ 0x9e3779b9) >>> 0;
    t = Math.imul(t ^ (t >>> 16), 0x45d9f3b);
    t = Math.imul(t ^ (t >>> 16), 0x45d9f3b);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/** Per-sign animation parameters, stable per index so the TSL material graph
 *  in Skyline.tsx can desync each sign without storing per-frame state. */
export function signAnim(index: number): SignAnim {
    const a = hash01(index * 2 + 1);
    const b = hash01(index * 2 + 7);
    return {
        phase: a * Math.PI * 2,
        speed: 0.5 + b * 2.5,
        pattern: PATTERNS[Math.floor(hash01(index * 13 + 3) * PATTERNS.length)],
    };
}
