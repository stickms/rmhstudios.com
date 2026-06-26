export interface TowerInstance {
    position: [number, number, number];
    scale: [number, number, number];
    color: [number, number, number];
}

/** Deterministic PRNG (mulberry32) so layouts are stable per seed without
 *  Math.random (which is also banned in some of our tooling contexts). */
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s |= 0; s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const NEON: [number, number, number][] = [
    [1.0, 0.2, 0.4], [0.2, 0.8, 1.0], [1.0, 0.8, 0.0],
    [0.2, 1.0, 0.6], [0.8, 0.2, 1.0], [1.0, 0.4, 0.2],
];

/** One TowerInstance[] per layer. Layer 0 is nearest; each subsequent layer is
 *  farther (larger radius), more numerous, and darker (color lerped toward
 *  black) to fake atmospheric/fog depth. */
export function generateSkyline(seed: number, layers: number): TowerInstance[][] {
    const out: TowerInstance[][] = [];
    for (let layer = 0; layer < layers; layer++) {
        const rand = rng(seed * 1000 + layer);
        const baseRadius = 22 + layer * 18;
        const count = 36 + layer * 18;
        const fog = layer / Math.max(1, layers - 1); // 0 near → 1 far
        const dim = 1 - fog * 0.7;                    // far layers up to 70% darker
        const ring: TowerInstance[] = [];
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + rand() * 0.12;
            const dist = baseRadius + rand() * 14;
            const h = 8 + rand() * (30 + layer * 18);
            const w = 2.5 + rand() * 3.5;
            const base = NEON[Math.floor(rand() * NEON.length)];
            ring.push({
                position: [Math.cos(a) * dist, h / 2 - 1, Math.sin(a) * dist],
                scale: [w, h, w],
                color: [base[0] * dim, base[1] * dim, base[2] * dim],
            });
        }
        out.push(ring);
    }
    return out;
}
