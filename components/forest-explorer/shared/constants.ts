import { CatmullRomCurve3, Vector3 } from 'three';

// ─── Deterministic RNG ──────────────────────────────────────────────────────
// Computed once at module load — used everywhere for reproducible terrain.

export const SCENE_RNG = (n: number) => {
    const x = Math.sin(n + 1) * 43758.5453;
    return x - Math.floor(x);
};

// 22% of trees are ancient giants (scale 1.80–2.55), rest are normal (0.45–1.35).
// MUST be used by both ForestScene and TREE_COLLIDERS to keep collision radii in sync.
export const TREE_SCALE = (s: number): number => {
    const giant = SCENE_RNG(s + 4) < 0.22;
    return giant
        ? 1.8 + SCENE_RNG(s + 2) * 0.75   // 1.80 – 2.55
        : 0.45 + SCENE_RNG(s + 2) * 0.90;  // 0.45 – 1.35
};

// ─── River data ──────────────────────────────────────────────────────────────
// Gentle S-curve from SW to NE, avoiding the pond at (28, -22).
// Must be defined BEFORE TREE_COLLIDERS so tree filtering can use distToRiver.

export const RIVER_POINTS: [number, number, number][] = [
    [-85, 0, -85],
    [-45, 0, -35],
    [-20, 0, -5],
    [10, 0, 15],
    [35, 0, 40],
    [85, 0, 85],
];

export const RIVER_WIDTH = 8;
export const RIVER_HALF_WIDTH = RIVER_WIDTH / 2;

export const RIVER_CURVE = new CatmullRomCurve3(
    RIVER_POINTS.map(([x, y, z]) => new Vector3(x, y, z)),
    false,
    'catmullrom',
    0.5,
);

// Pre-sample curve for fast distance checks
const RIVER_SAMPLES = 200;
export const RIVER_SAMPLE_POINTS: Vector3[] = [];
for (let i = 0; i <= RIVER_SAMPLES; i++) {
    RIVER_SAMPLE_POINTS.push(RIVER_CURVE.getPoint(i / RIVER_SAMPLES));
}

export function distToRiver(x: number, z: number): number {
    let minDist = Infinity;
    for (const p of RIVER_SAMPLE_POINTS) {
        const dx = x - p.x, dz = z - p.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < minDist) minDist = d;
    }
    return minDist;
}

// Bridge positions along the curve (parameter 0-1)
export const BRIDGE_PARAMS = [0.25, 0.55, 0.80];
export const BRIDGE_WIDTH = 3.5;
export const BRIDGE_LENGTH = RIVER_WIDTH + 1.5;

export function isOnBridge(x: number, z: number): boolean {
    for (const t of BRIDGE_PARAMS) {
        const bp = RIVER_CURVE.getPoint(t);
        const tangent = RIVER_CURVE.getTangent(t);
        const dx = x - bp.x, dz = z - bp.z;
        // Project onto tangent (along bridge) and perpendicular (across bridge)
        const along = dx * tangent.x + dz * tangent.z;
        const perp = dx * (-tangent.z) + dz * tangent.x;
        if (Math.abs(along) < BRIDGE_WIDTH / 2 && Math.abs(perp) < BRIDGE_LENGTH / 2) {
            return true;
        }
    }
    return false;
}

// ─── Player position (shared mutable ref for torch light culling) ────────────
export const PLAYER_POS = { x: 0, z: 0 };

// ─── Tree colliders (filtered to exclude river overlap) ──────────────────────

export const TREE_COLLIDERS: { x: number; z: number; r: number }[] = (() => {
    const out: { x: number; z: number; r: number }[] = [];
    for (let i = 0; i < 240; i++) {
        const s = i * 7.331;
        const angle = SCENE_RNG(s) * Math.PI * 2;
        const minR = i < 30 ? 7 : 15;
        const radius = minR + SCENE_RNG(s + 1) * 95;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        if (distToRiver(x, z) < RIVER_HALF_WIDTH + 1.5) continue;
        out.push({
            x,
            z,
            r: 0.28 * TREE_SCALE(s) + 0.45,
        });
    }
    return out;
})();

// ─── Player physics ──────────────────────────────────────────────────────────
export const GROUND_Y = 1.7;
export const GRAVITY = 22;
export const JUMP_VEL = 9;
