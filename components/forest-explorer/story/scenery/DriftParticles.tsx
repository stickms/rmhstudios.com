'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, BufferAttribute, AdditiveBlending, type Points, type PointsMaterial } from 'three';

interface DriftParticlesProps {
    /** 'embers' rise and flicker (act 2) · 'petals' drift down and sideways (act 3) */
    mode: 'embers' | 'petals';
    count?: number;
    color?: string;
    area?: number;
}

/**
 * Lightweight ambient particles: rising embers for the burnt dusk of Act 2,
 * falling petals for the dawn grove of Act 3. One Points draw either way.
 */
export function DriftParticles({ mode, count = 90, color, area = 110 }: DriftParticlesProps) {
    const pointsRef = useRef<Points>(null);

    const { geometry, speeds, phases } = useMemo(() => {
        const positions = new Float32Array(count * 3);
        const sp: number[] = [];
        const ph: number[] = [];
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * area;
            positions[i * 3 + 1] = Math.random() * 12;
            positions[i * 3 + 2] = (Math.random() - 0.5) * area;
            sp.push(0.4 + Math.random() * 0.9);
            ph.push(Math.random() * Math.PI * 2);
        }
        const geo = new BufferGeometry();
        geo.setAttribute('position', new BufferAttribute(positions, 3));
        return { geometry: geo, speeds: sp, phases: ph };
    }, [count, area]);

    useFrame((state, delta) => {
        if (!pointsRef.current) return;
        const pos = pointsRef.current.geometry.attributes.position.array as Float32Array;
        const t = state.clock.elapsedTime;

        for (let i = 0; i < count; i++) {
            if (mode === 'embers') {
                pos[i * 3 + 1] += speeds[i] * delta * 1.6;
                pos[i * 3] += Math.sin(t * 1.2 + phases[i]) * delta * 0.6;
                if (pos[i * 3 + 1] > 13) pos[i * 3 + 1] = 0.2;
            } else {
                pos[i * 3 + 1] -= speeds[i] * delta * 0.8;
                pos[i * 3] += Math.sin(t * 0.8 + phases[i]) * delta * 1.2;
                pos[i * 3 + 2] += Math.cos(t * 0.6 + phases[i]) * delta * 0.8;
                if (pos[i * 3 + 1] < 0.1) pos[i * 3 + 1] = 11 + Math.random() * 2;
            }
        }
        pointsRef.current.geometry.attributes.position.needsUpdate = true;

        const mat = pointsRef.current.material as PointsMaterial;
        mat.opacity = mode === 'embers'
            ? 0.55 + Math.sin(t * 2.2) * 0.2
            : 0.7;
    });

    return (
        <points ref={pointsRef} geometry={geometry}>
            <pointsMaterial
                color={color ?? (mode === 'embers' ? '#ff9950' : '#ffc9d8')}
                size={mode === 'embers' ? 0.09 : 0.14}
                transparent
                opacity={0.6}
                sizeAttenuation
                blending={mode === 'embers' ? AdditiveBlending : undefined}
                depthWrite={false}
            />
        </points>
    );
}
