'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function Mist() {
    const pointsRef = useRef<THREE.Points>(null);
    const COUNT = 350;

    const geometry = useMemo(() => {
        const positions = new Float32Array(COUNT * 3);
        for (let i = 0; i < COUNT; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 160;
            positions[i * 3 + 1] = Math.random() * 0.7;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 160;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        return geo;
    }, []);

    useFrame((state) => {
        if (pointsRef.current) {
            pointsRef.current.rotation.y = state.clock.elapsedTime * 0.004;
        }
    });

    return (
        <points ref={pointsRef} geometry={geometry}>
            <pointsMaterial color="#c8e6c0" size={0.9} transparent opacity={0.07} sizeAttenuation />
        </points>
    );
}
