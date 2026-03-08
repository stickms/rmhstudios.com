'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, BufferAttribute, type Points, type PointsMaterial } from 'three';

export function Fireflies({ night }: { night: boolean }) {
    const pointsRef = useRef<Points>(null);
    const COUNT = 60;

    const { geometry, phases } = useMemo(() => {
        const positions = new Float32Array(COUNT * 3);
        const ph: number[] = [];
        for (let i = 0; i < COUNT; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 70;
            positions[i * 3 + 1] = 0.5 + Math.random() * 3.5;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
            ph.push(Math.random() * Math.PI * 2);
        }
        const geo = new BufferGeometry();
        geo.setAttribute('position', new BufferAttribute(positions, 3));
        return { geometry: geo, phases: ph };
    }, []);

    useFrame((state) => {
        if (!pointsRef.current) return;
        const pos = pointsRef.current.geometry.attributes.position.array as Float32Array;
        const t = state.clock.elapsedTime;
        for (let i = 0; i < COUNT; i++) {
            pos[i * 3 + 1] =
                1.2 + Math.sin(t * 1.4 + phases[i]) * 0.6 + Math.sin(t * 0.6 + phases[i] * 2) * 0.3;
        }
        pointsRef.current.geometry.attributes.position.needsUpdate = true;
        const mat = pointsRef.current.material as PointsMaterial;
        const base = night ? 0.72 : 0.45;
        mat.opacity = base + Math.sin(t * 1.5) * 0.2;
        mat.size = night ? 0.09 : 0.065;
    });

    return (
        <points ref={pointsRef} geometry={geometry}>
            <pointsMaterial color="#d4ff70" size={0.065} transparent opacity={0.6} sizeAttenuation />
        </points>
    );
}
