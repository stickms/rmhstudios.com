'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three/webgpu';
import { useRenderTier } from './RenderTierContext';
import { generateSkyline } from '@/lib/kowloon-knockout/render/skyline';
import { NEON_PALETTE } from './materials';

const NEON = NEON_PALETTE;

const TIER_LAYERS: Record<string, number> = { ultra: 3, high: 2, medium: 1, low: 0 };
const SKYLINE_SEED = 1337;

function SkylineLayer({ instances }: { instances: ReturnType<typeof generateSkyline>[number] }) {
    const ref = useRef<THREE.InstancedMesh>(null);
    const tmp = useMemo(() => new THREE.Object3D(), []);
    const color = useMemo(() => new THREE.Color(), []);

    useLayoutEffect(() => {
        const mesh = ref.current;
        if (!mesh) return;
        instances.forEach((t, i) => {
            tmp.position.set(...t.position);
            tmp.rotation.set(0, 0, 0);
            tmp.scale.set(...t.scale);
            tmp.updateMatrix();
            mesh.setMatrixAt(i, tmp.matrix);
            mesh.setColorAt(i, color.setRGB(t.color[0], t.color[1], t.color[2]));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }, [instances, tmp, color]);

    return (
        <instancedMesh ref={ref} args={[undefined, undefined, instances.length]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial vertexColors toneMapped={false} />
        </instancedMesh>
    );
}

/** Neon-Kowloon backdrop: skyline towers + floating sign strips.
 *  Extracted from Environment so the arena stage and the backdrop evolve
 *  independently (Phase 2). Currently a verbatim move — parity with the
 *  previous in-Environment rendering. */
export default function Skyline() {
    const towers = useMemo(() => {
        const arr: { pos: [number, number, number]; size: [number, number, number]; color: string }[] = [];
        const count = 46;
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + Math.random() * 0.1;
            const dist = 22 + Math.random() * 16;
            const h = 8 + Math.random() * 30;
            const w = 2.5 + Math.random() * 3.5;
            arr.push({
                pos: [Math.cos(a) * dist, h / 2 - 1, Math.sin(a) * dist],
                size: [w, h, w],
                color: NEON[Math.floor(Math.random() * NEON.length)],
            });
        }
        return arr;
    }, []);

    const signs = useMemo(() => {
        const arr: { pos: [number, number, number]; h: number; color: string }[] = [];
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            const dist = 14 + Math.random() * 6;
            arr.push({
                pos: [Math.cos(a) * dist, 3 + Math.random() * 9, Math.sin(a) * dist],
                h: 2 + Math.random() * 4,
                color: NEON[Math.floor(Math.random() * NEON.length)],
            });
        }
        return arr;
    }, []);

    const { tier } = useRenderTier();
    const layerCount = TIER_LAYERS[tier] ?? 0;
    const layers = useMemo(() => generateSkyline(SKYLINE_SEED, layerCount), [layerCount]);

    // Higher tiers: instanced multi-layer skyline. The `signs` group from Task 2
    // is rendered alongside it (signs are kept as individual meshes for Task 6's
    // per-sign animation). Hooks above run every render regardless of branch.
    if (layerCount > 0) {
        return (
            <group>
                {layers.map((inst, i) => <SkylineLayer key={i} instances={inst} />)}
                {signs.map((s, i) => (
                    <mesh key={`s${i}`} position={s.pos}>
                        <boxGeometry args={[0.4, s.h, 0.1]} />
                        <meshBasicMaterial color={s.color} toneMapped={false} />
                    </mesh>
                ))}
            </group>
        );
    }
    // low tier: fall through to the existing Task-2 static towers+signs return below.

    return (
        <group>
            {towers.map((t, i) => (
                <mesh key={`t${i}`} position={t.pos}>
                    <boxGeometry args={t.size} />
                    <meshStandardMaterial color="#0a0a14" emissive={t.color} emissiveIntensity={0.5} flatShading toneMapped={false} />
                </mesh>
            ))}
            {signs.map((s, i) => (
                <mesh key={`s${i}`} position={s.pos}>
                    <boxGeometry args={[0.4, s.h, 0.1]} />
                    <meshBasicMaterial color={s.color} toneMapped={false} />
                </mesh>
            ))}
        </group>
    );
}
