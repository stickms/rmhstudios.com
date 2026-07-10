'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Mesh, type MeshStandardMaterial } from 'three';
import { useLandmarkState } from './useLandmarkState';

interface CrystalClusterProps {
    position: [number, number, number];
    scale?: number;
    id: string;
}

export function CrystalCluster({ position, scale = 1, id }: CrystalClusterProps) {
    const crystalRefs = useRef<(Mesh | null)[]>([]);
    const { isRevealed, isSolved } = useLandmarkState(id);

    const crystals = [
        { pos: [0, 1.2, 0] as [number, number, number], h: 2.4, r: 0.25, rot: 0.1, color: '#66aadd' },
        { pos: [0.6, 0.8, 0.3] as [number, number, number], h: 1.6, r: 0.18, rot: -0.15, color: '#88ccee' },
        { pos: [-0.4, 1.0, -0.5] as [number, number, number], h: 2.0, r: 0.22, rot: 0.2, color: '#5588cc' },
        { pos: [0.3, 0.6, -0.4] as [number, number, number], h: 1.2, r: 0.15, rot: -0.1, color: '#77bbdd' },
        { pos: [-0.5, 0.7, 0.4] as [number, number, number], h: 1.4, r: 0.16, rot: 0.25, color: '#99ddff' },
    ];

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        crystalRefs.current.forEach((ref, i) => {
            if (!ref) return;
            const mat = ref.material as MeshStandardMaterial;
            if (isSolved) {
                mat.emissiveIntensity = 0.35 + Math.sin(t * 1.2 + i) * 0.15;
                mat.emissive.set('#66ffaa');
            } else if (isRevealed) {
                mat.emissiveIntensity = 0.5 + Math.sin(t * 2 + i) * 0.3;
            } else {
                mat.emissiveIntensity = 0.05;
            }
        });
    });

    return (
        <group position={position} scale={scale}>
            {/* Base rock */}
            <mesh position={[0, 0.3, 0]} castShadow>
                <dodecahedronGeometry args={[0.8, 1]} />
                <meshLambertMaterial color="#4a4a40" />
            </mesh>
            {/* Crystal shards */}
            {crystals.map((c, i) => (
                <mesh
                    key={i}
                    ref={(el) => { crystalRefs.current[i] = el; }}
                    position={c.pos}
                    rotation={[c.rot, i * 1.2, c.rot * 0.5]}
                    castShadow
                >
                    <coneGeometry args={[c.r, c.h, 5]} />
                    <meshStandardMaterial
                        color={c.color}
                        transparent
                        opacity={0.75}
                        emissive={new Color(c.color)}
                        emissiveIntensity={0.05}
                        roughness={0.1}
                        metalness={0.3}
                    />
                </mesh>
            ))}
        </group>
    );
}
