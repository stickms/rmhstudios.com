'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Group, type Mesh, type MeshStandardMaterial } from 'three';
import { useLandmarkState } from './useLandmarkState';

interface ShatteredMonumentProps {
    position: [number, number, number];
    scale?: number;
    id: string;
}

/**
 * A broken obelisk whose upper fragments hang suspended in the air,
 * slowly orbiting — held by the same memory that shattered them.
 * When the glyph puzzle is solved the fragments settle and glow green.
 */
export function ShatteredMonument({ position, scale = 1, id }: ShatteredMonumentProps) {
    const { isRevealed, isSolved } = useLandmarkState(id);
    const fragmentsRef = useRef<Group>(null);
    const glyphRef = useRef<Mesh>(null);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (fragmentsRef.current) {
            // Fragments drift while broken; settle once restored
            const drift = isSolved ? 0 : 1;
            fragmentsRef.current.rotation.y = isSolved
                ? fragmentsRef.current.rotation.y * 0.97
                : t * 0.12;
            fragmentsRef.current.children.forEach((child, i) => {
                const base = 2.6 + i * 0.55;
                child.position.y = base + Math.sin(t * 0.9 + i * 1.7) * 0.12 * drift;
            });
        }
        if (glyphRef.current) {
            const mat = glyphRef.current.material as MeshStandardMaterial;
            if (isSolved) {
                mat.emissiveIntensity = 0.9 + Math.sin(t * 1.8) * 0.25;
                mat.emissive.set('#44ffaa');
            } else if (isRevealed) {
                mat.emissiveIntensity = 0.4 + Math.sin(t * 3) * 0.2;
                mat.emissive.set('#cc88ff');
            } else {
                mat.emissiveIntensity = 0.12;
            }
        }
    });

    return (
        <group position={position} scale={scale}>
            {/* Base plinth */}
            <mesh position={[0, 0.4, 0]} castShadow>
                <boxGeometry args={[2.6, 0.8, 2.6]} />
                <meshLambertMaterial color="#5b564a" />
            </mesh>
            <mesh position={[0, 0.95, 0]} castShadow>
                <boxGeometry args={[1.9, 0.3, 1.9]} />
                <meshLambertMaterial color="#655f50" />
            </mesh>

            {/* Standing lower obelisk section with the glyph face */}
            <mesh position={[0, 1.9, 0]} castShadow>
                <cylinderGeometry args={[0.55, 0.75, 1.6, 4]} />
                <meshLambertMaterial color="#615c4e" />
            </mesh>
            <mesh ref={glyphRef} position={[0, 1.9, 0.48]} rotation={[0, Math.PI / 4, 0]}>
                <circleGeometry args={[0.42, 16]} />
                <meshStandardMaterial
                    color="#2c2a24"
                    emissive={new Color('#cc88ff')}
                    emissiveIntensity={0.12}
                    side={2}
                />
            </mesh>

            {/* Suspended fragments */}
            <group ref={fragmentsRef}>
                {Array.from({ length: 5 }, (_, i) => {
                    const angle = (i / 5) * Math.PI * 2;
                    const r = 0.5 + (i % 2) * 0.4;
                    return (
                        <mesh
                            key={i}
                            position={[Math.cos(angle) * r, 2.6 + i * 0.55, Math.sin(angle) * r]}
                            rotation={[i * 0.7, angle, i * 0.4]}
                            castShadow
                        >
                            <cylinderGeometry args={[0.3 - i * 0.04, 0.42 - i * 0.05, 0.5, 4]} />
                            <meshLambertMaterial color="#5e594b" />
                        </mesh>
                    );
                })}
            </group>

            {/* Scattered rubble */}
            {[[-1.8, 1.2], [1.6, -0.8], [0.8, 1.9], [-1.2, -1.6]].map(([x, z], i) => (
                <mesh key={`rubble-${i}`} position={[x, 0.18, z]} rotation={[0.3, i * 2.1, 0.2]} castShadow>
                    <dodecahedronGeometry args={[0.3, 0]} />
                    <meshLambertMaterial color="#57524a" />
                </mesh>
            ))}

            <pointLight position={[0, 3, 0]} color={isSolved ? '#66ffaa' : '#bb88ee'} intensity={0.45} distance={10} decay={2} />
        </group>
    );
}
