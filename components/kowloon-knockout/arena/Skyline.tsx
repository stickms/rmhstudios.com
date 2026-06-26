'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three/webgpu';
import { useFrame } from '@react-three/fiber';
import { useRenderTier } from './RenderTierContext';
import { generateSkyline } from '@/lib/kowloon-knockout/render/skyline';
import { NEON_PALETTE } from './materials';
import { signAnim } from '@/lib/kowloon-knockout/render/signage';

const NEON = NEON_PALETTE;

const TIER_LAYERS: Record<string, number> = { ultra: 3, high: 2, medium: 1, low: 0 };

/** Per-sign animated neon strip — Path B (useFrame + Math.sin).
 *  TSL path skipped to avoid runtime crashes; cheap CPU-side color update. */
function NeonSign({ pos, h, color, index }: {
    pos: [number, number, number];
    h: number;
    color: string;
    index: number;
}) {
    const matRef = useRef<THREE.MeshBasicMaterial>(null);
    const anim = useMemo(() => signAnim(index), [index]);
    const baseColor = useMemo(() => new THREE.Color(color), [color]);

    useFrame(({ clock }) => {
        const mat = matRef.current;
        if (!mat) return;
        const t = clock.elapsedTime;
        const raw = Math.sin(t * anim.speed + anim.phase) * 0.5 + 0.5; // 0..1
        let intensity: number;
        if (anim.pattern === 'dropout') {
            // occasional dead-sign: snap to near-dark when trough is deep
            intensity = raw < 0.15 ? 0.04 : raw;
        } else if (anim.pattern === 'scroll') {
            // stays relatively bright, narrower oscillation
            intensity = 0.4 + raw * 0.6;
        } else {
            // pulse: full 0..1 range
            intensity = raw;
        }
        mat.color.setRGB(
            baseColor.r * intensity,
            baseColor.g * intensity,
            baseColor.b * intensity,
        );
    });

    return (
        <mesh position={pos}>
            <boxGeometry args={[0.4, h, 0.1]} />
            <meshBasicMaterial ref={matRef} color={color} toneMapped={false} />
        </mesh>
    );
}

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
                    <NeonSign key={`s${i}`} pos={s.pos} h={s.h} color={s.color} index={i} />
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
                <NeonSign key={`s${i}`} pos={s.pos} h={s.h} color={s.color} index={i} />
            ))}
        </group>
    );
}
