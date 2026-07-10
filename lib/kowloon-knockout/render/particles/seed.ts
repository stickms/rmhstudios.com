export interface ParticleBounds {
    /** Cylinder radius around arena center (x/z). */
    radius: number;
    /** Lowest y. */
    floor: number;
    /** Highest y. */
    ceiling: number;
}

export interface SeededField {
    /** xyz interleaved, length = count*3. */
    positions: Float32Array;
    /** xyz interleaved, length = count*3. */
    velocities: Float32Array;
}

/** Deterministic PRNG (mulberry32), matching render/skyline.ts. */
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s |= 0; s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Uniform point in a disc of the given radius → [x, z]. */
function discXZ(rand: () => number, radius: number): [number, number] {
    const r = Math.sqrt(rand()) * radius;     // sqrt → uniform area
    const a = rand() * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
}

/** Rain: filling the cylinder, falling with light wind. */
export function seedRain(count: number, bounds: ParticleBounds, seed = 1): SeededField {
    const rand = rng(seed);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const [x, z] = discXZ(rand, bounds.radius);
        positions[i * 3] = x;
        positions[i * 3 + 1] = bounds.floor + rand() * (bounds.ceiling - bounds.floor);
        positions[i * 3 + 2] = z;
        velocities[i * 3] = (rand() - 0.5) * 1.5;          // wind x
        velocities[i * 3 + 1] = -(9 + rand() * 6);          // fall speed
        velocities[i * 3 + 2] = (rand() - 0.5) * 1.5;       // wind z
    }
    return { positions, velocities };
}

/** Fog: a near-floor band drifting slowly and horizontally. */
export function seedFog(count: number, bounds: ParticleBounds, seed = 1): SeededField {
    const rand = rng(seed);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const [x, z] = discXZ(rand, bounds.radius);
        positions[i * 3] = x;
        positions[i * 3 + 1] = bounds.floor + rand() * (bounds.ceiling - bounds.floor);
        positions[i * 3 + 2] = z;
        velocities[i * 3] = (rand() - 0.5) * 0.6;           // slow horizontal drift
        velocities[i * 3 + 1] = (rand() - 0.5) * 0.1;       // near-zero vertical
        velocities[i * 3 + 2] = (rand() - 0.5) * 0.6;
    }
    return { positions, velocities };
}
