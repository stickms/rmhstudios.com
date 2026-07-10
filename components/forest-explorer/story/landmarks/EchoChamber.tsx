'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Mesh, type MeshStandardMaterial } from 'three';
import { useLandmarkState } from './useLandmarkState';

interface EchoChamberProps {
    position: [number, number, number];
    scale?: number;
    id: string;
}

/**
 * A natural amphitheater: a semicircle of tuned standing stones around a
 * resonating crystal bowl. Stones pulse in a travelling wave when revealed —
 * the forest humming its half-remembered song.
 */
export function EchoChamber({ position, scale = 1, id }: EchoChamberProps) {
    const { isRevealed, isSolved } = useLandmarkState(id);
    const stoneRefs = useRef<(Mesh | null)[]>([]);
    const bowlRef = useRef<Mesh>(null);

    const STONES = 7;

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        stoneRefs.current.forEach((ref, i) => {
            if (!ref) return;
            const mat = ref.material as MeshStandardMaterial;
            if (isSolved) {
                // Gentle travelling wave — the song plays itself now
                mat.emissiveIntensity = 0.3 + Math.max(0, Math.sin(t * 2 - i * 0.7)) * 0.6;
                mat.emissive.set('#44ffaa');
            } else if (isRevealed) {
                mat.emissiveIntensity = 0.15 + Math.max(0, Math.sin(t * 3 - i * 1.1)) * 0.45;
                mat.emissive.set('#ffaa66');
            } else {
                mat.emissiveIntensity = 0.03;
            }
        });
        if (bowlRef.current) {
            const mat = bowlRef.current.material as MeshStandardMaterial;
            mat.emissiveIntensity = isSolved
                ? 0.6 + Math.sin(t * 1.6) * 0.2
                : isRevealed ? 0.3 + Math.sin(t * 2.5) * 0.15 : 0.08;
        }
    });

    return (
        <group position={position} scale={scale}>
            {/* Raised earthen ring */}
            <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[6.4, 20]} />
                <meshLambertMaterial color="#3f3a2c" />
            </mesh>

            {/* Semicircle of tuned stones */}
            {Array.from({ length: STONES }, (_, i) => {
                const angle = Math.PI * 0.15 + (i / (STONES - 1)) * Math.PI * 0.7;
                const r = 5.2;
                const h = 1.6 + Math.sin((i / (STONES - 1)) * Math.PI) * 1.5;
                return (
                    <group key={i} position={[Math.cos(angle) * r, 0, -Math.sin(angle) * r]}>
                        <mesh position={[0, h / 2, 0]} rotation={[0, angle, 0]} castShadow>
                            <boxGeometry args={[0.7, h, 0.5]} />
                            <meshLambertMaterial color="#4e4c44" />
                        </mesh>
                        {/* Resonance vein */}
                        <mesh
                            ref={el => { stoneRefs.current[i] = el; }}
                            position={[0, h / 2, 0]}
                            rotation={[0, angle, 0]}
                        >
                            <boxGeometry args={[0.74, h * 0.7, 0.1]} />
                            <meshStandardMaterial
                                color="#221f18"
                                transparent
                                opacity={0.9}
                                emissive={new Color('#ffaa66')}
                                emissiveIntensity={0.03}
                            />
                        </mesh>
                    </group>
                );
            })}

            {/* Central resonating bowl */}
            <mesh position={[0, 0.35, 0]} castShadow>
                <cylinderGeometry args={[1.0, 0.7, 0.7, 9]} />
                <meshLambertMaterial color="#514c40" />
            </mesh>
            <mesh ref={bowlRef} position={[0, 0.74, 0]}>
                <sphereGeometry args={[0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                <meshStandardMaterial
                    color="#6a5a8a"
                    transparent
                    opacity={0.8}
                    emissive={new Color('#aa88ff')}
                    emissiveIntensity={0.08}
                    roughness={0.15}
                />
            </mesh>
            <pointLight position={[0, 1.4, 0]} color="#bb99ff" intensity={0.4} distance={8} decay={2} />
        </group>
    );
}
