'use client';

import { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Mesh, type MeshStandardMaterial, type PointLight } from 'three';
import { useStoryStore } from '@/lib/forest-explorer/store';
import type { CorridorSegment } from '@/lib/forest-explorer/types';
import { useRenderQuality } from '@/lib/render/useRenderQuality';

interface CorridorLanternsProps {
    corridors: CorridorSegment[];
    /** Flame color, act-themed (act1 cool blue-green, act2 amber, act3 gold) */
    color?: string;
    spacing?: number;
}

/**
 * The Warden's lanterns: hanging lanterns on wooden posts along the story
 * paths. They are the wayfinding thread of the story ("follow the lanterns")
 * and replace the free-roam tiki torches, which were placed against the
 * explore map's colliders and didn't fit the act maps.
 *
 * Lighting cost is bounded two ways. Each lantern already culled its own light
 * by player distance, but that alone leaves the *count* unbounded — a corridor
 * junction can put many lanterns inside the radius at once, and in three every
 * visible point light both adds a per-fragment term to every lit material and
 * changes NUM_POINT_LIGHTS, which is part of the shader program cache key. So a
 * single pass here ranks lanterns by distance and lights only the nearest few,
 * capped by render tier: the fragment cost stops scaling with corridor density
 * and the renderer settles on a small set of shader permutations.
 */
export function CorridorLanterns({ corridors, color = '#7fd4a8', spacing = 18 }: CorridorLanternsProps) {
    const lanterns = useMemo(() => {
        const out: Array<{ pos: [number, number, number]; phase: number }> = [];
        let id = 0;
        for (const c of corridors) {
            const [sx, sz] = c.start;
            const [ex, ez] = c.end;
            const dx = ex - sx, dz = ez - sz;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len < 1) continue;
            const nx = -dz / len, nz = dx / len;
            const steps = Math.max(1, Math.floor(len / spacing));
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                // Alternate sides of the path
                const side = (id % 2 === 0 ? 1 : -1) * (c.width * 0.5 + 0.6);
                out.push({
                    pos: [sx + dx * t + nx * side, 0, sz + dz * t + nz * side],
                    phase: id * 1.37,
                });
                id++;
            }
        }
        return out;
    }, [corridors, spacing]);

    const { quality } = useRenderQuality();
    const maxLights = LIT_LANTERNS[quality.shadows ? (quality.postProcessing ? 'high' : 'medium') : 'low'];

    // Which lantern indices currently get a live light. Mutated in place by the
    // coordinator below and read by each Lantern's own frame callback, so
    // re-ranking never triggers a React render.
    const lit = useRef<Set<number>>(new Set());

    return (
        <>
            <LanternLightBudget lanterns={lanterns} lit={lit} max={maxLights} />
            {lanterns.map((l, i) => (
                <Lantern key={i} index={i} position={l.pos} phase={l.phase} color={color} lit={lit} />
            ))}
        </>
    );
}

/** Nearest-N lantern lights per render tier. */
const LIT_LANTERNS = { low: 2, medium: 4, high: 6 } as const;

/**
 * Ranks lanterns by distance to the player and records the nearest `max` in the
 * shared `lit` set. Renders nothing; runs once per frame instead of once per
 * lantern, so the work is O(n) rather than O(n) independent decisions that can't
 * see each other.
 */
function LanternLightBudget({
    lanterns, lit, max,
}: {
    lanterns: Array<{ pos: [number, number, number] }>;
    lit: MutableRefObject<Set<number>>;
    max: number;
}) {
    const ranked = useRef<Array<{ i: number; d: number }>>([]);
    const frame = useRef(0);

    useFrame(() => {
        // Re-ranking every 6th frame is imperceptible at walking speed and keeps
        // this off the hot path.
        if (frame.current++ % 6 !== 0) return;
        const player = useStoryStore.getState().playerPosition;
        const list = ranked.current;
        list.length = 0;
        for (let i = 0; i < lanterns.length; i++) {
            const dx = lanterns[i].pos[0] - player[0];
            const dz = lanterns[i].pos[2] - player[2];
            const d = dx * dx + dz * dz;
            if (d < 1600) list.push({ i, d }); // 40m gate, as before
        }
        list.sort((a, b) => a.d - b.d);
        const next = lit.current;
        next.clear();
        for (let k = 0; k < Math.min(max, list.length); k++) next.add(list[k].i);
    });

    return null;
}

function Lantern({ index, position, phase, color, lit }: {
    index: number;
    position: [number, number, number];
    phase: number;
    color: string;
    lit: MutableRefObject<Set<number>>;
}) {
    const coreRef = useRef<Mesh>(null);
    const lightRef = useRef<PointLight>(null);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        const breathe = Math.sin(t * 2.2 + phase) * 0.3 + Math.sin(t * 5.1 + phase * 2) * 0.15;

        // The glow always breathes — it is an emissive material, not a light,
        // so distant lanterns still read as lit without costing a light slot.
        if (coreRef.current) {
            const mat = coreRef.current.material as MeshStandardMaterial;
            mat.emissiveIntensity = 1.1 + breathe;
        }
        if (lightRef.current) {
            const on = lit.current.has(index);
            lightRef.current.visible = on;
            if (on) lightRef.current.intensity = 1.6 + breathe * 0.8;
        }
    });

    return (
        <group position={position}>
            {/* Post with crook arm */}
            <mesh position={[0, 1.15, 0]} castShadow>
                <cylinderGeometry args={[0.05, 0.07, 2.3, 5]} />
                <meshLambertMaterial color="#4a3823" />
            </mesh>
            <mesh position={[0.22, 2.28, 0]} rotation={[0, 0, -0.9]}>
                <cylinderGeometry args={[0.04, 0.05, 0.55, 5]} />
                <meshLambertMaterial color="#4a3823" />
            </mesh>
            {/* Hanging lantern cage */}
            <group position={[0.42, 2.05, 0]}>
                <mesh>
                    <boxGeometry args={[0.2, 0.28, 0.2]} />
                    <meshLambertMaterial color="#332a1a" transparent opacity={0.5} />
                </mesh>
                <mesh position={[0, 0.17, 0]}>
                    <coneGeometry args={[0.16, 0.12, 4]} />
                    <meshLambertMaterial color="#2c2415" />
                </mesh>
                {/* Glowing core */}
                <mesh ref={coreRef}>
                    <sphereGeometry args={[0.075, 8, 6]} />
                    <meshStandardMaterial
                        color={color}
                        emissive={color}
                        emissiveIntensity={1.1}
                    />
                </mesh>
                <pointLight ref={lightRef} color={color} intensity={1.6} distance={12} decay={2} />
            </group>
        </group>
    );
}
