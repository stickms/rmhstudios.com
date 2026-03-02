'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const CLOUD_PUFFS: [number, number, number, number][] = [
    [0,    0,   0,   2.2],
    [2.2,  0.5, 0,   1.8],
    [-2.0, 0.4, 0.3, 1.6],
    [1.0,  1.2, 0,   1.3],
    [-0.8, 1.1, 0.2, 1.1],
    [3.2, -0.2, 0.2, 1.2],
    [-3.0,-0.2,-0.2, 1.1],
    [0.3,  1.8, 0,   0.9],
];

function CloudPuff({ position, scale, color }: { position: [number, number, number]; scale: number; color: string }) {
    return (
        <group position={position} scale={scale}>
            {CLOUD_PUFFS.map(([x, y, z, r], i) => (
                <mesh key={i} position={[x, y, z]}>
                    <sphereGeometry args={[r, 7, 5]} />
                    <meshLambertMaterial color={color} transparent opacity={0.82} />
                </mesh>
            ))}
        </group>
    );
}

export function Clouds({ night }: { night: boolean }) {
    const cloudData = useMemo(() => {
        const rng = (n: number) => { const x = Math.sin(n + 1) * 43758.5453; return x - Math.floor(x); };
        return Array.from({ length: 14 }, (_, i) => ({
            id: i,
            x: (rng(i * 7.33) - 0.5) * 220,
            y: 42 + rng(i * 3.11) * 18,
            z: (rng(i * 11.71) - 0.5) * 220,
            scale: 0.9 + rng(i * 5.9) * 1.4,
            speed: 0.6 + rng(i * 2.3) * 0.8,
        }));
    }, []);

    const refs = useRef<(THREE.Group | null)[]>([]);

    useFrame((_, delta) => {
        refs.current.forEach((ref, i) => {
            if (!ref) return;
            ref.position.x += cloudData[i].speed * delta;
            if (ref.position.x > 120) ref.position.x = -120;
        });
    });

    const cloudColor = night ? '#1a1f2a' : '#f0f4f0';

    return (
        <>
            {cloudData.map((c, i) => (
                <group key={c.id} ref={(el) => { refs.current[i] = el; }} position={[c.x, c.y, c.z]}>
                    <CloudPuff position={[0, 0, 0]} scale={c.scale} color={cloudColor} />
                </group>
            ))}
        </>
    );
}
