'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Mesh, type MeshStandardMaterial, type PointLight } from 'three';
import { useStoryStore } from '@/lib/forest-explorer/store';
import type { CorridorSegment } from '@/lib/forest-explorer/types';

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
 * Point lights cull by player distance so only nearby lanterns cost anything.
 */
export function CorridorLanterns({ corridors, color = '#7fd4a8', spacing = 22 }: CorridorLanternsProps) {
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

    return (
        <>
            {lanterns.map((l, i) => (
                <Lantern key={i} position={l.pos} phase={l.phase} color={color} />
            ))}
        </>
    );
}

function Lantern({ position, phase, color }: { position: [number, number, number]; phase: number; color: string }) {
    const coreRef = useRef<Mesh>(null);
    const lightRef = useRef<PointLight>(null);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        const breathe = Math.sin(t * 2.2 + phase) * 0.3 + Math.sin(t * 5.1 + phase * 2) * 0.15;

        if (coreRef.current) {
            const mat = coreRef.current.material as MeshStandardMaterial;
            mat.emissiveIntensity = 1.1 + breathe;
        }
        if (lightRef.current) {
            const [px, , pz] = position;
            const player = useStoryStore.getState().playerPosition;
            const dx = px - player[0];
            const dz = pz - player[2];
            const nearPlayer = dx * dx + dz * dz < 676; // within 26m
            lightRef.current.visible = nearPlayer;
            if (nearPlayer) lightRef.current.intensity = 1.6 + breathe * 0.8;
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
                {/* Glowing core */}
                <mesh ref={coreRef}>
                    <sphereGeometry args={[0.075, 8, 6]} />
                    <meshStandardMaterial
                        color={color}
                        emissive={new Color(color)}
                        emissiveIntensity={1.1}
                    />
                </mesh>
                <pointLight ref={lightRef} color={color} intensity={1.6} distance={12} decay={2} />
            </group>
        </group>
    );
}
