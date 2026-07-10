'use client';

import { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameSession } from '@/lib/kowloon-knockout/net/session';
import { useRenderTier } from './RenderTierContext';
import { particleBudget } from '@/lib/kowloon-knockout/render/particles/budget';
import { stepParticle, type BurstParticle, type BurstKind } from '@/lib/kowloon-knockout/render/particles/burst';

const BLACK = new THREE.Color('#000000');

/** Pooled, instanced event bursts (hit/block/KO) driven by the session FX
 *  queue. Beefed in Phase 3: debris + smoke + sparks, tier-scaled cap. Stays on
 *  the CPU — bursts are bounded, event-emitted, and momentary (the GPU-emission
 *  path is the deliberately-avoided risk; see the Phase 3 spec). */
export default function Fx({ session }: { session: GameSession }) {
    const { tier } = useRenderTier();
    const MAX = particleBudget(tier).burstCap;

    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    // Live particle count, so idle frames (no bursts on screen) can skip the
    // whole integrate + per-instance write + buffer upload.
    const activeRef = useRef(0);
    const pool = useMemo<(BurstParticle & { color: THREE.Color })[]>(
        () => Array.from({ length: MAX }, () => ({
            x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1,
            size: 0.2, kind: 'spark' as BurstKind, active: false, color: new THREE.Color(),
        })),
        [MAX],
    );

    const spawn = (
        n: number, kind: BurstKind, x: number, y: number, z: number,
        color: THREE.Color, power: number,
    ) => {
        for (let s = 0; s < n; s++) {
            const p = pool.find((q) => !q.active);
            if (!p) return;
            const a = Math.random() * Math.PI * 2;
            const up = Math.random() * 0.8 + 0.2;
            const spd = (kind === 'smoke' ? 0.6 : 1.5) + Math.random() * power;
            p.x = x; p.y = y; p.z = z;
            p.vx = Math.cos(a) * spd;
            p.vy = up * spd;
            p.vz = Math.sin(a) * spd;
            p.kind = kind;
            p.maxLife = kind === 'smoke' ? 0.9 + Math.random() * 0.6
                : kind === 'debris' ? 0.6 + Math.random() * 0.5
                : 0.35 + Math.random() * 0.3;
            p.life = p.maxLife;
            p.size = kind === 'smoke' ? 0.22 + Math.random() * 0.16
                : kind === 'debris' ? 0.1 + Math.random() * 0.12
                : 0.12 + Math.random() * 0.12;
            p.color.copy(color);
            p.active = true;
        }
    };

    // Zero every instance once on mount (and on cap change) so slots we never
    // touch while idle-skipping don't render at the identity transform (origin,
    // unit scale). After this, the frame loop only needs to run when alive.
    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        for (let i = 0; i < MAX; i++) mesh.setMatrixAt(i, dummy.matrix);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.visible = false;   // hidden until a burst spawns — skips the idle draw
        activeRef.current = 0;
    }, [MAX, dummy]);

    useFrame((_, deltaRaw) => {
        const mesh = meshRef.current;
        if (!mesh) return;
        const delta = Math.min(0.05, deltaRaw);

        let spawned = false;
        for (const e of session.drainFx()) {
            spawned = true;
            if (e.kind === 'hit') {
                const c = new THREE.Color(e.color);
                spawn(Math.min(22, 8 + Math.round(e.power)), 'spark', e.x, e.y, e.z, c, 3.5);
                spawn(Math.min(8, 3 + Math.round(e.power * 0.5)), 'debris', e.x, e.y, e.z, c, 2.5);
                // One dim, subtle puff per hit — additive grey, so punches read
                // as a flash and a wisp, not a cloud.
                spawn(1, 'smoke', e.x, e.y, e.z, new THREE.Color('#3a3a44'), 0.8);
            } else if (e.kind === 'block') {
                spawn(8, 'spark', e.x, e.y, e.z, new THREE.Color('#cfe8ff'), 2);
            } else if (e.kind === 'ko') {
                spawn(40, 'spark', e.x, 1.1, e.z, new THREE.Color('#ffcc00'), 5);
                spawn(28, 'debris', e.x, 1.1, e.z, new THREE.Color('#ffcc00'), 4);
                // KO keeps a real smoke burst — the climactic moment — but dim
                // and restrained.
                spawn(8, 'smoke', e.x, 1.1, e.z, new THREE.Color('#5a5a66'), 1.2);
            }
        }

        // Idle skip: nothing alive and no new event this frame → instances are
        // already zeroed (last live frame or the mount init), so there is no
        // work and no buffer upload to do.
        if (activeRef.current === 0 && !spawned) return;

        let active = 0;
        for (let i = 0; i < MAX; i++) {
            const p = pool[i];
            if (p.active) stepParticle(p, delta);
            if (p.active) active++;
            const frac = p.active ? p.life / p.maxLife : 0;
            // smoke grows as it fades; spark/debris shrink with life.
            const s = p.kind === 'smoke' ? p.size : p.size * frac;
            dummy.position.set(p.x, p.y, p.z);
            dummy.scale.setScalar(p.active ? s : 0);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            mesh.setColorAt(i, p.active ? p.color : BLACK);
        }
        activeRef.current = active;
        mesh.visible = active > 0;   // hide the mesh when the last burst dies
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, MAX]} frustumCulled={false}>
            <icosahedronGeometry args={[1, 0]} />
            <meshBasicMaterial toneMapped={false} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
        </instancedMesh>
    );
}
