'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Mesh, type MeshStandardMaterial } from 'three';
import { useLandmarkState } from './useLandmarkState';

interface ObservatoryProps {
    position: [number, number, number];
    scale?: number;
    id: string;
}

/**
 * A ruined hilltop observatory: a broken ring of pillars, a cracked dome
 * shell, and a brass stargazing tube still aimed at the last constellation.
 */
export function Observatory({ position, scale = 1, id }: ObservatoryProps) {
    const { isRevealed, isSolved } = useLandmarkState(id);
    const lensRef = useRef<Mesh>(null);

    const PILLARS = 8;

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (lensRef.current) {
            const mat = lensRef.current.material as MeshStandardMaterial;
            if (isSolved) {
                mat.emissiveIntensity = 0.8 + Math.sin(t * 1.4) * 0.25;
                mat.emissive.set('#88ddff');
            } else if (isRevealed) {
                mat.emissiveIntensity = 0.45 + Math.sin(t * 2.6) * 0.2;
                mat.emissive.set('#ffcc88');
            } else {
                mat.emissiveIntensity = 0.1;
            }
        }
    });

    return (
        <group position={position} scale={scale}>
            {/* Stone platform */}
            <mesh position={[0, 0.25, 0]} castShadow>
                <cylinderGeometry args={[4.6, 5.0, 0.5, 12]} />
                <meshLambertMaterial color="#57534a" />
            </mesh>
            <mesh position={[0, 0.55, 0]}>
                <cylinderGeometry args={[3.8, 4.2, 0.2, 12]} />
                <meshLambertMaterial color="#615c50" />
            </mesh>

            {/* Broken pillar ring — some standing, some toppled */}
            {Array.from({ length: PILLARS }, (_, i) => {
                const angle = (i / PILLARS) * Math.PI * 2;
                const r = 3.9;
                const x = Math.cos(angle) * r;
                const z = Math.sin(angle) * r;
                const broken = i % 3 === 1;
                const h = broken ? 1.1 + (i % 2) * 0.5 : 3.2;
                return (
                    <group key={i}>
                        <mesh position={[x, 0.5 + h / 2, z]} castShadow>
                            <cylinderGeometry args={[0.28, 0.34, h, 7]} />
                            <meshLambertMaterial color="#5d584c" />
                        </mesh>
                        {broken && (
                            <mesh
                                position={[x * 1.2, 0.35, z * 1.2]}
                                rotation={[Math.PI / 2.3, angle, 0.4]}
                                castShadow
                            >
                                <cylinderGeometry args={[0.26, 0.3, 1.6, 7]} />
                                <meshLambertMaterial color="#55503f" />
                            </mesh>
                        )}
                    </group>
                );
            })}

            {/* Cracked dome shell (a third remains) */}
            <mesh position={[0, 3.6, 0]} rotation={[0, 0.8, 0.15]}>
                <sphereGeometry args={[4.1, 14, 8, 0, Math.PI * 0.75, 0, Math.PI * 0.45]} />
                <meshLambertMaterial color="#4a463c" side={2} />
            </mesh>

            {/* Brass stargazing tube on a tripod, aimed at the sky */}
            <group position={[0, 0.65, 0]} rotation={[0, -0.6, 0]}>
                {[0, 1, 2].map(i => (
                    <mesh
                        key={i}
                        position={[Math.cos((i / 3) * Math.PI * 2) * 0.5, 0.55, Math.sin((i / 3) * Math.PI * 2) * 0.5]}
                        rotation={[Math.cos((i / 3) * Math.PI * 2) * 0.4, 0, Math.sin((i / 3) * Math.PI * 2) * -0.4]}
                    >
                        <cylinderGeometry args={[0.04, 0.05, 1.2, 5]} />
                        <meshLambertMaterial color="#3c342a" />
                    </mesh>
                ))}
                <mesh position={[0, 1.35, 0]} rotation={[0, 0, -0.7]} castShadow>
                    <cylinderGeometry args={[0.14, 0.2, 1.9, 8]} />
                    <meshStandardMaterial color="#8a6a3a" metalness={0.6} roughness={0.35} />
                </mesh>
                {/* Lens glint */}
                <mesh ref={lensRef} position={[0.75, 2.05, 0]} rotation={[0, 0, -0.7]}>
                    <cylinderGeometry args={[0.15, 0.15, 0.06, 10]} />
                    <meshStandardMaterial
                        color="#aaccee"
                        emissive={new Color('#ffcc88')}
                        emissiveIntensity={0.1}
                        transparent
                        opacity={0.95}
                    />
                </mesh>
            </group>

            <pointLight position={[0, 2.5, 0]} color="#aabbff" intensity={0.35} distance={10} decay={2} />
        </group>
    );
}
