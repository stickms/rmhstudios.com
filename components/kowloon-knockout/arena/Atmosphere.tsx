'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { useRenderTier } from './RenderTierContext';
import { NEON_PALETTE } from './materials';

interface Shaft {
    pos: [number, number, number];
    rot: [number, number, number];
    color: string;
    rate: number;
    phase: number;
}

/** Atmosphere layer (ultra/high only): additive neon light shafts leaning in
 *  from the ring, opacity flickered per-shaft in useFrame.
 *
 *  The shafts are plain additive cone meshes — no uncertain shader API — so the
 *  mood lands deterministically. Ground haze (a time-scrolled TSL soft-noise
 *  alpha plane) is a deliberate follow-up: it is browser-only verifiable and
 *  the one genuinely-novel TSL bit, so it is omitted here rather than shipped
 *  unverified (same headless-safe stance as the Skyline signage path). */
export default function Atmosphere() {
    const { flags } = useRenderTier();
    const groupRef = useRef<THREE.Group>(null);

    // 5 deterministic shafts leaning down from neon clusters around the ring.
    const shafts = useMemo<Shaft[]>(() => {
        const out: Shaft[] = [];
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            out.push({
                pos: [Math.cos(a) * 9, 7, Math.sin(a) * 9],
                rot: [0, -a, Math.PI + 0.25],          // cone points down-and-inward
                color: NEON_PALETTE[i % NEON_PALETTE.length],
                rate: 1.5 + i * 0.4,                    // desynced flicker rate
                phase: i * 1.3,
            });
        }
        return out;
    }, []);

    // Flicker each shaft's opacity (cheap, no shader): subtle, additive.
    useFrame((state) => {
        const g = groupRef.current;
        if (!g) return;
        const t = state.clock.elapsedTime;
        g.children.forEach((child, i) => {
            const mesh = child as THREE.Mesh;
            const mat = mesh.material as THREE.MeshBasicMaterial;
            const s = shafts[i];
            if (s) mat.opacity = 0.06 + 0.03 * (0.5 + 0.5 * Math.sin(t * s.rate + s.phase));
        });
    });

    if (!flags.atmosphere) return null;

    return (
        <group ref={groupRef}>
            {shafts.map((s, i) => (
                <mesh key={i} position={s.pos} rotation={s.rot}>
                    {/* tall thin cone = light shaft */}
                    <coneGeometry args={[2.2, 9, 16, 1, true]} />
                    <meshBasicMaterial
                        color={s.color}
                        transparent
                        opacity={0.08}
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                        side={THREE.DoubleSide}
                        toneMapped={false}
                    />
                </mesh>
            ))}
        </group>
    );
}
