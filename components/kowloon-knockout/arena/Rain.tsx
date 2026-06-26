'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useRenderTier } from './RenderTierContext';
import { particleBudget } from '@/lib/kowloon-knockout/render/particles/budget';
import { seedRain, type ParticleBounds } from '@/lib/kowloon-knockout/render/particles/seed';

export const RAIN_BOUNDS: ParticleBounds = { radius: 16, floor: 0, ceiling: 18 };
const RAIN_COLOR = new THREE.Color('#7fd4ff'); // cool neon drizzle

/** Ambient neon rain. CPU instanced integration (medium tier + the fallback for
 *  ultra/high when compute is unavailable). Drops fall + drift and wrap back to
 *  the ceiling at the floor. */
export default function Rain() {
    const { tier } = useRenderTier();
    const count = particleBudget(tier).rain;

    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const field = useMemo(() => (count > 0 ? seedRain(count, RAIN_BOUNDS, 5150) : null), [count]);

    useFrame((_, deltaRaw) => {
        const mesh = meshRef.current;
        if (!mesh || !field) return;
        const dt = Math.min(0.05, deltaRaw);
        const { positions, velocities } = field;
        for (let i = 0; i < count; i++) {
            let y = positions[i * 3 + 1] + velocities[i * 3 + 1] * dt;
            const x = positions[i * 3] + velocities[i * 3] * dt;
            const z = positions[i * 3 + 2] + velocities[i * 3 + 2] * dt;
            if (y < RAIN_BOUNDS.floor) { y = RAIN_BOUNDS.ceiling; }   // recycle
            positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
            dummy.position.set(x, y, z);
            dummy.scale.set(0.02, 0.5, 0.02);                        // thin vertical streak
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    });

    if (count === 0) return null;

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={RAIN_COLOR} toneMapped={false} transparent opacity={0.5}
                blending={THREE.AdditiveBlending} depthWrite={false} />
        </instancedMesh>
    );
}
